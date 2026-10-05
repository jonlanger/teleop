// The fleet service: runs the vehicles, carries commands to them over a simulated link,
// and keeps alerts, the command audit trail, logs and telemetry history.
import type { Alert, ClientMsg, Command, LogEntry, LogLevel, LogSource, ResourceName, ServerMsg, TelemetryPoint, Ticket, User } from "../shared/types.ts";
import { COMMAND_LABEL, NEEDS_CONTROL, kmh } from "../shared/controls.ts";
import { Vehicle } from "./sim/vehicle.ts";
import { CUSTOMER_TEMPLATES, VEHICLE_SEEDS, normalizeTicket, rider } from "./seed.ts";
import { routeById } from "../shared/site.ts";
import { save, type Db } from "./store.ts";

const TICK_MS = 50, BROADCAST_MS = 100, HISTORY_S = 900, LOG_CAP = 6000, CMD_CAP = 2000, TIMEOUT_MS = 2500;

export class Fleet {
  vehicles = new Map<string, Vehicle>();
  alerts: Alert[] = [];
  commands: Command[] = [];
  logs: LogEntry[] = [];
  history = new Map<string, TelemetryPoint[]>();
  private seq = 0;
  private pendingLogs: LogEntry[] = [];
  private listeners = new Set<(m: ServerMsg) => void>();
  private alertSeq = 0;

  constructor(public db: Db) {
    const now = Date.now();
    const hooks = {
      log: (level: LogLevel, source: LogSource, msg: string, data?: Record<string, unknown>) => {
        const { vehicleId, ...rest } = (data ?? {}) as { vehicleId?: string };
        this.log(level, source, msg, vehicleId, Object.keys(rest).length ? rest : undefined);
      },
      alert: (a: Omit<Alert, "id" | "at">) => this.raise(a),
      closeAlerts: (m: (a: Alert) => boolean) => this.closeAlerts(m),
      fault: (vehicleId: string, f: { code: string; text: string; severity: "warning" | "critical" }, isNew: boolean) => {
        this.log(f.severity === "critical" ? "error" : "warn", "vehicle", `Fault ${f.code}: ${f.text}`, vehicleId);
        if (isNew) this.raise({ severity: f.severity, title: f.text, detail: `Fault ${f.code}. See Engineering → Maintenance.`, vehicleId });
      },
    };
    for (const seed of VEHICLE_SEEDS) {
      const v = new Vehicle({ ...seed, service: db.service[seed.id] ?? seed.service }, hooks, now);
      this.vehicles.set(v.id, v);
      this.history.set(v.id, []);
    }
    this.log("info", "server", `Fleet service started with ${this.vehicles.size} vehicles`);

    let last = performance.now();
    setInterval(() => {
      const t = performance.now(), dt = Math.min(0.2, (t - last) / 1000); last = t;
      const now = Date.now();
      for (const v of this.vehicles.values()) v.tick(dt, now);
    }, TICK_MS);
    setInterval(() => {
      this.emit({ t: "fleet", now: Date.now(), vehicles: this.snapshot() });
      if (this.pendingLogs.length) { this.emit({ t: "logs", entries: this.pendingLogs }); this.pendingLogs = []; }
    }, BROADCAST_MS);
    setInterval(() => this.sample(), 1000);
    this.scheduleInbound(now + (60 + Math.random() * 120) * 1000);
  }

  snapshot() { return [...this.vehicles.values()].map((v) => v.s); }
  subscribe(fn: (m: ServerMsg) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(m: ServerMsg) { for (const fn of this.listeners) fn(m); }
  invalidate(resource: ResourceName) { this.emit({ t: "invalidate", resource }); }
  user(id: string) { return this.db.users.find((u) => u.id === id); }

  log(level: LogLevel, source: LogSource, msg: string, vehicleId?: string, data?: Record<string, unknown>) {
    const e: LogEntry = { seq: ++this.seq, t: Date.now(), level, source, msg, ...(vehicleId ? { vehicleId } : {}), ...(data ? { data } : {}) };
    this.logs.push(e);
    if (this.logs.length > LOG_CAP) this.logs.splice(0, this.logs.length - LOG_CAP);
    this.pendingLogs.push(e);
    return e;
  }

  raise(a: Omit<Alert, "id" | "at">): Alert {
    const alert: Alert = { ...a, id: `al_${(++this.alertSeq).toString(36)}_${Date.now().toString(36)}`, at: Date.now() };
    this.alerts.unshift(alert);
    if (this.alerts.length > 300) this.alerts.length = 300;
    this.emit({ t: "alert", alert });
    return alert;
  }

  closeAlerts(match: (a: Alert) => boolean) {
    for (const a of this.alerts) if (!a.closed && match(a)) { a.closed = true; this.emit({ t: "alert", alert: a }); }
  }

  ack(alertId: string, userId: string) {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a || a.acknowledgedBy) return;
    a.acknowledgedBy = userId;
    this.log("info", "ops", `Alert acknowledged: ${a.title}`, a.vehicleId, { by: userId });
    this.emit({ t: "alert", alert: a });
  }

  private sample() {
    const t = Date.now();
    for (const v of this.vehicles.values()) {
      const s = v.s, h = this.history.get(v.id)!;
      h.push({ t, speedKmh: kmh(s.speed), latencyMs: s.link.latencyMs, soc: +s.power.soc.toFixed(1), motorC: +s.thermal.motorC.toFixed(1),
        computeC: +s.thermal.computeC.toFixed(1), cpuPct: Math.round(s.compute.cpuPct), steerDeg: +s.drive.steerDeg.toFixed(1), steerCmdDeg: +s.drive.steerCmdDeg.toFixed(1), lossPct: s.link.lossPct });
      if (h.length > HISTORY_S) h.splice(0, h.length - HISTORY_S);
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────

  private update(c: Command) { this.emit({ t: "cmd", command: { ...c } }); }

  private reject(c: Command, reason: string, by: "server" | "vehicle") {
    c.status = "rejected"; c.reason = reason; c.rejectedBy = by; c.doneAt = Date.now();
    this.log("warn", by === "server" ? "server" : "vehicle", `${COMMAND_LABEL[c.kind]} rejected: ${reason}`, c.vehicleId, { cmd: c.id });
    this.update(c);
  }

  /** Server-side policy: who may send what. The vehicle applies its own physical checks after this. */
  private authorize(c: Command, u: User | undefined, v: Vehicle | undefined): string | null {
    if (!u) return "Unknown user";
    if (!v) return "Unknown vehicle";
    const s = v.s;
    const engineering = c.kind === "diag.run" || c.kind === "sys.restart" || c.kind === "fault.clear";
    if (engineering) return u.role === "engineer" || u.role === "support" ? null : "Engineering only";
    if (u.role !== "operator" && u.role !== "manager") return "Only operators and managers drive vehicles";
    if (c.kind === "estop.engage" || c.kind === "log.mark" || c.kind.startsWith("perception.")) return null;
    if (c.kind === "control.claim") {
      if (s.service === "out_of_service") return "Vehicle is out of service";
      if (s.pendingControl) return "A handoff is already in progress";
      if (s.controller && s.controller !== u.id && !(c.value as { force?: boolean } | undefined)?.force) return `Held by ${this.user(s.controller)?.name ?? "another operator"}`;
      return null;
    }
    if (c.kind === "estop.reset") return s.controller && s.controller !== u.id ? `Held by ${this.user(s.controller)?.name}` : null;
    if (NEEDS_CONTROL.has(c.kind) && s.controller !== u.id) return "Claim the vehicle first";
    return null;
  }

  submit(msg: Extract<ClientMsg, { t: "cmd" }>, userId: string) {
    const v = this.vehicles.get(msg.vehicleId);
    const u = this.user(userId);
    const c: Command = { id: msg.id, vehicleId: msg.vehicleId, kind: msg.kind, value: msg.value, by: userId, source: msg.source, status: "sent", sentAt: Date.now() };
    this.commands.unshift(c);
    if (this.commands.length > CMD_CAP) this.commands.length = CMD_CAP;
    this.log(c.kind === "estop.engage" ? "warn" : "info", "console", `${COMMAND_LABEL[c.kind]}${c.value !== undefined ? ` → ${JSON.stringify(c.value)}` : ""}`, c.vehicleId, { cmd: c.id, by: userId, source: c.source });
    this.update(c);

    const denied = this.authorize(c, u, v);
    if (denied) return this.reject(c, denied, "server");
    const veh = v!;

    if (c.kind === "control.claim" && veh.s.controller && veh.s.controller !== userId)
      this.log("warn", "ops", `${u!.name} claimed from ${this.user(veh.s.controller)?.name}`, c.vehicleId);

    const timeout = setTimeout(() => {
      if (c.status !== "sent") return;
      c.status = "timeout"; c.reason = "No acknowledgement from the vehicle in 2.5 s"; c.doneAt = Date.now();
      this.log("error", "network", `${COMMAND_LABEL[c.kind]} timed out`, c.vehicleId, { cmd: c.id });
      this.update(c);
    }, TIMEOUT_MS);

    const half = () => (veh.s.link.latencyMs ?? 0) / 2;
    if (!veh.linkUp) return; // the timeout reports it
    setTimeout(() => {
      if (!veh.linkUp || c.status !== "sent") return;
      const verdict = veh.validate(c);
      setTimeout(() => {
        if (c.status !== "sent") return;
        clearTimeout(timeout);
        if (!verdict.ok) return this.reject(c, verdict.reason, "vehicle");
        c.status = "received"; c.receivedAt = Date.now();
        this.update(c);
        setTimeout(() => {
          const out = verdict.act();
          setTimeout(() => {
            c.doneAt = Date.now();
            if (out.ok) { c.status = "confirmed"; c.readback = out.readback; }
            else { c.status = "failed"; c.reason = out.reason; }
            this.log(out.ok ? "info" : "error", "vehicle", `${COMMAND_LABEL[c.kind]}: ${out.ok ? out.readback : out.reason}`, c.vehicleId, { cmd: c.id, ms: c.doneAt - c.sentAt });
            this.update(c);
            this.afterCommand(c, veh);
          }, half());
        }, verdict.ms);
      }, half());
    }, half());
  }

  /** Operational side effects of confirmed or failed commands: incident tickets, alerts. */
  private afterCommand(c: Command, v: Vehicle) {
    const who = this.user(c.by)?.name ?? c.by;
    if (c.kind === "estop.engage" && c.status === "confirmed") {
      this.raise({ severity: "critical", title: "Emergency stop", detail: `${c.readback}. Latched until reset by the operator holding the vehicle.`, vehicleId: v.id });
      this.openTicket({ title: `Emergency stop on ${v.id}`, type: "incident", priority: 1, vehicleId: v.id, reporter: c.by, source: "operator", channel: "auto", category: "safety",
        body: `${who} used the emergency stop from the ${c.source}. ${c.readback}. Review the camera and log snapshot, then close.`, links: { commandId: c.id } });
    }
    if (c.kind === "estop.reset" && c.status === "confirmed") this.closeAlerts((a) => a.vehicleId === v.id && a.title === "Emergency stop");
    if (c.status === "failed") {
      this.raise({ severity: "warning", title: `${COMMAND_LABEL[c.kind]} failed`, detail: c.reason, vehicleId: v.id });
    }
    if (c.kind === "log.mark" && c.status === "confirmed") this.log("info", "ops", `Operator mark by ${who}`, v.id, { cmd: c.id, kmh: kmh(v.s.speed), x: Math.round(v.s.pose.x), y: Math.round(v.s.pose.y) });
  }

  openTicket(p: Pick<Ticket, "title" | "type" | "priority" | "reporter" | "body"> & Partial<Ticket>) {
    const now = Date.now();
    const t: Ticket = normalizeTicket({ status: "open", createdAt: now, updatedAt: now, activity: [{ at: now, by: p.reporter, kind: "created", text: "Opened" }], ...p,
      id: `TCK-${++this.db.counters.ticket}` } as Ticket, this.db.users);
    this.db.tickets.unshift(t);
    save(this.db);
    this.log("info", "ops", `Ticket ${t.id} opened: ${t.title}`, t.vehicleId);
    this.invalidate("tickets");
    return t;
  }

  /** Riders contact support through the app, by phone and by email. Simulated every few minutes. */
  private scheduleInbound(at: number) {
    setTimeout(() => {
      const live = [...this.vehicles.values()].filter((v) => v.s.service === "in_service");
      const v = live[Math.floor(Math.random() * live.length)];
      if (v) {
        const tpl = CUSTOMER_TEMPLATES[Math.floor(Math.random() * CUSTOMER_TEMPLATES.length)];
        const stops = routeById(v.s.route).stops;
        const stop = stops[Math.floor(Math.random() * stops.length)].name;
        const fill = (x: string) => x.replace(/\{stop\}/g, stop).replace(/\{vehicle\}/g, v.id);
        const support = this.db.users.find((u) => u.role === "support")!;
        this.openTicket({ title: fill(tpl.title), body: fill(tpl.body), type: "rider", priority: tpl.priority, category: tpl.category, channel: tpl.channel,
          source: "customer", requester: rider(Math.floor(Math.random() * 1000)), vehicleId: v.id, stop, reporter: support.id });
      }
      this.scheduleInbound(Date.now() + (240 + Math.random() * 300) * 1000);
    }, Math.max(1000, at - Date.now()));
  }

  /** Guidance without a claim: only while autonomy holds the vehicle and nobody has claimed it. */
  guide(msg: Extract<ClientMsg, { t: "guide" }>, userId: string) {
    const v = this.vehicles.get(msg.vehicleId), u = this.user(userId);
    if (!v || !u || (u.role !== "operator" && u.role !== "manager") || v.s.controller || v.s.control !== "autonomy" || !v.linkUp) return;
    const delay = (v.s.link.latencyMs ?? 0) / 2;
    setTimeout(() => v.guideInput(userId, msg.brake, msg.offset, Date.now()), delay);
  }

  drive(msg: Extract<ClientMsg, { t: "drive" }>, userId: string) {
    const v = this.vehicles.get(msg.vehicleId);
    if (!v || v.s.controller !== userId || !v.linkUp) return;
    const delay = (v.s.link.latencyMs ?? 0) / 2;
    setTimeout(() => { if (v.s.controller === userId) v.driveInput(msg.steer, msg.throttle, msg.brake, Date.now()); }, delay);
  }

  setService(vehicleId: string, service: "in_service" | "out_of_service", by: string) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return false;
    v.s.service = service;
    this.db.service[vehicleId] = service;
    if (service === "out_of_service") {
      const a = this.db.assignments.find((x) => x.vehicleId === vehicleId);
      if (a) a.userId = null;
      this.invalidate("assignments");
    }
    save(this.db);
    this.log("info", "ops", `${vehicleId} ${service === "in_service" ? "returned to service" : "taken out of service"}`, vehicleId, { by });
    this.invalidate("vehicles");
    return true;
  }
}
