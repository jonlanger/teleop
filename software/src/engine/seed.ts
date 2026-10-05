// First-run data: a small operations team, this week's shifts, open tickets and work orders.
import type { Shift, Station, Ticket, TicketCategory, TicketChannel, User, WorkOrder } from "@shared/types";
import { CATEGORY_FOR_TYPE, sourceForRole } from "@shared/support";
import type { Db } from "./store";
import type { VehicleSeed } from "./sim/vehicle";

export const VEHICLE_SEEDS: VehicleSeed[] = [
  { id: "UNIT-03", route: "campus", startS: 120, soc: 86, odometerKm: 18240, sw: "av 4.12.1", latencyBase: 52 },
  { id: "UNIT-07", route: "downtown", startS: 40, soc: 71, odometerKm: 22410, sw: "av 4.12.1", latencyBase: 64, wiperFault: true },
  { id: "UNIT-11", route: "harbor", startS: 900, soc: 64, odometerKm: 30115, sw: "av 4.12.1", latencyBase: 71 },
  { id: "UNIT-14", route: "downtown", startS: 900, soc: 92, odometerKm: 12880, sw: "av 4.12.1", latencyBase: 48 },
  { id: "UNIT-18", route: "airport", startS: 300, soc: 58, odometerKm: 27702, sw: "av 4.12.1", latencyBase: 58 },
  { id: "UNIT-21", route: "campus", startS: 1100, soc: 77, odometerKm: 16930, sw: "av 4.12.1", latencyBase: 55, degraded: ["cam_left"] },
  { id: "UNIT-25", route: "harbor", startS: 100, soc: 49, odometerKm: 33470, sw: "av 4.11.4", latencyBase: 88 },
  { id: "UNIT-29", route: "airport", startS: 1200, soc: 81, odometerKm: 41205, sw: "av 4.12.1", latencyBase: 61, brakePadPct: 16, tiresKpa: [238, 241, 212, 240] },
  { id: "UNIT-32", route: "downtown", startS: 1500, soc: 95, odometerKm: 9120, sw: "av 4.11.4", latencyBase: 45, service: "out_of_service" },
  { id: "UNIT-36", route: "harbor", startS: 1700, soc: 67, odometerKm: 21480, sw: "av 4.12.1", latencyBase: 69 },
];

const USERS: User[] = [
  { id: "u_dana", name: "Dana Ortiz", role: "manager", title: "Fleet manager" },
  { id: "u_sam", name: "Sam Rivera", role: "operator", title: "Senior operator", certifications: ["Gen 2 shuttle", "Remote driving", "Trainer"] },
  { id: "u_priya", name: "Priya Nair", role: "operator", title: "Operator", certifications: ["Gen 2 shuttle", "Remote driving"] },
  { id: "u_leo", name: "Leo Park", role: "operator", title: "Operator", certifications: ["Gen 2 shuttle", "Remote driving"] },
  { id: "u_mara", name: "Mara Chen", role: "operator", title: "Operator", certifications: ["Gen 2 shuttle", "Remote assist"] },
  { id: "u_tomas", name: "Tomás Silva", role: "operator", title: "Operator", certifications: ["Gen 2 shuttle", "Remote driving"] },
  { id: "u_aisha", name: "Aisha Bello", role: "operator", title: "Operator", certifications: ["Gen 2 shuttle", "Remote driving"] },
  { id: "u_kenji", name: "Kenji Watanabe", role: "engineer", title: "Vehicle engineer" },
  { id: "u_ruth", name: "Ruth Adeyemi", role: "support", title: "Support lead" },
  { id: "u_jordan", name: "Jordan Lee", role: "support", title: "Support agent" },
];

const H = 3600e3, D = 24 * H;

function weekStart(now: number) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return d.getTime() - dow * D;
}

/** The standing weekly rota. Shifts already in the past get clock times, as if they happened. */
export function rotaWeek(ws: number, now: number, nextId: () => string): Shift[] {
  const shifts: Shift[] = [];
  const add = (userId: string, day: number, startH: number, hours: number, station: string) => {
    const start = ws + day * D + startH * H, end = start + hours * H;
    const s: Shift = { id: nextId(), userId, start, end, station };
    if (start < now) s.clockIn = start + Math.round(Math.random() * 6) * 60e3;
    if (end < now) s.clockOut = end + Math.round(Math.random() * 10) * 60e3;
    shifts.push(s);
  };
  for (let day = 0; day < 7; day++) {
    const weekend = day >= 5;
    if (!weekend) { add("u_sam", day, 6, 8, "ST-01"); add("u_priya", day, 6, 8, "ST-02"); add("u_leo", day, 14, 8, "ST-01"); add("u_mara", day, 14, 8, "ST-02"); add("u_dana", day, 8, 9, "Office"); }
    else { add("u_aisha", day, 6, 8, "ST-01"); add(day === 5 ? "u_leo" : "u_mara", day, 14, 8, "ST-01"); add("u_sam", day, 10, 6, "ST-02"); }
    add(day === 5 ? "u_priya" : "u_tomas", day, 22, 8, "ST-03");
  }
  return shifts;
}

export { weekStart };

export const SEED_USERS = USERS;

type Draft = Omit<Ticket, "id" | "activity" | "updatedAt" | "source" | "channel" | "category"> & Partial<Pick<Ticket, "source" | "channel" | "category">> & { activity?: Ticket["activity"] };

/** Fill in where a ticket came from, for seeds and for tickets saved before support existed. */
export function normalizeTicket<T extends Partial<Ticket> & Pick<Ticket, "type" | "reporter">>(t: T, users: User[]): Ticket {
  const role = users.find((u) => u.id === t.reporter)?.role ?? "support";
  const source = t.source ?? (t.requester ? "customer" : t.title?.startsWith("Emergency stop") ? "operator" : sourceForRole(role));
  return {
    ...t, source,
    channel: t.channel ?? (source === "customer" ? "phone" : t.title?.startsWith("Emergency stop") ? "auto" : "console"),
    category: t.category ?? (CATEGORY_FOR_TYPE[t.type] as TicketCategory),
    activity: (t.activity ?? []).map((a) => (a.kind === "comment" ? { ...a, kind: "note" as const } : a)),
  } as Ticket;
}

const RIDERS = ["Alex Morgan", "Jamie Ortiz", "Casey Wong", "Riley Patel", "Morgan Diaz", "Taylor Brooks", "Drew Kim", "Avery Shah", "Quinn Foster", "Rowan Ellis"];
export function rider(seed: number) {
  const name = RIDERS[Math.abs(seed) % RIDERS.length];
  const phone = seed % 2 === 0;
  return { name, kind: "rider" as const, rides: 3 + (Math.abs(seed) % 40),
    contact: phone ? `(555) 01${String(Math.abs(seed) % 100).padStart(2, "0")}-${String(1000 + (Math.abs(seed * 37) % 9000))}` : `${name.toLowerCase().replace(/ /g, ".")}@example.com` };
}

/** What riders write in about. {stop} and {vehicle} are filled from a real vehicle and route. */
export const CUSTOMER_TEMPLATES: { category: TicketCategory; priority: Ticket["priority"]; channel: TicketChannel; title: string; body: string }[] = [
  { category: "lost_item", priority: 3, channel: "app", title: "Left my backpack on the shuttle", body: "Got off at {stop} and left a grey backpack on the rear bench. Laptop inside. Please help." },
  { category: "lost_item", priority: 3, channel: "phone", title: "Phone left on board", body: "Caller left a phone in a blue case on {vehicle}, got off at {stop}." },
  { category: "service", priority: 3, channel: "app", title: "Shuttle didn't stop at {stop}", body: "I was waiting at {stop} and the shuttle went past without stopping." },
  { category: "service", priority: 4, channel: "email", title: "Waited 20 minutes at {stop}", body: "The app said 3 minutes. I waited 20 at {stop} before one came." },
  { category: "accessibility", priority: 2, channel: "phone", title: "Ramp didn't deploy at {stop}", body: "Caller uses a wheelchair. The door opened at {stop} but the ramp did not come out. Had to wait for the next shuttle." },
  { category: "safety", priority: 2, channel: "app", title: "Shuttle braked very hard near {stop}", body: "Hard stop near {stop}, I nearly fell. Nobody was hurt but it was scary." },
  { category: "rider_app", priority: 4, channel: "email", title: "Rider app shows the wrong arrival time", body: "Arrival times for {stop} jump around and are often wrong by several minutes." },
];

export function seedDb(now: number): Db {
  const ws = weekStart(now);
  let n = 0;
  const nextId = () => `sh_${++n}`;
  // Last week, this week and next, so the schedule and the night shift spanning Monday morning are covered.
  const shifts = [...rotaWeek(ws - 7 * D, now, nextId), ...rotaWeek(ws, now, nextId), ...rotaWeek(ws + 7 * D, now, nextId)];
  // One operator is on shift but hasn't clocked in, so the roster has something to chase.
  const active = shifts.filter((s) => s.start <= now && s.end > now && s.userId !== "u_dana");
  if (active.length > 1) delete active[active.length - 1].clockIn;

  const onShift = [...new Set(active.map((s) => s.userId))];
  const ops = onShift.length ? onShift : ["u_sam"];
  const assignments = VEHICLE_SEEDS.map((v, i) => ({ vehicleId: v.id, userId: v.service === "out_of_service" ? null : ops[i % ops.length] }));

  const stations: Station[] = [
    { id: "ST-01", name: "Ops room · desk 1", wheelSerial: "TW-2610-0007", wheelFw: "1.4.2", lastSeen: now - 40e3, userId: null, halo: "off" },
    { id: "ST-02", name: "Ops room · desk 2", wheelSerial: "TW-2610-0012", wheelFw: "1.4.2", lastSeen: now - 120e3, userId: null, halo: "off" },
    { id: "ST-03", name: "Ops room · desk 3", wheelSerial: "TW-2610-0019", wheelFw: "1.3.9", lastSeen: now - 9 * H, userId: null, halo: "off" },
    { id: "ST-04", name: "Training bay", wheelSerial: "TW-2610-0002", wheelFw: "1.4.0", lastSeen: now - 3 * D, userId: null, halo: "off" },
  ];

  let t = 1040;
  const tk = (p: Draft): Ticket => normalizeTicket({
    ...p, id: `TCK-${++t}`, updatedAt: p.createdAt,
    activity: [{ at: p.createdAt, by: p.reporter, kind: "created", text: "Opened" }, ...(p.activity ?? [])],
  }, USERS);
  const tickets: Ticket[] = [
    tk({ title: "Wiper motor fails on UNIT-07", type: "vehicle", priority: 2, status: "in_progress", vehicleId: "UNIT-07", assignee: "u_kenji", reporter: "u_priya", createdAt: now - 5 * H,
      body: "Wipers rejected with overcurrent during light rain on Downtown loop. Vehicle reports B1A20. Kept in service; rain forecast tonight.",
      activity: [{ at: now - 4 * H, by: "u_kenji", kind: "comment", text: "Pulled the current log. Stall current 9.4 A against a 6 A limit. Ordering a motor; WO-2207." }] }),
    tk({ title: "Left camera degraded on UNIT-21", type: "vehicle", priority: 2, status: "open", vehicleId: "UNIT-21", reporter: "u_sam", createdAt: now - 2 * H,
      body: "Autonomy keeps capping at 10 km/h and asking for help on Campus circulator. Looks like a smudge or film on the lens." }),
    tk({ title: "Harbor underpass drops the link", type: "station", priority: 2, status: "waiting", reporter: "u_ruth", assignee: "u_ruth", createdAt: now - 3 * D,
      body: "Both carriers fade near the underpass at the end of Harbor shuttle. Operators lose drive input for 2 to 6 s. Waiting on the carrier for a small-cell survey.",
      activity: [{ at: now - 2 * D, by: "u_ruth", kind: "status", text: "Waiting on carrier survey, ref 88-1024" }] }),
    tk({ title: "Rider left a bag on UNIT-14", type: "rider", priority: 3, status: "open", vehicleId: "UNIT-14", reporter: "u_leo", createdAt: now - 50 * 60e3,
      source: "customer", channel: "phone", category: "lost_item", requester: rider(1), stop: "City Hall",
      body: "Rider called support. Black backpack, rear bench. Hold at depot on next pass." }),
    tk({ title: "Desk 3 wheel on old firmware", type: "station", priority: 3, status: "open", reporter: "u_kenji", createdAt: now - 26 * H,
      body: "TW-2610-0019 is on 1.3.9. Halo pulse timing differs from the console's 900 ms on 1.3.x. Flash to 1.4.2 before the next night shift." }),
    tk({ title: "UNIT-29 front-right tire low", type: "vehicle", priority: 2, status: "open", vehicleId: "UNIT-29", reporter: "u_kenji", createdAt: now - 7 * H,
      body: "Tire 3 at 212 kPa against a 240 spec, slow loss over two days." }),
    tk({ title: "Release rejected repeatedly off route", type: "software", priority: 4, status: "resolved", reporter: "u_mara", assignee: "u_kenji", createdAt: now - 4 * D,
      body: "Release was refused three times after driving around a closure. Working as intended: vehicle must be within 15 m of route. Added the distance to the rejection message.",
      activity: [{ at: now - 3 * D, by: "u_kenji", kind: "status", text: "Resolved: message now states the distance" }] }),
    tk({ title: "Stop used for cyclist swerve, UNIT-11", type: "incident", priority: 1, status: "resolved", vehicleId: "UNIT-11", reporter: "u_tomas", assignee: "u_dana", createdAt: now - 2 * D,
      body: "Emergency stop at 22 km/h when a cyclist cut across. No contact. Video saved to the incident folder.",
      activity: [{ at: now - 2 * D + 2 * H, by: "u_dana", kind: "comment", text: "Reviewed footage. Correct use of the stop. Closing." }, { at: now - 2 * D + 2 * H, by: "u_dana", kind: "status", text: "Resolved" }],
      resolution: { code: "no_fault", summary: "Correct use of the emergency stop. No contact, footage filed.", at: now - 2 * D + 2 * H, by: "u_dana" } }),
    // Riders: calls, emails and rider-app reports.
    tk({ title: "Ramp didn't deploy at Market Square", type: "rider", category: "accessibility", channel: "phone", priority: 2, status: "open", vehicleId: "UNIT-14", stop: "Market Square",
      requester: rider(3), reporter: "u_ruth", createdAt: now - 25 * 60e3,
      body: "Caller uses a wheelchair. The door opened at Market Square but the ramp did not come out. Had to wait for the next shuttle." }),
    tk({ title: "Shuttle braked very hard near Civic Park", type: "rider", category: "safety", channel: "app", priority: 2, status: "open", vehicleId: "UNIT-07", stop: "Civic Park",
      requester: rider(8), reporter: "u_jordan", createdAt: now - 90 * 60e3, body: "Hard stop near Civic Park, I nearly fell. Nobody was hurt but it was scary." }),
    tk({ title: "Shuttle didn't stop at Pier 3", type: "rider", category: "service", channel: "app", priority: 3, status: "open", vehicleId: "UNIT-25", stop: "Pier 3",
      requester: rider(5), reporter: "u_jordan", createdAt: now - 3 * H, body: "I was waiting at Pier 3 and the shuttle went past without stopping." }),
    tk({ title: "Waited 20 minutes at Terminal A", type: "rider", category: "service", channel: "email", priority: 4, status: "in_progress", vehicleId: "UNIT-18", stop: "Terminal A",
      requester: rider(12), reporter: "u_jordan", assignee: "u_jordan", createdAt: now - 26 * H, firstResponseAt: now - 22 * H,
      body: "The app said 3 minutes. I waited 20 at Terminal A before one came.",
      activity: [{ at: now - 22 * H, by: "u_jordan", kind: "reply", text: "Hi Riley, thanks for letting us know. We're looking into it and will update you today." }] }),
    tk({ title: "Rider app shows the wrong arrival time", type: "software", category: "rider_app", channel: "email", priority: 4, status: "waiting", stop: "Elm Station",
      requester: rider(7), reporter: "u_ruth", assignee: "u_ruth", createdAt: now - 2 * D, firstResponseAt: now - 2 * D + 2 * H,
      body: "Arrival times for Elm Station jump around and are often wrong by several minutes.",
      escalation: { team: "engineering", at: now - 2 * D + 3 * H, by: "u_ruth", note: "ETA feed lags the vehicle position by about 40 s on Harbor shuttle." },
      activity: [{ at: now - 2 * D + 2 * H, by: "u_ruth", kind: "reply", text: "Hi Avery, thanks. We can see the times are off and have asked engineering to look at the arrival feed." },
        { at: now - 2 * D + 3 * H, by: "u_ruth", kind: "escalate", text: "Sent to engineering: ETA feed lags the vehicle position by about 40 s on Harbor shuttle." }] }),
    tk({ title: "Phone left on board", type: "rider", category: "lost_item", channel: "phone", priority: 3, status: "resolved", vehicleId: "UNIT-36", stop: "6th & Dock",
      requester: rider(4), reporter: "u_ruth", assignee: "u_ruth", createdAt: now - 30 * H, firstResponseAt: now - 29 * H,
      body: "Caller left a phone in a blue case on UNIT-36, got off at 6th & Dock.",
      playbook: { ride: now - 29 * H, hold: now - 28 * H, tell: now - 27 * H, close: now - 20 * H },
      activity: [{ at: now - 29 * H, by: "u_ruth", kind: "reply", text: "Hi Morgan, we found it on UNIT-36. It's held at the Depot front desk." }],
      resolution: { code: "returned", summary: "Collected from the Depot desk with ID.", at: now - 20 * H, by: "u_ruth" } }),
  ];

  let w = 2200;
  const wo = (p: Omit<WorkOrder, "id">): WorkOrder => ({ ...p, id: `WO-${++w}` });
  const workorders: WorkOrder[] = [
    wo({ vehicleId: "UNIT-29", component: "Brake pads, front axle", kind: "corrective", status: "scheduled", dueAt: now + 1 * D, assignee: "u_kenji", notes: "Pads at 16%. Replace both front.", createdAt: now - 6 * H, takesOutOfService: true }),
    wo({ vehicleId: "UNIT-29", component: "Tire 3 (front right)", kind: "inspection", status: "scheduled", dueAt: now + 6 * H, notes: "Check for puncture; reseat valve.", createdAt: now - 6 * H, ticketId: "TCK-1046", takesOutOfService: false }),
    wo({ vehicleId: "UNIT-07", component: "Wiper motor", kind: "corrective", status: "blocked", assignee: "u_kenji", notes: "Part on order, ETA 2 days.", createdAt: now - 4 * H, ticketId: "TCK-1041", takesOutOfService: false }),
    wo({ vehicleId: "UNIT-32", component: "Autonomy software 4.12.1", kind: "software", status: "in_progress", assignee: "u_kenji", notes: "OTA staged; validation drive on the test loop after install.", createdAt: now - 3 * H, takesOutOfService: true }),
    wo({ vehicleId: "UNIT-25", component: "Autonomy software 4.12.1", kind: "software", status: "scheduled", dueAt: now + 2 * D, notes: "Install at depot overnight.", createdAt: now - 3 * H, takesOutOfService: true }),
    wo({ vehicleId: "UNIT-11", component: "30,000 km service", kind: "preventive", status: "scheduled", dueKm: 30500, notes: "Coolant, cabin filter, alignment, sensor calibration.", createdAt: now - 2 * D, takesOutOfService: true }),
    wo({ vehicleId: "UNIT-21", component: "Left camera lens", kind: "inspection", status: "scheduled", dueAt: now + 3 * H, notes: "Clean and recheck contrast; replace cover glass if scratched.", createdAt: now - 90 * 60e3, ticketId: "TCK-1042", takesOutOfService: false }),
    wo({ vehicleId: "UNIT-18", component: "Annual safety inspection", kind: "inspection", status: "done", notes: "Passed.", createdAt: now - 6 * D, takesOutOfService: true }),
  ];

  return {
    version: 1, users: USERS, shifts, tickets, workorders, stations, assignments,
    service: Object.fromEntries(VEHICLE_SEEDS.map((v) => [v.id, v.service ?? "in_service"])),
    counters: { ticket: t, workorder: w, shift: n },
  };
}
