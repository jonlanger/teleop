// A simulated vehicle: drive-by-wire, body controls, autonomy, sensors and a cellular link.
// The console never writes vehicle state directly. It sends commands; the vehicle decides whether to accept them,
// takes real time to actuate, and reports back what it actually did. That readback is what the UI shows.
import type { Alert, AssistRequest, Command, DiagResult, Fault, Gear, Headlights, Health, LogLevel, LogSource, SensorId, TurnSignal, VehicleState, Wipers } from "../../shared/types.ts";
import { SPEAKER_PRESETS } from "../../shared/controls.ts";
import { WEAK_ZONES, nextCorner, nextStop, pointAt, project, routeById, routeGeometry, type RouteGeom } from "../../shared/site.ts";
import { BOUNDS, WATER, near } from "../../shared/city.ts";

export interface VehicleHooks {
  log(level: LogLevel, source: LogSource, msg: string, data?: Record<string, unknown>): void;
  alert(a: Omit<Alert, "id" | "at">): Alert;
  closeAlerts(match: (a: Alert) => boolean): void;
  fault(vehicleId: string, f: Fault, isNew: boolean): void;
}

export type Outcome = { ok: true; readback: string } | { ok: false; reason: string };
export type Verdict = { ok: false; reason: string } | { ok: true; ms: number; act: () => Outcome };

export interface VehicleSeed {
  id: string; route: string; startS: number; soc: number; odometerKm: number; sw: string; latencyBase: number;
  service?: VehicleState["service"]; brakePadPct?: number; wiperFault?: boolean; degraded?: SensorId[]; tiresKpa?: [number, number, number, number];
}

const WHEELBASE = 3.1, MAX_STEER = 35, STEER_RATE = 70, WATCHDOG_MS = 600;
const SENSORS: SensorId[] = ["cam_front", "cam_rear", "cam_left", "cam_right", "lidar", "radar", "gnss", "imu"];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const ASSISTS: Omit<AssistRequest, "id" | "since" | "obstacle">[] = [
  { kind: "blocked_lane", title: "Double-parked truck in lane", detail: "Autonomy can pass in the oncoming lane if an operator approves the path.", canProceed: true },
  { kind: "pedestrian", title: "Pedestrian in crosswalk", detail: "Vehicle stopped 4 m before the crosswalk and is waiting for the pedestrian to clear.", canProceed: false },
  { kind: "construction", title: "Lane closed for construction", detail: "Cones across the lane. A path through the work zone needs approval.", canProceed: true },
  { kind: "unprotected_turn", title: "Unprotected left, view blocked", detail: "A parked bus blocks the oncoming view. Approve the turn or drive it.", canProceed: true },
];

export class Vehicle {
  s: VehicleState;
  private geom: RouteGeom;
  private targetKmh: number;
  private lastDriveAt = 0;
  private streamTimedOut = false;
  private nextEventAt: number;
  private assistAt: { x: number; y: number } | null = null;
  private assistAutoClearAt: number | null = null;
  private assistProceedAt: number | null = null;
  private mrm = false;
  private dwell: { index: number; until: number; doorAt: number; closeAt: number } | null = null;
  private servedStop: number | null = null;
  private contact = false;
  private guideIn: { by: string; brake: number; offset: number; at: number } | null = null;
  private guiding = false;
  private hornUntil = 0;
  private speakerUntil = 0;
  private latencyBase: number;
  private linkLostUntil = 0;
  private restarting = new Map<SensorId | "autonomy", number>();
  private hardware = new Set<SensorId>();
  private lowBatteryWarned = false;

  constructor(seed: VehicleSeed, private hooks: VehicleHooks, now: number) {
    const route = routeById(seed.route);
    this.geom = routeGeometry(route);
    this.targetKmh = route.targetKmh;
    this.latencyBase = seed.latencyBase;
    const p = pointAt(this.geom, seed.startS);
    const oos = seed.service === "out_of_service";
    for (const d of seed.degraded ?? []) this.hardware.add(d);
    this.s = {
      id: seed.id, model: "Gen 2 shuttle", route: route.id, routeName: route.name, service: seed.service ?? "in_service",
      control: "autonomy", controller: null, pendingControl: null, assist: null, stop: null, guide: null, labels: [],
      pose: { x: p.x, y: p.y, heading: p.heading }, speed: 0, offRouteM: 0,
      drive: { gear: oos ? "P" : "D", parkingBrake: oos, steerDeg: 0, steerCmdDeg: 0, throttle: 0, throttleCmd: 0, brake: 0, brakeCmd: 0, speedCapKmh: 25, speedHoldKmh: null, streamAgeMs: null },
      body: { hazards: false, turnSignal: "off", headlights: "auto", wipers: "off", horn: false, doorsLocked: true, doorOpen: false, cabinLights: true },
      comms: { speaker: null, talk: false, passengers: oos ? 0 : Math.floor(rnd(0, 9)) },
      estop: { engaged: false, source: null, at: null },
      power: { soc: seed.soc, volts: 0, rangeKm: 0, sohPct: Math.round(rnd(88, 97)) },
      thermal: { motorC: 38, batteryC: 29, computeC: 54 },
      compute: { cpuPct: 42, autonomy: "ok", sw: seed.sw },
      link: { latencyMs: seed.latencyBase, lossPct: 0.2, upMbps: 9, carriers: ["ok", "ok"] },
      sensors: Object.fromEntries(SENSORS.map((k) => [k, this.hardware.has(k) ? "degraded" : "ok"])) as Record<SensorId, Health>,
      wear: { brakePadPct: seed.brakePadPct ?? Math.round(rnd(45, 90)), tiresKpa: seed.tiresKpa ?? [241, 239, 243, 240], wiperMotor: seed.wiperFault ? "fault" : "ok" },
      odometerKm: seed.odometerKm,
      faults: [],
      diag: { running: false, results: null, at: null },
      lastSeen: now,
    };
    this.nextEventAt = now + rnd(90, 300) * 1000;
    if (seed.wiperFault) this.s.faults.push({ code: "B1A20", system: "Body", text: "Wiper motor overcurrent", severity: "warning", at: now - 3600e3 * 5 });
  }

  get id() { return this.s.id; }
  get linkUp() { return this.s.link.latencyMs != null; }

  private log(level: LogLevel, source: LogSource, msg: string, data?: Record<string, unknown>) { this.hooks.log(level, source, msg, { vehicleId: this.s.id, ...data }); }

  // ── Drive stream from the holding operator ──────────────────────────────

  /** Remote guidance from an operator who has not claimed the vehicle. Autonomy stays in control. */
  guideInput(by: string, brake: number, offset: number, now: number) {
    this.guideIn = { by, brake: clamp(brake, 0, 1), offset: clamp(offset, -3, 3), at: now };
  }

  /** Guidance is live while packets keep arriving; it lapses 500 ms after the last one. */
  private tickGuide(now: number) {
    const s = this.s, g = this.guideIn;
    const live = !!g && now - g.at < 500 && s.control === "autonomy" && !s.controller && (g.brake > 0.02 || Math.abs(g.offset) > 0.05);
    s.guide = live ? { by: g!.by, brake: +g!.brake.toFixed(2), offsetM: +g!.offset.toFixed(2) } : null;
    if (live && !this.guiding) { this.guiding = true; this.log("info", "autonomy", "Operator guidance started", { by: g!.by }); }
    if (!live && this.guiding) { this.guiding = false; this.log("info", "autonomy", "Operator guidance ended; autonomy resumed its own path"); }
  }

  driveInput(steer: number, throttle: number, brake: number, now: number) {
    const d = this.s.drive;
    d.steerCmdDeg = clamp(steer, -1, 1) * MAX_STEER;
    d.throttleCmd = clamp(throttle, 0, 1);
    d.brakeCmd = clamp(brake, 0, 1);
    this.lastDriveAt = now;
    if (this.streamTimedOut && d.throttleCmd < 0.05) {
      this.streamTimedOut = false;
      this.log("info", "dbw", "Drive stream restored");
      this.hooks.closeAlerts((a) => a.vehicleId === this.s.id && a.title === "Drive stream timed out");
    }
  }

  // ── Physics and autonomy ────────────────────────────────────────────────

  tick(dt: number, now: number) {
    const s = this.s, d = s.drive;
    this.tickLink(now);
    if (this.linkUp) s.lastSeen = now;

    let steerCmd = d.steerCmdDeg, thr = d.throttleCmd, brk = d.brakeCmd;
    const holding = s.control === "operator" && s.controller != null;

    this.tickGuide(now);
    if (s.estop.engaged) { thr = 0; brk = 1; }
    else if (s.service === "out_of_service" && !holding) { thr = 0; brk = 0.6; steerCmd = 0; }
    else if (holding) {
      const age = now - this.lastDriveAt;
      d.streamAgeMs = age;
      if (age > WATCHDOG_MS || !this.linkUp) {
        thr = 0; brk = Math.max(brk, 0.55);
        if (!this.streamTimedOut) {
          this.streamTimedOut = true;
          d.throttleCmd = 0;
          this.log("warn", "dbw", "Drive stream timed out; braking to a stop", { ageMs: Math.round(age) });
          this.hooks.alert({ severity: "warning", title: "Drive stream timed out", detail: "No drive input for 600 ms. Vehicle is braking to a stop; release the throttle to resume.", vehicleId: s.id });
        }
      }
      if (d.speedHoldKmh != null) {
        if (d.brakeCmd > 0.1 || this.streamTimedOut) {
          d.speedHoldKmh = null;
          this.log("info", "dbw", this.streamTimedOut ? "Speed hold off: drive stream lost" : "Speed hold off: brake pressed");
        } else if ((d.gear === "D" || d.gear === "R") && !d.parkingBrake) {
          const err = Math.min(d.speedHoldKmh, d.speedCapKmh) / 3.6 - Math.abs(s.speed);
          thr = Math.max(thr, clamp(err * 0.45 + 0.08, 0, 0.8));
          if (err < -0.4) brk = Math.max(brk, clamp(-err * 0.25, 0, 0.5));
        }
      }
      if (this.mrm) { thr = 0; brk = Math.max(brk, s.speed > 0.3 ? 0.35 : 0.5); }
      if (s.body.doorOpen) thr = 0;
    } else {
      d.streamAgeMs = null;
      const auto = this.autopilot(now);
      steerCmd = auto.steer; thr = auto.throttle; brk = auto.brake;
      d.steerCmdDeg = steerCmd; d.throttleCmd = thr; d.brakeCmd = brk;
    }

    // Actuators lag their commands; the readback is the actuator, not the command.
    d.steerDeg = approach(d.steerDeg, steerCmd, STEER_RATE * dt);
    d.throttle = approach(d.throttle, thr, 3 * dt);
    d.brake = approach(d.brake, brk, 5 * dt);

    let a = 0;
    const v = s.speed, dir = Math.sign(v);
    const drag = 0.25 + 0.012 * v * v;
    if (d.gear === "P" || d.parkingBrake) { s.speed = approach(v, 0, 8 * dt); }
    else {
      if (d.gear === "D") a += d.throttle * 2.4;
      if (d.gear === "R") a -= d.throttle * 1.2;
      const decel = d.brake * 6.5 + drag;
      const next = v + a * dt - dir * decel * dt;
      s.speed = dir !== 0 && Math.sign(next) !== dir && Math.abs(a) < decel ? 0 : next;
      const capMs = (holding ? d.speedCapKmh : this.targetKmh + 4) / 3.6;
      s.speed = clamp(s.speed, -8 / 3.6, capMs);
    }
    if (Math.abs(s.speed) < 0.02 && d.throttle < 0.02) s.speed = 0;

    const prev = { ...s.pose };
    s.pose.heading += (s.speed / WHEELBASE) * Math.tan((d.steerDeg * Math.PI) / 180) * dt;
    s.pose.x += s.speed * Math.cos(s.pose.heading) * dt;
    s.pose.y += s.speed * Math.sin(s.pose.heading) * dt;
    s.pose.x = clamp(s.pose.x, BOUNDS.x0, BOUNDS.x1); s.pose.y = clamp(s.pose.y, BOUNDS.y0, BOUNDS.y1);
    // Buildings and the harbor edge stop the vehicle: the bumper sensors report contact.
    const nose = { x: s.pose.x + Math.cos(s.pose.heading) * 2.4 * Math.sign(s.speed || 1), y: s.pose.y + Math.sin(s.pose.heading) * 2.4 * Math.sign(s.speed || 1) };
    const blocked = (nose.x > WATER.x0 && nose.y > WATER.y0 - 2) || near(nose.x, nose.y, 4).buildings.some((b) => nose.x > b.x0 && nose.x < b.x1 && nose.y > b.y0 && nose.y < b.y1);
    if (blocked && s.control === "autonomy" && !s.controller) {
      // Autonomy never stays stuck against a curb: it re-plans onto the route.
      const back = pointAt(this.geom, project(this.geom, prev.x, prev.y).s);
      s.pose = { x: back.x, y: back.y, heading: back.heading }; s.speed = 0;
      this.log("warn", "autonomy", "Path blocked; re-planned onto the route");
    } else if (blocked) {
      Object.assign(s.pose, prev); s.speed = 0;
      if (!this.contact) {
        this.contact = true;
        this.log("warn", "vehicle", "Bumper contact: vehicle stopped at an obstacle");
        this.hooks.alert({ severity: "warning", title: "Bumper contact", detail: "The vehicle stopped against a curb or structure. Reverse or steer away.", vehicleId: s.id });
      }
    } else if (this.contact && Math.abs(s.speed) > 0.5) this.contact = false;
    s.odometerKm += Math.abs(s.speed) * dt / 1000;
    s.offRouteM = project(this.geom, s.pose.x, s.pose.y).d;

    if (this.mrm && Math.abs(s.speed) < 0.05 && d.gear !== "P") {
      d.gear = "P"; d.parkingBrake = true; this.mrm = false;
      this.log("info", "dbw", "Pulled over and parked");
    }
    if (s.estop.engaged && s.speed === 0 && !d.parkingBrake) { d.parkingBrake = true; d.gear = "P"; }

    this.tickBody(now);
    this.tickAssist(now);
    this.tickHealth(dt, now);
  }

  private autopilot(now: number) {
    const s = this.s, d = s.drive;
    if (d.gear !== "D" || d.parkingBrake) {
      if (s.control === "autonomy" && !s.body.doorOpen && !s.estop.engaged && Math.abs(s.speed) < 0.1) {
        d.gear = "D"; d.parkingBrake = false;
        this.log("info", "autonomy", "Autonomy shifted to D");
      }
    }
    const proj = project(this.geom, s.pose.x, s.pose.y);
    const look = Math.max(9, Math.abs(s.speed) * 1.6);
    const ahead = pointAt(this.geom, proj.s + look);
    // Pulling over: aim 2.5 m right of the lane, toward the curb.
    const g = s.guide;
    const lat = this.mrm ? 2.5 : g ? g.offsetM : 0;
    const tgt = { x: ahead.x - Math.sin(ahead.heading) * lat, y: ahead.y + Math.cos(ahead.heading) * lat };
    const alpha = Math.atan2(tgt.y - s.pose.y, tgt.x - s.pose.x) - s.pose.heading;
    const al = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    const steer = clamp((Math.atan2(2 * WHEELBASE * Math.sin(al), look) * 180) / Math.PI, -MAX_STEER, MAX_STEER);

    let target = this.targetKmh / 3.6;
    const corner = nextCorner(this.geom, proj.s);
    if (corner.angle > 0.5 && corner.dist < 35) target = Math.min(target, 13 / 3.6);
    if (this.hardware.size && s.sensors.cam_left !== "ok") target = Math.min(target, 10 / 3.6);
    target = Math.min(target, this.stopTarget(now, proj.s));
    // Guided around a passable obstacle, autonomy creeps past it; otherwise it waits for approval.
    if (s.assist && this.assistProceedAt == null) target = s.assist.canProceed && g && Math.abs(g.offsetM) >= 2 ? Math.min(target, 12 / 3.6) : 0;
    if (g && g.brake > 0.02) target = g.brake > 0.6 ? 0 : target * (1 - g.brake);
    if (this.mrm || s.control === "transitioning" || s.body.doorOpen || s.pendingControl) target = 0;
    if (s.sensors.lidar === "offline" || this.restarting.has("autonomy")) target = 0;

    const err = target - s.speed;
    let throttle = clamp(err * 0.6, 0, 1), brake = clamp(-err * 0.5, 0, 1);
    if (target === 0) { throttle = 0; brake = s.speed > 0.2 ? clamp(0.25 + s.speed * 0.08, 0, 0.8) : 0.4; }
    if (g && g.brake > 0.02) { brake = Math.max(brake, g.brake * 0.8); throttle = Math.min(throttle, 1 - g.brake); }
    return { steer, throttle, brake };
  }

  /** Serve route stops: slow in, stop, open the door, let riders on and off, close, go. */
  private stopTarget(now: number, sPos: number) {
    const s = this.s, b = s.body;
    if (s.service !== "in_service" || s.control !== "autonomy") return Infinity;
    if (this.dwell) {
      if (now >= this.dwell.doorAt && now < this.dwell.closeAt && !b.doorOpen) { b.doorsLocked = false; b.doorOpen = true; }
      if (now >= this.dwell.closeAt && b.doorOpen) {
        b.doorOpen = false; b.doorsLocked = true;
        s.comms.passengers = clamp(s.comms.passengers + Math.round(rnd(-3, 3.5)), 0, 12);
      }
      if (now >= this.dwell.until && !b.doorOpen) {
        this.log("info", "autonomy", `Departed ${s.stop?.name}`, { riders: s.comms.passengers });
        this.servedStop = this.dwell.index; this.dwell = null; s.stop = null;
        return Infinity;
      }
      return 0;
    }
    const next = nextStop(this.geom, sPos, -1);
    if (!next) return Infinity;
    if (next.index === this.servedStop) { if (next.dist > 30) this.servedStop = null; return Infinity; }
    if (next.dist < 2.5 && Math.abs(s.speed) < 0.3) {
      this.dwell = { index: next.index, doorAt: now + 1500, closeAt: now + 9000, until: now + 11000 };
      s.stop = { name: next.name, until: now + 11000 };
      this.log("info", "autonomy", `Arrived at ${next.name}`);
      return 0;
    }
    return next.dist < 40 ? Math.max(0, (next.dist - 1.5) * 0.45) : Infinity;
  }

  private tickBody(now: number) {
    const b = this.s.body, c = this.s.comms;
    if (b.horn && now > this.hornUntil) b.horn = false;
    if (c.speaker && now > this.speakerUntil) { c.speaker = null; this.log("debug", "vehicle", "Speaker announcement finished"); }
  }

  private tickAssist(now: number) {
    const s = this.s;
    if (s.assist) {
      if (this.assistProceedAt != null && now > this.assistProceedAt + 6000) this.clearAssist("Autonomy passed the obstacle");
      else if (this.assistAutoClearAt != null && now > this.assistAutoClearAt) this.clearAssist(s.assist.kind === "pedestrian" ? "Pedestrian cleared" : "Autonomy found its own path");
      else if (this.assistAt && Math.hypot(s.pose.x - this.assistAt.x, s.pose.y - this.assistAt.y) > 25) this.clearAssist(s.control === "operator" ? "Operator drove past" : "Guided past by an operator");
      return;
    }
    const eligible = s.control === "autonomy" && s.service === "in_service" && !s.estop.engaged && s.speed > 3;
    if (!eligible || now < this.nextEventAt) return;

    const degraded = [...this.hardware][0];
    const base = degraded && Math.random() < 0.5
      ? { kind: "sensor_degraded" as const, title: "Left camera degraded", detail: "Lens obstruction on the left camera. Autonomy is holding below 10 km/h and needs an operator to drive.", canProceed: false }
      : pick(ASSISTS);
    const at = pointAt(this.geom, project(this.geom, s.pose.x, s.pose.y).s + (base.kind === "pedestrian" ? 13 : 17));
    s.assist = { ...base, id: `as_${s.id}_${now.toString(36)}`, since: now, obstacle: base.kind === "sensor_degraded" ? null : { x: at.x, y: at.y, heading: at.heading } };
    this.assistAt = { x: s.pose.x, y: s.pose.y };
    this.assistProceedAt = null;
    // Autonomy keeps working the problem: a pedestrian clears quickly; otherwise it finds its own path in a minute or two.
    this.assistAutoClearAt = now + (base.kind === "pedestrian" ? rnd(10, 25) : rnd(50, 110)) * 1000;
    this.log("warn", "autonomy", `Assist requested: ${base.title}`, { kind: base.kind });
    this.hooks.alert({ severity: "warning", title: base.title, detail: base.detail, vehicleId: s.id, assistId: s.assist.id });
  }

  private clearAssist(how: string) {
    const a = this.s.assist;
    if (!a) return;
    this.s.assist = null;
    this.assistAt = null; this.assistAutoClearAt = null; this.assistProceedAt = null;
    this.nextEventAt = Date.now() + rnd(240, 600) * 1000;
    this.log("info", "autonomy", `Assist cleared: ${how}`, { kind: a.kind, heldS: Math.round((Date.now() - a.since) / 1000) });
    this.hooks.closeAlerts((x) => x.assistId === a.id);
  }

  private tickLink(now: number) {
    const s = this.s, L = s.link;
    let extra = 0, zoneDepth = 0;
    for (const z of WEAK_ZONES) {
      const dd = Math.hypot(s.pose.x - z.x, s.pose.y - z.y);
      if (dd < z.r) zoneDepth = Math.max(zoneDepth, 1 - dd / z.r);
    }
    extra = zoneDepth * rnd(250, 700);
    const wasUp = L.latencyMs != null;
    if (zoneDepth > 0.55 && now > this.linkLostUntil && Math.random() < 0.004) this.linkLostUntil = now + rnd(2500, 6000);
    const lost = now < this.linkLostUntil;
    const spike = Math.random() < 0.01 ? rnd(60, 160) : 0;
    L.latencyMs = lost ? null : Math.round(this.latencyBase + rnd(-8, 12) + extra + spike);
    L.lossPct = lost ? 100 : +(0.1 + zoneDepth * rnd(2, 9) + Math.random() * 0.3).toFixed(1);
    L.upMbps = lost ? 0 : +(Math.max(1.2, 11 - zoneDepth * 8 + rnd(-1, 1))).toFixed(1);
    L.carriers = lost ? ["offline", "offline"] : zoneDepth > 0.3 ? ["degraded", zoneDepth > 0.6 ? "offline" : "ok"] : ["ok", "ok"];
    if (wasUp && lost) {
      this.log("error", "network", "Link lost: both carriers down", { zone: "Harbor underpass" });
      this.hooks.alert({ severity: "critical", title: "Link lost", detail: s.control === "operator" ? "Operator input is not reaching the vehicle. It is braking to a stop." : "Autonomy continues on route. Commands will time out until the link returns.", vehicleId: s.id });
    } else if (!wasUp && !lost) {
      this.log("info", "network", "Link restored", { latencyMs: L.latencyMs });
      this.hooks.closeAlerts((a) => a.vehicleId === s.id && a.title === "Link lost");
    }
  }

  private tickHealth(dt: number, now: number) {
    const s = this.s, T = s.thermal, P = s.power;
    if (s.labels.length && now - s.labels[s.labels.length - 1].at > 15 * 60e3) s.labels = s.labels.filter((l) => now - l.at < 15 * 60e3);
    T.motorC = approach(T.motorC, 36 + s.drive.throttle * 38 + Math.abs(s.speed) * 0.6, 0.4 * dt);
    T.batteryC = approach(T.batteryC, 27 + Math.abs(s.speed) * 0.25, 0.05 * dt);
    s.compute.cpuPct = clamp(s.compute.cpuPct + rnd(-2, 2), 28, 78);
    T.computeC = approach(T.computeC, 44 + s.compute.cpuPct * 0.32, 0.5 * dt);
    P.soc = clamp(P.soc - (Math.abs(s.speed) * 0.00012 + s.drive.throttle * 0.0009 + 0.00008) * dt * 10, 3, 100);
    P.volts = +(330 + P.soc * 0.7 - s.drive.throttle * 6).toFixed(1);
    P.rangeKm = Math.round(P.soc * 1.9 * (P.sohPct / 100));
    if (P.soc < 20 && !this.lowBatteryWarned) {
      this.lowBatteryWarned = true;
      this.log("warn", "vehicle", "Battery below 20%", { soc: Math.round(P.soc) });
      this.hooks.alert({ severity: "warning", title: "Battery below 20%", detail: `${P.rangeKm} km range left. Schedule a depot return.`, vehicleId: s.id });
    }
    s.wear.brakePadPct = Math.max(0, s.wear.brakePadPct - s.drive.brake * Math.abs(s.speed) * 1e-6 * dt);

    for (const [k, until] of [...this.restarting]) {
      if (now < until) continue;
      this.restarting.delete(k);
      if (k === "autonomy") { s.compute.autonomy = "ok"; this.log("info", "autonomy", "Autonomy stack restarted"); }
      else { s.sensors[k] = this.hardware.has(k) ? "degraded" : "ok"; this.log("info", "vehicle", `${k} back online`, { health: s.sensors[k] }); }
    }
  }

  private addFault(f: Omit<Fault, "at">) {
    const now = Date.now();
    const existing = this.s.faults.find((x) => x.code === f.code);
    if (existing) { existing.at = now; this.hooks.fault(this.s.id, existing, false); return; }
    const fault = { ...f, at: now };
    this.s.faults.push(fault);
    this.hooks.fault(this.s.id, fault, true);
  }

  // ── Commands ────────────────────────────────────────────────────────────

  /** The vehicle's own checks. Runs when the command arrives on board (after uplink latency). */
  validate(cmd: Command): Verdict {
    const s = this.s, d = s.drive, b = s.body, now = () => Date.now();
    const kmh = Math.round(Math.abs(s.speed) * 3.6);
    const moving = Math.abs(s.speed) > 0.3;
    const v = cmd.value;

    switch (cmd.kind) {
      case "control.claim": {
        if (s.control === "operator" && s.controller === cmd.by) return { ok: false, reason: "Already held by you" };
        const wasStopped = s.estop.engaged;
        s.pendingControl = "claim";
        if (!wasStopped) s.control = "transitioning";
        this.log("info", "vehicle", "Handoff to operator started", { by: cmd.by });
        return { ok: true, ms: 900, act: () => {
          s.pendingControl = null;
          s.controller = cmd.by;
          s.control = s.estop.engaged ? "stopped" : "operator";
          d.throttleCmd = 0; d.brakeCmd = 0.3; d.steerCmdDeg = d.steerDeg; d.speedHoldKmh = null;
          this.dwell = null; s.stop = null;
          this.lastDriveAt = now();
          this.streamTimedOut = false;
          return { ok: true, readback: s.estop.engaged ? "Held by operator · stop still latched" : "Operator in control" };
        } };
      }
      case "control.release": {
        if (s.estop.engaged) return { ok: false, reason: "Stop is latched. Reset it before releasing." };
        if (s.offRouteM > 15) return { ok: false, reason: `Off route by ${Math.round(s.offRouteM)} m. Drive within 15 m of the route to release.` };
        if (s.compute.autonomy !== "ok") return { ok: false, reason: "Autonomy stack is not ready" };
        if (s.service === "out_of_service") return { ok: false, reason: "Vehicle is out of service. Park it; autonomy will not take it." };
        if (b.doorOpen) return { ok: false, reason: "Door is open" };
        s.pendingControl = "release";
        s.control = "transitioning";
        this.log("info", "vehicle", "Handoff to autonomy started");
        return { ok: true, ms: 900, act: () => {
          s.pendingControl = null; s.controller = null; s.control = "autonomy"; this.mrm = false; d.speedHoldKmh = null;
          b.turnSignal = "off"; s.comms.talk = false;
          return { ok: true, readback: "Autonomy in control" };
        } };
      }
      case "estop.engage":
        return { ok: true, ms: 0, act: () => {
          s.estop = { engaged: true, source: cmd.source === "wheel" ? "Wheel" : "Console", at: now() };
          s.control = "stopped"; s.pendingControl = null; b.hazards = true; this.mrm = false;
          d.throttleCmd = 0; d.brakeCmd = 1;
          this.log("error", "dbw", "Emergency stop latched", { by: cmd.by, source: cmd.source, kmh });
          return { ok: true, readback: `Stop latched at ${kmh} km/h` };
        } };
      case "estop.reset":
        if (!s.estop.engaged) return { ok: false, reason: "Stop is not latched" };
        if (moving) return { ok: false, reason: `Still moving at ${kmh} km/h` };
        return { ok: true, ms: 600, act: () => {
          s.estop = { engaged: false, source: null, at: null };
          s.controller = cmd.by; s.control = "operator"; d.brakeCmd = 1; d.throttleCmd = 0;
          this.lastDriveAt = now(); this.streamTimedOut = false;
          this.log("info", "dbw", "Emergency stop reset", { by: cmd.by });
          return { ok: true, readback: "Stop reset · operator in control, parked" };
        } };
      case "drive.gear": {
        const g = v as Gear;
        if (!["P", "R", "N", "D"].includes(g)) return { ok: false, reason: "Unknown gear" };
        if (g === d.gear) return { ok: false, reason: `Already in ${g}` };
        if (moving) return { ok: false, reason: `Moving at ${kmh} km/h. Stop to shift.` };
        if (d.brake < 0.25 && !d.parkingBrake) return { ok: false, reason: "Hold the brake to shift" };
        if (b.doorOpen && g !== "P") return { ok: false, reason: "Door is open" };
        return { ok: true, ms: 450, act: () => { d.gear = g; if (g !== "P") d.parkingBrake = false; return { ok: true, readback: `Gear ${g}` + (g !== "P" ? " · parking brake off" : "") }; } };
      }
      case "drive.parking_brake":
        if (v && moving) return { ok: false, reason: `Moving at ${kmh} km/h` };
        return { ok: true, ms: 700, act: () => { d.parkingBrake = !!v; return { ok: true, readback: `Parking brake ${v ? "on" : "off"}` }; } };
      case "drive.speed_hold": {
        if (v == null) return { ok: true, ms: 60, act: () => { d.speedHoldKmh = null; return { ok: true, readback: "Speed hold off" }; } };
        const kmhT = clamp(Math.round(Number(v)), 3, d.speedCapKmh);
        if (d.gear !== "D" && d.gear !== "R") return { ok: false, reason: `In ${d.gear}. Shift to D or R to hold a speed.` };
        if (d.parkingBrake) return { ok: false, reason: "Parking brake is on" };
        return { ok: true, ms: 80, act: () => { d.speedHoldKmh = kmhT; return { ok: true, readback: `Holding ${kmhT} km/h · brake cancels` }; } };
      }
      case "drive.speed_cap": {
        const cap = clamp(Math.round(Number(v)), 5, 40);
        return { ok: true, ms: 60, act: () => { d.speedCapKmh = cap; return { ok: true, readback: `Speed cap ${cap} km/h` }; } };
      }
      case "body.hazards":
        return { ok: true, ms: 110, act: () => { b.hazards = !!v; return { ok: true, readback: `Hazards ${v ? "on" : "off"}` }; } };
      case "body.turn_signal":
        return { ok: true, ms: 110, act: () => { b.turnSignal = v as TurnSignal; return { ok: true, readback: v === "off" ? "Signal off" : `Signalling ${v}` }; } };
      case "body.headlights":
        return { ok: true, ms: 220, act: () => { b.headlights = v as Headlights; return { ok: true, readback: `Headlights ${v}` }; } };
      case "body.wipers":
        return { ok: true, ms: 320, act: () => {
          if (v !== "off" && s.wear.wiperMotor === "fault") {
            b.wipers = "off";
            this.addFault({ code: "B1A20", system: "Body", text: "Wiper motor overcurrent", severity: "warning" });
            return { ok: false, reason: "Wiper motor overcurrent (B1A20). Wipers stayed off." };
          }
          b.wipers = v as Wipers; return { ok: true, readback: `Wipers ${v}` };
        } };
      case "body.horn":
        return { ok: true, ms: 40, act: () => {
          b.horn = !!v; this.hornUntil = v ? now() + 3000 : 0;
          return { ok: true, readback: v ? "Horn sounding" : "Horn off" };
        } };
      case "body.doors_lock":
        if (!v && moving) return { ok: false, reason: `Moving at ${kmh} km/h` };
        return { ok: true, ms: 300, act: () => { b.doorsLocked = !!v; return { ok: true, readback: v ? "Doors locked" : "Doors unlocked" }; } };
      case "body.door":
        if (v === "open") {
          if (moving) return { ok: false, reason: `Moving at ${kmh} km/h` };
          if (d.gear !== "P" && !d.parkingBrake) return { ok: false, reason: "Shift to P or set the parking brake first" };
          if (b.doorsLocked) return { ok: false, reason: "Doors are locked" };
        }
        return { ok: true, ms: 1800, act: () => { b.doorOpen = v === "open"; return { ok: true, readback: b.doorOpen ? "Door open · drive inhibited" : "Door closed" }; } };
      case "body.cabin_lights":
        return { ok: true, ms: 120, act: () => { b.cabinLights = !!v; return { ok: true, readback: `Cabin lights ${v ? "on" : "off"}` }; } };
      case "comms.speaker": {
        const preset = SPEAKER_PRESETS.find((p) => p.id === v);
        if (!preset) return { ok: false, reason: "Unknown announcement" };
        return { ok: true, ms: 250, act: () => {
          s.comms.speaker = preset.text; this.speakerUntil = now() + 4500;
          return { ok: true, readback: `Playing “${preset.text}”` };
        } };
      }
      case "comms.talk":
        return { ok: true, ms: 200, act: () => { s.comms.talk = !!v; return { ok: true, readback: v ? "Cabin intercom open" : "Cabin intercom closed" }; } };
      case "assist.proceed": {
        const a = s.assist;
        if (!a) return { ok: false, reason: "No assist request open" };
        if (!a.canProceed) return { ok: false, reason: "Autonomy cannot pass this on its own. Claim and drive." };
        if (s.control !== "autonomy") return { ok: false, reason: "Vehicle is not in autonomy" };
        return { ok: true, ms: 1200, act: () => {
          this.assistProceedAt = now();
          this.log("info", "autonomy", "Operator approved path", { by: cmd.by, kind: a.kind });
          return { ok: true, readback: "Path approved · proceeding" };
        } };
      }
      case "mrm.pull_over":
        if (d.gear === "P" && !moving) return { ok: false, reason: "Already parked" };
        return { ok: true, ms: 300, act: () => { this.mrm = true; b.hazards = true; return { ok: true, readback: "Pulling over · hazards on" }; } };
      case "perception.label": {
        const p = v as { label?: string; x?: number; y?: number; objectKind?: string };
        if (!p?.label || typeof p.x !== "number" || typeof p.y !== "number") return { ok: false, reason: "Nothing to label" };
        const label = p.label;
        const dist = Math.round(Math.hypot(p.x - s.pose.x, p.y - s.pose.y));
        return { ok: true, ms: 120, act: () => {
          s.labels = [{ id: `lb_${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, label, objectKind: p.objectKind, x: p.x!, y: p.y!, by: cmd.by, at: now() }, ...s.labels].slice(0, 30);
          this.log("info", "autonomy", `Operator label: ${label}${p.objectKind ? ` (perception saw ${p.objectKind})` : ""}`, { by: cmd.by, x: Math.round(p.x!), y: Math.round(p.y!), dist });
          return { ok: true, readback: `Labeled ${label.toLowerCase()} at ${dist} m · sent to autonomy` };
        } };
      }
      case "perception.unlabel":
        if (!s.labels.some((l) => l.id === v)) return { ok: false, reason: "Label already gone" };
        return { ok: true, ms: 80, act: () => { s.labels = s.labels.filter((l) => l.id !== v); return { ok: true, readback: "Label removed" }; } };
      case "log.mark":
        return { ok: true, ms: 80, act: () => ({ ok: true, readback: "Snapshot saved · 30 s before, 10 s after" }) };
      case "diag.run":
        if (moving) return { ok: false, reason: `Moving at ${kmh} km/h. Diagnostics run parked.` };
        if (s.diag.running) return { ok: false, reason: "Diagnostics already running" };
        s.diag.running = true;
        return { ok: true, ms: 4200, act: () => {
          const results = this.runDiag();
          s.diag = { running: false, results, at: now() };
          const bad = results.filter((r) => r.status !== "ok").length;
          this.log(bad ? "warn" : "info", "vehicle", `Diagnostics finished: ${results.length} checks, ${bad} not ok`);
          return { ok: true, readback: `${results.length} checks · ${bad ? `${bad} not ok` : "all ok"}` };
        } };
      case "sys.restart": {
        const target = v as SensorId | "autonomy";
        if (moving) return { ok: false, reason: `Moving at ${kmh} km/h. Restart parked.` };
        if (target !== "autonomy" && !SENSORS.includes(target)) return { ok: false, reason: "Unknown subsystem" };
        return { ok: true, ms: 3200, act: () => {
          this.restarting.set(target, now() + 3000);
          if (target === "autonomy") s.compute.autonomy = "offline"; else s.sensors[target] = "offline";
          this.log("warn", "vehicle", `Restarting ${target}`, { by: cmd.by });
          return { ok: true, readback: `${target} restarting` };
        } };
      }
      case "fault.clear": {
        const f = s.faults.find((x) => x.code === v);
        if (!f) return { ok: false, reason: "Fault not present" };
        return { ok: true, ms: 400, act: () => {
          s.faults = s.faults.filter((x) => x.code !== v);
          const stillThere = f.code === "B1A20" && s.wear.wiperMotor === "fault";
          return { ok: true, readback: stillThere ? "Cleared · returns on next wiper use (hardware fault)" : "Fault cleared" };
        } };
      }
    }
  }

  private runDiag(): DiagResult[] {
    const s = this.s;
    const out: DiagResult[] = SENSORS.map((k) => ({ check: k, status: s.sensors[k], detail: s.sensors[k] === "ok" ? "Nominal" : this.hardware.has(k) ? "Image contrast 31% of baseline: lens obstruction" : "Not responding" }));
    out.push({ check: "brake_pads", status: s.wear.brakePadPct < 20 ? "degraded" : "ok", detail: `${Math.round(s.wear.brakePadPct)}% pad remaining` });
    const lowTire = Math.min(...s.wear.tiresKpa);
    out.push({ check: "tires", status: lowTire < 215 ? "degraded" : "ok", detail: `Lowest ${lowTire} kPa (spec 240)` });
    out.push({ check: "wiper_motor", status: s.wear.wiperMotor, detail: s.wear.wiperMotor === "ok" ? "Current draw nominal" : "Stall current 9.4 A (limit 6 A)" });
    out.push({ check: "battery", status: s.power.sohPct < 85 ? "degraded" : "ok", detail: `State of health ${s.power.sohPct}%` });
    out.push({ check: "link", status: s.link.carriers.includes("offline") ? "degraded" : "ok", detail: `Carriers ${s.link.carriers.join(" / ")}` });
    return out;
  }
}
