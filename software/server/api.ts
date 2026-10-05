// REST API for operations data. Live state travels over the WebSocket; this is for records people edit.
// Identity is the x-teleop-user header (prototype). Swap for SSO sessions before this leaves the ops network.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LogLevel, Metrics, Shift, Ticket, TicketActivity, WorkOrder } from "../shared/types.ts";
import { sourceForRole } from "../shared/support.ts";
import type { Fleet } from "./fleet.ts";
import { save } from "./store.ts";

type Handler = (ctx: { req: IncomingMessage; params: Record<string, string>; query: URLSearchParams; body: any; userId: string }) => unknown;
const routes: { method: string; re: RegExp; keys: string[]; fn: Handler }[] = [];
function route(method: string, path: string, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, fn });
}
class HttpError extends Error { constructor(public code: number, msg: string) { super(msg); } }
const need = (cond: unknown, code: number, msg: string) => { if (!cond) throw new HttpError(code, msg); };

export function createApi(fleet: Fleet) {
  const db = fleet.db;
  const touch = (r: Parameters<Fleet["invalidate"]>[0]) => { save(db); fleet.invalidate(r); };
  const role = (userId: string) => db.users.find((u) => u.id === userId)?.role;
  const manages = (userId: string) => role(userId) === "manager";

  route("GET", "/api/users", () => db.users);
  route("GET", "/api/stations", () => db.stations);

  // Shifts
  route("GET", "/api/shifts", ({ query }) => {
    const from = Number(query.get("from") ?? 0), to = Number(query.get("to") ?? Infinity);
    return db.shifts.filter((s) => s.end > from && s.start < to).sort((a, b) => a.start - b.start);
  });
  route("POST", "/api/shifts", ({ body, userId }) => {
    need(manages(userId), 403, "Only fleet managers schedule shifts");
    need(body.userId && body.start < body.end, 400, "Pick an operator and an end after the start");
    const s: Shift = { id: `sh_${++db.counters.shift}`, userId: body.userId, start: body.start, end: body.end, station: body.station ?? "ST-01", note: body.note };
    db.shifts.push(s); touch("shifts"); return s;
  });
  route("PATCH", "/api/shifts/:id", ({ params, body, userId }) => {
    need(manages(userId), 403, "Only fleet managers edit shifts");
    const s = db.shifts.find((x) => x.id === params.id); need(s, 404, "No such shift");
    Object.assign(s!, pick(body, ["userId", "start", "end", "station", "note"])); touch("shifts"); return s;
  });
  route("DELETE", "/api/shifts/:id", ({ params, userId }) => {
    need(manages(userId), 403, "Only fleet managers remove shifts");
    const i = db.shifts.findIndex((x) => x.id === params.id); need(i >= 0, 404, "No such shift");
    need(!db.shifts[i].clockIn, 409, "This shift has started. End it with clock out instead.");
    db.shifts.splice(i, 1); touch("shifts"); return { ok: true };
  });
  route("POST", "/api/shifts/:id/clock", ({ params, body, userId }) => {
    const s = db.shifts.find((x) => x.id === params.id); need(s, 404, "No such shift");
    need(s!.userId === userId || manages(userId), 403, "You can only clock your own shift");
    if (body.action === "in") { need(!s!.clockIn, 409, "Already clocked in"); s!.clockIn = Date.now(); }
    else { need(s!.clockIn && !s!.clockOut, 409, "Not clocked in"); s!.clockOut = Date.now(); }
    fleet.log("info", "ops", `${db.users.find((u) => u.id === s!.userId)?.name} clocked ${body.action}`, undefined, { shift: s!.id });
    touch("shifts"); return s;
  });

  // Vehicle assignments and service status
  route("GET", "/api/assignments", () => db.assignments);
  route("PUT", "/api/assignments/:vehicleId", ({ params, body, userId }) => {
    need(manages(userId), 403, "Only fleet managers assign vehicles");
    const a = db.assignments.find((x) => x.vehicleId === params.vehicleId); need(a, 404, "No such vehicle");
    a!.userId = body.userId ?? null;
    fleet.log("info", "ops", `${params.vehicleId} assigned to ${db.users.find((u) => u.id === a!.userId)?.name ?? "nobody"}`, params.vehicleId);
    touch("assignments"); return a;
  });
  route("PATCH", "/api/vehicles/:id/service", ({ params, body, userId }) => {
    need(["manager", "engineer"].includes(role(userId) ?? ""), 403, "Managers and engineers change service status");
    const v = fleet.vehicles.get(params.id); need(v, 404, "No such vehicle");
    need(body.service === "in_service" || body.service === "out_of_service", 400, "Unknown service status");
    fleet.setService(params.id, body.service, userId); return v!.s;
  });
  route("GET", "/api/vehicles/:id/history", ({ params }) => fleet.history.get(params.id) ?? []);

  // Tickets. Support owns the queue; anyone can open one, and the source records who raised it.
  const ticket = (id: string) => { const t = db.tickets.find((x) => x.id === id); need(t, 404, "No such ticket"); return t!; };
  const nameOf = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "nobody";
  const log = (t: Ticket, by: string, kind: TicketActivity["kind"], text: string) => { t.activity.push({ at: Date.now(), by, kind, text }); t.updatedAt = Date.now(); };

  route("GET", "/api/tickets", () => db.tickets);
  route("POST", "/api/tickets", ({ body, userId }) => {
    need(body.title?.trim(), 400, "Add a title");
    const requester = body.requester?.name?.trim() ? { name: body.requester.name.trim(), contact: body.requester.contact?.trim() ?? "", kind: "rider" as const } : undefined;
    return fleet.openTicket({ title: body.title.trim(), type: body.type ?? (requester ? "rider" : "incident"), priority: body.priority ?? 3, reporter: userId, body: body.body ?? "",
      vehicleId: body.vehicleId || undefined, assignee: body.assignee || undefined, links: body.links, stop: body.stop || undefined,
      category: body.category, channel: body.channel ?? (requester ? "phone" : "console"), requester,
      source: requester ? "customer" : sourceForRole(role(userId) ?? "support") });
  });
  route("PATCH", "/api/tickets/:id", ({ params, body, userId }) => {
    const t = ticket(params.id);
    need(body.status !== "resolved", 400, "Use Resolve, so the ticket records how it was resolved");
    if (body.status && body.status !== t.status) log(t, userId, "status", STATUS[body.status as Ticket["status"]]);
    if ("assignee" in body && body.assignee !== t.assignee) log(t, userId, "assign", body.assignee ? `Assigned to ${nameOf(body.assignee)}` : "Unassigned");
    if (body.priority && body.priority !== t.priority) log(t, userId, "status", `Priority P${body.priority}`);
    if (body.category && body.category !== t.category) log(t, userId, "status", `Category ${body.category.replace("_", " ")}`);
    if (body.status && body.status !== "resolved" && t.status === "resolved") delete t.resolution;
    Object.assign(t, pick(body, ["status", "assignee", "priority", "title", "type", "vehicleId", "category", "stop"]), { updatedAt: Date.now() });
    touch("tickets"); return t;
  });
  /** A reply goes to the requester (rider or the staff member who raised it); a note stays inside the team. */
  route("POST", "/api/tickets/:id/messages", ({ params, body, userId }) => {
    const t = ticket(params.id);
    need(body.text?.trim(), 400, "Write something first");
    const reply = body.kind === "reply";
    need(!reply || role(userId) !== "operator", 403, "Operators add notes; support replies to the requester");
    log(t, userId, reply ? "reply" : "note", body.text.trim());
    if (reply) {
      if (!t.firstResponseAt) t.firstResponseAt = Date.now();
      if (t.status === "open") { t.status = "in_progress"; }
      if (!t.assignee) t.assignee = userId;
    }
    touch("tickets"); return t;
  });
  route("POST", "/api/tickets/:id/comments", ({ params, body, userId }) => {
    const t = ticket(params.id);
    need(body.text?.trim(), 400, "Write a comment");
    log(t, userId, "note", body.text.trim()); touch("tickets"); return t;
  });
  route("POST", "/api/tickets/:id/steps", ({ params, body, userId }) => {
    const t = ticket(params.id);
    t.playbook = { ...(t.playbook ?? {}) };
    if (body.done) { t.playbook[body.step] = Date.now(); log(t, userId, "step", `Done: ${body.text ?? body.step}`); }
    else delete t.playbook[body.step];
    t.updatedAt = Date.now(); touch("tickets"); return t;
  });
  /** Hand part of the work to engineering (with a work order) or to fleet. The ticket waits until they hand it back. */
  route("POST", "/api/tickets/:id/escalate", ({ params, body, userId }) => {
    const t = ticket(params.id);
    need(role(userId) !== "operator", 403, "Support, fleet managers and engineers escalate tickets");
    need(body.team === "engineering" || body.team === "fleet", 400, "Pick engineering or fleet");
    need(body.note?.trim(), 400, "Say what you need from them");
    let workOrderId: string | undefined;
    if (body.team === "engineering" && body.workOrder?.component?.trim()) {
      need(t.vehicleId, 400, "Link a vehicle to open a work order");
      const eng = db.users.find((u) => u.role === "engineer");
      const w: WorkOrder = { id: `WO-${++db.counters.workorder}`, vehicleId: t.vehicleId!, component: body.workOrder.component.trim(), kind: body.workOrder.kind ?? "corrective",
        status: "scheduled", assignee: eng?.id, notes: body.note.trim(), createdAt: Date.now(), ticketId: t.id, takesOutOfService: !!body.workOrder.takesOutOfService };
      db.workorders.unshift(w); workOrderId = w.id;
      fleet.log("info", "ops", `${w.id} opened from ${t.id}: ${w.component}`, w.vehicleId);
      fleet.invalidate("workorders");
    }
    t.escalation = { team: body.team, at: Date.now(), by: userId, note: body.note.trim(), workOrderId };
    t.status = "waiting";
    log(t, userId, "escalate", `Sent to ${body.team}${workOrderId ? ` with ${workOrderId}` : ""}: ${body.note.trim()}`);
    touch("tickets"); return t;
  });
  route("POST", "/api/tickets/:id/escalation/done", ({ params, body, userId }) => {
    const t = ticket(params.id);
    need(t.escalation && !t.escalation.done, 409, "Nothing is waiting on another team");
    t.escalation = { ...t.escalation!, done: Date.now() };
    t.status = "in_progress";
    log(t, userId, "escalate", `${t.escalation.team === "fleet" ? "Fleet" : "Engineering"} handed it back${body.note?.trim() ? `: ${body.note.trim()}` : ""}`);
    touch("tickets"); return t;
  });
  route("POST", "/api/tickets/:id/resolve", ({ params, body, userId }) => {
    const t = ticket(params.id);
    need(role(userId) !== "operator", 403, "Support, fleet managers and engineers resolve tickets");
    need(body.code, 400, "Pick how it was resolved");
    need(body.summary?.trim(), 400, "Write a one-line summary");
    if (body.code === "duplicate") { need(body.duplicateOf && db.tickets.some((x) => x.id === body.duplicateOf && x.id !== t.id), 400, "Name the ticket this duplicates"); t.duplicateOf = body.duplicateOf; }
    t.resolution = { code: body.code, summary: body.summary.trim(), at: Date.now(), by: userId };
    t.status = "resolved";
    log(t, userId, "resolve", body.summary.trim());
    touch("tickets"); return t;
  });
  /** What the vehicle was doing around the time the ticket describes. */
  route("GET", "/api/tickets/:id/context", ({ params }) => {
    const t = ticket(params.id);
    const from = t.createdAt - 20 * 60e3, to = t.createdAt + 5 * 60e3;
    const v = t.vehicleId ? fleet.vehicles.get(t.vehicleId)?.s ?? null : null;
    return {
      vehicle: v,
      events: t.vehicleId ? fleet.logs.filter((e) => e.vehicleId === t.vehicleId && e.t >= from && e.t <= to && e.source !== "console").slice(-80) : [],
      commands: t.vehicleId ? fleet.commands.filter((c) => c.vehicleId === t.vehicleId && c.sentAt >= from && c.sentAt <= to).slice(0, 40) : [],
      related: db.tickets.filter((x) => x.id !== t.id && ((t.vehicleId && x.vehicleId === t.vehicleId && x.status !== "resolved") || (t.requester && x.requester?.contact === t.requester.contact))).slice(0, 8),
      workorders: t.vehicleId ? db.workorders.filter((w) => w.vehicleId === t.vehicleId && w.status !== "done") : [],
      window: { from, to },
    };
  });

  // Work orders
  route("GET", "/api/workorders", () => db.workorders);
  route("POST", "/api/workorders", ({ body, userId }) => {
    need(["engineer", "support", "manager"].includes(role(userId) ?? ""), 403, "Engineering and managers create work orders");
    need(body.vehicleId && body.component?.trim(), 400, "Pick a vehicle and name the component");
    const w: WorkOrder = { id: `WO-${++db.counters.workorder}`, vehicleId: body.vehicleId, component: body.component.trim(), kind: body.kind ?? "corrective",
      status: "scheduled", dueAt: body.dueAt, dueKm: body.dueKm, assignee: body.assignee, notes: body.notes ?? "", createdAt: Date.now(), ticketId: body.ticketId,
      takesOutOfService: !!body.takesOutOfService };
    db.workorders.unshift(w);
    fleet.log("info", "ops", `${w.id} created: ${w.component}`, w.vehicleId);
    touch("workorders"); return w;
  });
  route("PATCH", "/api/workorders/:id", ({ params, body, userId }) => {
    const w = db.workorders.find((x) => x.id === params.id); need(w, 404, "No such work order");
    const prev = w!.status;
    Object.assign(w!, pick(body, ["status", "assignee", "notes", "dueAt", "dueKm", "component", "takesOutOfService"]));
    if (w!.takesOutOfService && prev !== w!.status) {
      if (w!.status === "in_progress") fleet.setService(w!.vehicleId, "out_of_service", userId);
      if (w!.status === "done" && !db.workorders.some((o) => o.vehicleId === w!.vehicleId && o.id !== w!.id && o.takesOutOfService && o.status === "in_progress"))
        fleet.setService(w!.vehicleId, "in_service", userId);
    }
    if (w!.status === "done" && prev !== "done" && w!.ticketId) {
      const t = db.tickets.find((x) => x.id === w!.ticketId);
      if (t?.escalation?.workOrderId === w!.id && !t.escalation.done) {
        t.escalation = { ...t.escalation, done: Date.now() };
        if (t.status === "waiting") t.status = "in_progress";
        log(t, userId, "escalate", `Engineering finished ${w!.id}: ${w!.component}`);
        fleet.invalidate("tickets");
      }
    }
    if (w!.status === "done" && prev !== "done" && w!.ticketId) {
      const t = db.tickets.find((x) => x.id === w!.ticketId);
      if (t?.escalation?.workOrderId === w!.id && !t.escalation.done) {
        t.escalation = { ...t.escalation, done: Date.now() };
        if (t.status === "waiting") t.status = "in_progress";
        log(t, userId, "escalate", `Engineering finished ${w!.id}: ${w!.component}`);
        fleet.invalidate("tickets");
      }
    }
    touch("workorders"); return w;
  });

  // Logs, commands, metrics
  route("GET", "/api/logs", ({ query }) => {
    const vehicle = query.get("vehicle"), level = query.get("level") as LogLevel | null, src = query.get("source"), q = query.get("q")?.toLowerCase();
    const limit = Math.min(2000, Number(query.get("limit") ?? 500));
    const rank = { debug: 0, info: 1, warn: 2, error: 3 };
    const out = [];
    for (let i = fleet.logs.length - 1; i >= 0 && out.length < limit; i--) {
      const e = fleet.logs[i];
      if (vehicle && e.vehicleId !== vehicle) continue;
      if (level && rank[e.level] < rank[level]) continue;
      if (src && e.source !== src) continue;
      if (q && !e.msg.toLowerCase().includes(q)) continue;
      out.push(e);
    }
    return out.reverse();
  });
  route("GET", "/api/commands", ({ query }) => {
    const vehicle = query.get("vehicle");
    return fleet.commands.filter((c) => !vehicle || c.vehicleId === vehicle).slice(0, Number(query.get("limit") ?? 500));
  });
  route("GET", "/api/metrics", (): Metrics => {
    const now = Date.now(), vs = fleet.snapshot();
    const recent = fleet.commands.filter((c) => c.sentAt > now - 15 * 60e3);
    const done = recent.filter((c) => c.status === "confirmed" && c.doneAt).map((c) => c.doneAt! - c.sentAt).sort((a, b) => a - b);
    return {
      inService: vs.filter((v) => v.service === "in_service").length, total: vs.length,
      claimed: vs.filter((v) => v.controller).length,
      assistOpen: vs.filter((v) => v.assist).length,
      assistLastHour: fleet.alerts.filter((a) => a.assistId && a.at > now - 3600e3).length,
      onShift: new Set(db.shifts.filter((s) => s.start <= now && s.end > now && s.clockIn && !s.clockOut).map((s) => s.userId)).size,
      openTickets: db.tickets.filter((t) => t.status !== "resolved").length,
      commands15m: recent.length,
      commandP95Ms: done.length ? done[Math.floor(done.length * 0.95)] ?? done[done.length - 1] : null,
      rejected15m: recent.filter((c) => c.status === "rejected" || c.status === "failed" || c.status === "timeout").length,
    };
  });

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://x");
    if (!url.pathname.startsWith("/api/")) return false;
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    const send = (code: number, data: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (!r) { send(404, { error: "Not found" }); return true; }
    try {
      const m = url.pathname.match(r.re)!;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let body: any = {};
      if (req.method !== "GET") { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; }
      const userId = String(req.headers["x-teleop-user"] ?? "");
      if (req.method !== "GET") need(db.users.some((u) => u.id === userId), 401, "Sign in first");
      send(200, await r.fn({ req, params, query: url.searchParams, body, userId }));
    } catch (e) {
      send(e instanceof HttpError ? e.code : 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  };
}

const STATUS = { open: "Reopened", in_progress: "In progress", waiting: "Waiting", resolved: "Resolved" } as const;
function pick(o: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])); }
