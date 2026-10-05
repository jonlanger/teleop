// The teleop domain model, shared by the server, the vehicle simulator and all three apps.

export type ControlStateName = "autonomy" | "operator" | "transitioning" | "stopped";
export type Role = "operator" | "manager" | "engineer" | "support";
export type Gear = "P" | "R" | "N" | "D";
export type TurnSignal = "off" | "left" | "right";
export type Headlights = "off" | "auto" | "low" | "high";
export type Wipers = "off" | "int" | "low" | "high";
export type Health = "ok" | "degraded" | "fault" | "offline";
export type ServiceStatus = "in_service" | "out_of_service";

export interface User { id: string; name: string; role: Role; title: string; certifications?: string[] }

/** What the vehicle itself reports. Every field here is read back from the device, never echoed from a command. */
export interface VehicleState {
  id: string;                     // UNIT-14
  model: string;
  route: string;                  // route id
  routeName: string;
  service: ServiceStatus;
  control: ControlStateName;
  controller: string | null;      // user id holding the vehicle
  pendingControl: "claim" | "release" | null;
  assist: AssistRequest | null;   // autonomy is asking for help
  guide: { by: string; brake: number; offsetM: number } | null;   // an operator is guiding autonomy without claiming
  labels: OperatorLabel[];        // things operators labelled in the camera view, anchored in the world
  stop: { name: string; until: number } | null;   // dwelling at a route stop
  pose: { x: number; y: number; heading: number };   // metres on the site map, radians
  speed: number;                  // m/s, signed (reverse is negative)
  offRouteM: number;              // distance from the planned route
  drive: {
    gear: Gear; parkingBrake: boolean;
    steerDeg: number; steerCmdDeg: number;          // road-wheel angle, actual vs last commanded
    throttle: number; throttleCmd: number;          // 0..1
    brake: number; brakeCmd: number;                // 0..1
    speedCapKmh: number;
    speedHoldKmh: number | null;                    // vehicle-side speed hold while an operator drives
    streamAgeMs: number | null;                     // age of the last drive packet while an operator holds it
  };
  body: {
    hazards: boolean; turnSignal: TurnSignal; headlights: Headlights; wipers: Wipers; horn: boolean;
    doorsLocked: boolean; doorOpen: boolean; cabinLights: boolean;
  };
  comms: { speaker: string | null; talk: boolean; passengers: number };
  estop: { engaged: boolean; source: string | null; at: number | null };
  power: { soc: number; volts: number; rangeKm: number; sohPct: number };
  thermal: { motorC: number; batteryC: number; computeC: number };
  compute: { cpuPct: number; autonomy: Health; sw: string };
  link: { latencyMs: number | null; lossPct: number; upMbps: number; carriers: [Health, Health] };
  sensors: Record<SensorId, Health>;
  wear: { brakePadPct: number; tiresKpa: [number, number, number, number]; wiperMotor: Health };
  odometerKm: number;
  faults: Fault[];
  diag: { running: boolean; results: DiagResult[] | null; at: number | null };
  lastSeen: number;
}

export type SensorId = "cam_front" | "cam_rear" | "cam_left" | "cam_right" | "lidar" | "radar" | "gnss" | "imu";

export interface AssistRequest {
  id: string;
  kind: "blocked_lane" | "pedestrian" | "construction" | "unprotected_turn" | "sensor_degraded";
  title: string;                  // dispatcher voice: "Double-parked truck in lane"
  detail: string;
  since: number;
  canProceed: boolean;            // autonomy can continue if an operator approves the path
  obstacle: { x: number; y: number; heading: number } | null;   // where it is in the world
}

export interface OperatorLabel { id: string; label: string; objectKind?: string; x: number; y: number; by: string; at: number }

export interface Fault { code: string; system: string; text: string; severity: "warning" | "critical"; at: number }
export interface DiagResult { check: string; status: Health; detail: string }

// ── Commands ────────────────────────────────────────────────────────────────

export type CommandKind =
  | "control.claim" | "control.release" | "estop.engage" | "estop.reset"
  | "drive.gear" | "drive.parking_brake" | "drive.speed_cap" | "drive.speed_hold"
  | "body.hazards" | "body.turn_signal" | "body.headlights" | "body.wipers" | "body.horn"
  | "body.doors_lock" | "body.door" | "body.cabin_lights"
  | "comms.speaker" | "comms.talk"
  | "assist.proceed" | "mrm.pull_over" | "log.mark" | "perception.label" | "perception.unlabel"
  | "diag.run" | "sys.restart" | "fault.clear";

/**
 * A command's life on the device:
 * sent (console → server) → received (vehicle acked) → confirmed (vehicle reports the new state)
 * or rejected (vehicle refused, with its reason) / failed (actuator fault) / timeout (no ack).
 */
export type CommandStatus = "sent" | "received" | "confirmed" | "rejected" | "failed" | "timeout";

export interface Command {
  id: string;
  vehicleId: string;
  kind: CommandKind;
  value?: unknown;
  by: string;                     // user id
  source: "console" | "wheel" | "keyboard" | "system";
  status: CommandStatus;
  sentAt: number;
  receivedAt?: number;
  doneAt?: number;
  readback?: string;              // what the vehicle reported after acting, e.g. "Gear D", "Hazards on"
  reason?: string;                // why it was rejected or failed, in the vehicle's words
  rejectedBy?: "server" | "vehicle";
}

// ── Alerts and logs ─────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string;
  vehicleId?: string;
  at: number;
  acknowledgedBy?: string;
  assistId?: string;
  closed?: boolean;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSource = "vehicle" | "dbw" | "autonomy" | "network" | "console" | "wheel" | "server" | "ops";
export interface LogEntry { seq: number; t: number; level: LogLevel; source: LogSource; vehicleId?: string; msg: string; data?: Record<string, unknown> }

export interface TelemetryPoint {
  t: number; speedKmh: number; latencyMs: number | null; soc: number; motorC: number; computeC: number; cpuPct: number;
  steerDeg: number; steerCmdDeg: number; lossPct: number;
}

// ── Fleet operations ────────────────────────────────────────────────────────

export interface Shift {
  id: string; userId: string; start: number; end: number; station: string;
  clockIn?: number; clockOut?: number; note?: string;
}

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved";
export type TicketType = "incident" | "vehicle" | "software" | "station" | "rider";
/** Who raised it. Customer tickets come from riders; the rest from the team or the system. */
export type TicketSource = "customer" | "operator" | "engineering" | "fleet" | "support" | "system";
export type TicketChannel = "app" | "phone" | "email" | "console" | "auto";
export type TicketCategory = "lost_item" | "service" | "accessibility" | "safety" | "vehicle_fault" | "rider_app" | "station" | "software" | "other";
export interface Requester { name: string; contact: string; kind: "rider" | "staff"; rides?: number }
export interface Ticket {
  id: string; title: string; type: TicketType; priority: 1 | 2 | 3 | 4; status: TicketStatus;
  source: TicketSource; channel: TicketChannel; category: TicketCategory; requester?: Requester;
  vehicleId?: string; stop?: string; assignee?: string; reporter: string; createdAt: number; updatedAt: number;
  firstResponseAt?: number;
  body: string; activity: TicketActivity[]; links?: { commandId?: string; alertId?: string; logSeq?: number };
  escalation?: { team: "engineering" | "fleet"; at: number; by: string; note: string; workOrderId?: string; done?: number };
  playbook?: Record<string, number>;   // step id → when it was done
  resolution?: { code: string; summary: string; at: number; by: string };
  duplicateOf?: string;
}
export interface TicketActivity { at: number; by: string; kind: "comment" | "note" | "reply" | "status" | "assign" | "created" | "link" | "escalate" | "resolve" | "step"; text: string }

export type WorkOrderStatus = "scheduled" | "in_progress" | "blocked" | "done";
export interface WorkOrder {
  id: string; vehicleId: string; component: string; kind: "preventive" | "corrective" | "inspection" | "software";
  status: WorkOrderStatus; dueAt?: number; dueKm?: number; assignee?: string; notes: string; createdAt: number; ticketId?: string;
  takesOutOfService: boolean;
}

export interface Station { id: string; name: string; wheelSerial: string; wheelFw: string; lastSeen: number | null; userId: string | null; halo: ControlStateName | "off" }

export interface Assignment { vehicleId: string; userId: string | null }

export interface Metrics {
  inService: number; total: number; claimed: number; assistOpen: number; assistLastHour: number; onShift: number;
  openTickets: number; commands15m: number; commandP95Ms: number | null; rejected15m: number;
}

// ── Wire protocol ───────────────────────────────────────────────────────────

export type ClientMsg =
  | { t: "hello"; userId: string; station?: string }
  | { t: "cmd"; id: string; vehicleId: string; kind: CommandKind; value?: unknown; source: Command["source"] }
  | { t: "drive"; vehicleId: string; steer: number; throttle: number; brake: number; seq: number }
  /** Remote guidance: brake and path nudge (metres, + is right) while autonomy keeps the vehicle. 10 Hz while active. */
  | { t: "guide"; vehicleId: string; brake: number; offset: number; seq: number }
  | { t: "ack"; alertId: string }
  | { t: "wheel"; station: string; serial: string; fw: string; connected: boolean; halo: Station["halo"] };

export type ResourceName = "tickets" | "shifts" | "workorders" | "vehicles" | "users" | "stations" | "assignments";

export type ServerMsg =
  | { t: "welcome"; now: number; vehicles: VehicleState[]; alerts: Alert[]; commands: Command[]; logs: LogEntry[] }
  | { t: "fleet"; now: number; vehicles: VehicleState[] }
  | { t: "cmd"; command: Command }
  | { t: "alert"; alert: Alert }
  | { t: "logs"; entries: LogEntry[] }
  | { t: "invalidate"; resource: ResourceName };
