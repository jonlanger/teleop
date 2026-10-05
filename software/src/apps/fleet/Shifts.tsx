// The week's schedule, hour-by-hour operator coverage, and clock in and out.
import { useMemo, useState } from "react";
import type { Shift, Station, User } from "@shared/types";
import { Button } from "../../ds";
import { api, useResource } from "../../lib/api";
import { useVehicles } from "../../lib/live";
import { clock, day, duration } from "../../lib/format";
import { Avatar, Dialog, Field, PageHead, Panel } from "../../ui";

const D = 86400e3, H = 3600e3;
const TARGET_RATIO = 5; // vehicles per operator

function weekStart(t: number) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * D; }

export type ShiftStatus = "scheduled" | "late" | "on" | "done" | "missed";
export function shiftStatus(s: Shift, now = Date.now()): ShiftStatus {
  if (s.clockOut) return "done";
  if (s.clockIn) return "on";
  if (now < s.start) return "scheduled";
  return now < s.end ? "late" : "missed";
}
const STATUS_LABEL: Record<ShiftStatus, string> = { scheduled: "Scheduled", late: "Not clocked in", on: "On shift", done: "Done", missed: "Missed" };

export function Shifts({ me, users }: { me: User; users: User[] }) {
  const [week, setWeek] = useState(() => weekStart(Date.now()));
  const shifts = useResource<Shift[]>(`/api/shifts?from=${week - D}&to=${week + 7 * D}`, ["shifts"]);
  const stations = useResource<Station[]>("/api/stations", ["stations"]).data ?? [];
  const vehicles = useVehicles();
  const [edit, setEdit] = useState<Partial<Shift> | null>(null);
  const now = Date.now();
  const staff = users.filter((u) => u.role === "operator" || u.role === "manager");
  const opIds = new Set(users.filter((u) => u.role === "operator").map((u) => u.id));
  const list = shifts.data ?? [];
  const manager = me.role === "manager";

  const inService = vehicles.filter((v) => v.service === "in_service").length;
  const onNow = list.filter((s) => opIds.has(s.userId) && s.clockIn && !s.clockOut).length;
  const scheduledNow = list.filter((s) => opIds.has(s.userId) && s.start <= now && s.end > now).length;
  const needed = Math.ceil(inService / TARGET_RATIO);

  // Operators scheduled per hour, for every hour of the week.
  const coverage = useMemo(() => Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => {
    const t = week + d * D + h * H + H / 2;
    return list.filter((s) => opIds.has(s.userId) && s.start <= t && s.end > t).length;
  })), [list, week]);
  const gaps = coverage.flat().filter((n) => n < needed).length;

  return (
    <>
      <PageHead title="Shifts" sub={`Week of ${day(week)}. Target is one operator per ${TARGET_RATIO} vehicles in service.`}
        actions={<>
          <Button variant="ghost" onClick={() => setWeek(week - 7 * D)}>Previous week</Button>
          <Button variant="ghost" onClick={() => setWeek(weekStart(Date.now()))}>This week</Button>
          <Button variant="ghost" onClick={() => setWeek(week + 7 * D)}>Next week</Button>
          {manager && <Button variant="primary" onClick={() => setEdit({ start: Math.max(now, week) - (Math.max(now, week) % H) + H, end: Math.max(now, week) - (Math.max(now, week) % H) + 9 * H, station: "ST-01" })}>Add shift</Button>}
        </>} />
      <div className="stats">
        <div className="stat"><span className="label">Clocked in now</span><span className="readout">{onNow}<small> of {scheduledNow} scheduled</small></span><span className="sub">{onNow >= needed ? `Covers ${inService} vehicles` : `Short ${needed - onNow} for ${inService} vehicles`}</span></div>
        <div className="stat"><span className="label">Hours below target</span><span className="readout">{gaps}<small> h this week</small></span><span className="sub">Needs {needed} {needed === 1 ? "operator" : "operators"} at all times</span></div>
        <div className="stat"><span className="label">Scheduled hours</span><span className="readout">{Math.round(list.filter((s) => opIds.has(s.userId) && s.start >= week && s.start < week + 7 * D).reduce((a, s) => a + (s.end - s.start), 0) / H)}<small> h</small></span><span className="sub">Operators, this week</span></div>
      </div>

      <Panel title="Coverage" actions={<span className="legend"><span><i className="cov-key" />Operators scheduled per hour</span><span><i className="cov-key gap" />Below target</span></span>}>
        <div className="cov">
          <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="cov-h">{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
          {coverage.map((row, d) => (
            <div key={d} style={{ display: "contents" }}>
              <span className="cov-day">{day(week + d * D)}</span>
              {row.map((n, h) => (
                <span key={h} className={`cov-c${n < needed ? " gap" : ""}${week + d * D + h * H <= now && now < week + d * D + (h + 1) * H ? " now" : ""}`}
                  style={{ opacity: n < needed ? 1 : 0.35 + Math.min(1, n / Math.max(needed * 2, 1)) * 0.65 }} title={`${day(week + d * D)} ${String(h).padStart(2, "0")}:00 · ${n} scheduled`}>{n || ""}</span>
              ))}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Schedule" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table className="t sched">
            <thead><tr><th>Person</th>{Array.from({ length: 7 }, (_, d) => <th key={d} className={week + d * D <= now && now < week + (d + 1) * D ? "today" : ""}>{day(week + d * D)}</th>)}</tr></thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id}>
                  <td><span className="row"><Avatar name={u.name} /><span><div style={{ fontWeight: 650 }}>{u.name}</div><div className="muted" style={{ fontSize: 12 }}>{u.title}</div></span></span></td>
                  {Array.from({ length: 7 }, (_, d) => {
                    const mine = list.filter((s) => s.userId === u.id && s.start >= week + d * D && s.start < week + (d + 1) * D);
                    return (
                      <td key={d} className="sched-cell">
                        {mine.map((s) => {
                          const st = shiftStatus(s, now);
                          return (
                            <button key={s.id} className={`shift s-${st}`} onClick={() => setEdit(s)}>
                              <span className="mono">{clock(s.start)}–{clock(s.end)}</span>
                              <span className="shift-meta">{s.station} · {STATUS_LABEL[st]}</span>
                            </button>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <ShiftDialog shift={edit} me={me} users={staff} stations={stations} onClose={() => setEdit(null)} />
    </>
  );
}

function ShiftDialog({ shift, me, users, stations, onClose }: { shift: Partial<Shift> | null; me: User; users: User[]; stations: Station[]; onClose: () => void }) {
  const [d, setD] = useState<Partial<Shift>>({});
  const [err, setErr] = useState<string | null>(null);
  const key = shift?.id ?? (shift ? "new" : "");
  const [loaded, setLoaded] = useState("");
  if (key !== loaded) { setLoaded(key); setD(shift ?? {}); setErr(null); }
  const manager = me.role === "manager";
  const isNew = !shift?.id;
  const st = shift?.id ? shiftStatus(shift as Shift) : null;
  const run = (p: Promise<unknown>) => p.then(onClose, (e: Error) => setErr(e.message));
  const local = (t?: number) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60e3).toISOString().slice(0, 16) : "");
  const own = shift?.userId === me.id;

  return (
    <Dialog open={!!shift} title={isNew ? "Add shift" : "Shift"} onClose={onClose}
      footer={<>
        {!isNew && manager && !shift?.clockIn && <Button variant="ghost" onClick={() => run(api("DELETE", `/api/shifts/${shift!.id}`))}>Remove shift</Button>}
        {!isNew && (own || manager) && (st === "scheduled" || st === "late") && <Button onClick={() => run(api("POST", `/api/shifts/${shift!.id}/clock`, { action: "in" }))}>Clock in</Button>}
        {!isNew && (own || manager) && st === "on" && <Button onClick={() => run(api("POST", `/api/shifts/${shift!.id}/clock`, { action: "out" }))}>Clock out</Button>}
        {manager && <Button variant="primary" onClick={() => run(isNew ? api("POST", "/api/shifts", d) : api("PATCH", `/api/shifts/${shift!.id}`, d))}>{isNew ? "Add shift" : "Save"}</Button>}
      </>}>
      <Field label="Person">
        <select className="select" disabled={!manager} value={d.userId ?? ""} onChange={(e) => setD({ ...d, userId: e.target.value })}>
          <option value="" disabled>Choose</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Starts"><input className="input" type="datetime-local" disabled={!manager} value={local(d.start)} onChange={(e) => setD({ ...d, start: new Date(e.target.value).getTime() })} /></Field>
        <Field label="Ends"><input className="input" type="datetime-local" disabled={!manager} value={local(d.end)} onChange={(e) => setD({ ...d, end: new Date(e.target.value).getTime() })} /></Field>
      </div>
      <Field label="Station">
        <select className="select" disabled={!manager} value={d.station ?? ""} onChange={(e) => setD({ ...d, station: e.target.value })}>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
          <option value="Office">Office</option>
        </select>
      </Field>
      <Field label="Note"><input className="input" disabled={!manager} value={d.note ?? ""} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
      {shift?.clockIn && <div className="muted">Clocked in {clock(shift.clockIn)}{shift.clockOut ? `, out ${clock(shift.clockOut)} (${duration(shift.clockOut - shift.clockIn)})` : ""}</div>}
      {d.start && d.end && d.end > d.start && <div className="muted">{duration(d.end - d.start)}</div>}
      {err && <div className="form-error">{err}</div>}
    </Dialog>
  );
}
