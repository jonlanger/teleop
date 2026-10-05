// Who each vehicle is assigned to, whether it is in service, and what's open against it.
import { useState } from "react";
import type { Assignment, Shift, Ticket, User, WorkOrder } from "@shared/types";
import { kmh } from "@shared/controls";
import { Button, ControlState, LinkMeter } from "../../ds";
import { api, useResource } from "../../lib/api";
import { useVehicles } from "../../lib/live";
import { Link } from "../../lib/router";
import { PageHead, Panel } from "../../ui";

export function Vehicles({ me, users }: { me: User; users: User[] }) {
  const vehicles = useVehicles();
  const assignments = useResource<Assignment[]>("/api/assignments", ["assignments"]).data ?? [];
  const now = Date.now();
  const shifts = useResource<Shift[]>(`/api/shifts?from=${now - 1}&to=${now + 1}`, ["shifts"]).data ?? [];
  const tickets = useResource<Ticket[]>("/api/tickets", ["tickets"]).data ?? [];
  const wos = useResource<WorkOrder[]>("/api/workorders", ["workorders"]).data ?? [];
  const [err, setErr] = useState<string | null>(null);
  const onShift = new Set(shifts.filter((s) => s.clockIn && !s.clockOut).map((s) => s.userId));
  const operators = users.filter((u) => u.role === "operator");
  const canAssign = me.role === "manager";
  const canService = me.role === "manager" || me.role === "engineer";
  const load = (uid: string) => assignments.filter((a) => a.userId === uid).length;
  const run = (p: Promise<unknown>) => p.then(() => setErr(null), (e: Error) => setErr(e.message));

  return (
    <>
      <PageHead title="Vehicles" sub="Assign vehicles to operators on shift. An operator sees their vehicles under Mine in the console." />
      <Panel title="Load by operator">
        <div className="row wrap" style={{ gap: 12 }}>
          {operators.map((u) => (
            <div key={u.id} className="card load">
              <div style={{ fontWeight: 650 }}>{u.name}</div>
              <div className="row"><span className="readout" style={{ fontSize: 22 }}>{load(u.id)}</span><span className="muted" style={{ fontSize: 12 }}>vehicles</span></div>
              <span className={`tag${onShift.has(u.id) ? " ink" : ""}`}>{onShift.has(u.id) ? "Clocked in" : "Off shift"}</span>
            </div>
          ))}
        </div>
      </Panel>
      {err && <div className="form-error" style={{ marginTop: 16 }}>{err}</div>}
      <Panel title="Fleet" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vehicle</th><th>State</th><th>Route</th><th>Assigned to</th><th className="num">Speed</th><th>Link</th><th className="num">Odometer</th><th>Software</th><th>Open</th><th>Service</th></tr></thead>
            <tbody>
              {vehicles.map((v) => {
                const a = assignments.find((x) => x.vehicleId === v.id);
                const openT = tickets.filter((t) => t.vehicleId === v.id && t.status !== "resolved").length;
                const openW = wos.filter((w) => w.vehicleId === v.id && w.status !== "done").length;
                const oos = v.service === "out_of_service";
                return (
                  <tr key={v.id}>
                    <td className="id"><Link href={`/operate?v=${v.id}`}>{v.id}</Link></td>
                    <td>{oos ? <span className="tag">Out of service</span> : <ControlState state={v.control} />}</td>
                    <td>{v.routeName}</td>
                    <td>
                      <select className="select sm" style={{ width: 190 }} disabled={!canAssign || oos} value={a?.userId ?? ""}
                        onChange={(e) => run(api("PUT", `/api/assignments/${v.id}`, { userId: e.target.value || null }))} aria-label={`Assign ${v.id}`}>
                        <option value="">Unassigned</option>
                        {operators.map((u) => <option key={u.id} value={u.id}>{u.name}{onShift.has(u.id) ? "" : " (off shift)"}</option>)}
                      </select>
                      {a?.userId && !onShift.has(a.userId) && !oos && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Assignee is not clocked in</div>}
                    </td>
                    <td className="num">{kmh(v.speed)} <span className="unit">km/h</span></td>
                    <td><LinkMeter latencyMs={v.link.latencyMs} compact /></td>
                    <td className="num">{Math.round(v.odometerKm).toLocaleString()} <span className="unit">km</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{v.compute.sw}</td>
                    <td style={{ fontSize: 13 }}>{openT ? <Link href={`/support?view=inbox&q=${v.id}`}>{openT} tickets</Link> : <span className="muted">—</span>}{openW ? <> · <Link href={`/eng/maintenance?v=${v.id}`}>{openW} WO</Link></> : null}</td>
                    <td>{canService && <Button variant="ghost" onClick={() => run(api("PATCH", `/api/vehicles/${v.id}/service`, { service: oos ? "in_service" : "out_of_service" }))}>{oos ? "Return to service" : "Take out of service"}</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
