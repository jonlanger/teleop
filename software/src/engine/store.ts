// Durable operations data (people, shifts, tickets, work orders, stations, assignments), kept in this browser's localStorage.
// Live vehicle state, telemetry and logs are in memory and start fresh on every load.
import type { Assignment, ServiceStatus, Shift, Station, Ticket, User, WorkOrder } from "@shared/types";
import { SEED_USERS, normalizeTicket, rotaWeek, seedDb, weekStart } from "./seed";

export interface Db {
  version: 1;
  users: User[];
  shifts: Shift[];
  tickets: Ticket[];
  workorders: WorkOrder[];
  stations: Station[];
  assignments: Assignment[];
  service: Record<string, ServiceStatus>;
  counters: { ticket: number; workorder: number; shift: number };
}

const KEY = "teleop.db.v1";

function read(): Db | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function loadDb(): Db {
  const now = Date.now();
  const db = read();
  if (!db) { const fresh = seedDb(now); saveNow(fresh); return fresh; }
  // Roll the standing rota forward: any week from this one to next with no shifts gets the standard pattern.
  const ws = weekStart(now), W = 7 * 86400e3;
  let added = 0;
  for (const w of [ws, ws + W]) {
    if (db.shifts.some((s) => s.start >= w && s.start < w + W)) continue;
    const fresh = rotaWeek(w, now, () => `sh_${++db.counters.shift}`);
    db.shifts.push(...fresh); added += fresh.length;
  }
  if (added) saveNow(db);
  if (migrateSupport(db, now)) saveNow(db);
  return db;
}

function saveNow(db: Db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode or full: the demo still runs, it just won't persist */ }
}

/** Throw away saved data; the next load reseeds. */
export function resetDb() {
  try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function save(db: Db) {
  if (timer) return;
  timer = setTimeout(() => { timer = null; saveNow(db); }, 250);
}

/** Bring data saved before the Support workspace up to date: ticket sources, the support agent, rider tickets. */
function migrateSupport(db: Db, now: number) {
  let changed = false;
  for (const u of SEED_USERS) if (!db.users.some((x) => x.id === u.id)) { db.users.push(u); changed = true; }
  db.tickets = db.tickets.map((t) => {
    // Early migration marked support-raised tickets as customer ones; only tickets with a requester are.
    if (t.source === "customer" && !t.requester) { changed = true; return normalizeTicket({ ...t, source: undefined }, db.users); }
    if (t.source && t.category) return t;
    changed = true; return normalizeTicket(t, db.users);
  });
  if (!db.tickets.some((t) => t.requester)) {
    const fresh = seedDb(now).tickets.filter((t) => t.requester && !db.tickets.some((x) => x.title === t.title));
    for (const t of fresh) db.tickets.push({ ...t, id: `TCK-${++db.counters.ticket}` });
    changed = changed || fresh.length > 0;
  }
  return changed;
}
