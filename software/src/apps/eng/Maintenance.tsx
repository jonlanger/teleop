// Component health across the fleet, active faults, and work orders. Starting a work order that needs the vehicle
// takes it out of service; finishing the last one returns it.
import { useState } from "react";
import type { Health as HealthT, User, VehicleState, WorkOrder, WorkOrderStatus } from "@shared/types";
import { Button } from "../../ds";
import { api } from "../../lib/api";
import { isPending, live, useCommands, useVehicles } from "../../lib/live";
import { Link, setQuery } from "../../lib/router";
import { ago, day } from "../../lib/format";
import { Dialog, Field, Health, PageHead, Panel, Seg } from "../../ui";
import { Readback } from "../operator/Controls";
import { useVehicleParam } from "./VehiclePicker";

const WO_STATUS: Record<WorkOrderStatus, string> = { scheduled: "Scheduled", in_progress: "In progress", blocked: "Blocked", done: "Done" };

function health(v: VehicleState): { k: string; h: HealthT; text: string }[] {
  const tire = Math.min(...v.wear.tiresKpa);
  const sensorsBad = Object.values(v.sensors).filter((s) => s !== "ok").length;
  return [
    { k: "Brake pads", h: v.wear.brakePadPct < 20 ? "degraded" : "ok", text: `${Math.round(v.wear.brakePadPct)}%` },
    { k: "Tires", h: tire < 215 ? "degraded" : "ok", text: `${tire} kPa` },
    { k: "Battery", h: v.power.sohPct < 85 ? "degraded" : "ok", text: `${v.power.sohPct}% SOH` },
    { k: "Wiper motor", h: v.wear.wiperMotor, text: v.wear.wiperMotor === "ok" ? "OK" : "Fault" },
    { k: "Sensors", h: sensorsBad ? "degraded" : "ok", text: sensorsBad ? `${sensorsBad} not ok` : "8 ok" },
    { k: "Software", h: v.compute.sw === "av 4.12.1" ? "ok" : "degraded", text: v.compute.sw.replace("av ", "") },
  ];
}

export function Maintenance({ me, users, workorders }: { me: User; users: User[]; workorders: WorkOrder[] }) {
  const vehicles = useVehicles();
  const cmds = useCommands();
  const focus = useVehicleParam(false);
  const [view, setView] = useState<"open" | "done">("open");
  const [edit, setEdit] = useState<Partial<WorkOrder> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const engineers = users.filter((u) => u.role === "engineer" || u.role === "support");
  const canFault = me.role === "engineer" || me.role === "support";
  const list = workorders.filter((w) => (view === "open" ? w.status !== "done" : w.status === "done") && (!focus || w.vehicleId === focus));
  const faults = vehicles.flatMap((v) => v.faults.map((f) => ({ v, f })));
  const patch = (w: WorkOrder, body: Partial<WorkOrder>) => api("PATCH", `/api/workorders/${w.id}`, body).then(() => setErr(null), (e: Error) => setErr(e.message));

  return (
    <>
      <PageHead title="Maintenance" sub="Health is read from the vehicles live. Amber is degraded; red is a fault."
        actions={<Button variant="primary" onClick={() => setEdit({ vehicleId: focus ?? vehicles[0]?.id, kind: "corrective", takesOutOfService: false })}>New work order</Button>} />
      <Panel title="Component health">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vehicle</th>{["Brake pads", "Tires", "Battery", "Wiper motor", "Sensors", "Software"].map((k) => <th key={k}>{k}</th>)}<th className="num">Odometer</th><th>Service</th></tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className={`click${focus === v.id ? " sel" : ""}`} onClick={() => setQuery({ v: focus === v.id ? null : v.id })}>
                  <td className="id">{v.id}</td>
                  {health(v).map((c) => <td key={c.k}><Health h={c.h} label={c.text} /></td>)}
                  <td className="num">{Math.round(v.odometerKm).toLocaleString()} <span className="unit">km</span></td>
                  <td>{v.service === "out_of_service" ? <span className="tag">Out of service</span> : <span className="muted">In service</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="split-eng" style={{ marginTop: 16 }}>
        <Panel title={`Work orders${focus ? ` · ${focus}` : ""}`} actions={<>{focus && <Button variant="ghost" onClick={() => setQuery({ v: null })}>All vehicles</Button>}<Seg label="Work order view" value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }]} /></>}>
          {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>ID</th><th>Vehicle</th><th>Component</th><th>Kind</th><th>Due</th><th>Assignee</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((w) => (
                  <tr key={w.id}>
                    <td className="id"><button className="linkbtn mono" onClick={() => setEdit(w)}>{w.id}</button></td>
                    <td className="id">{w.vehicleId}</td>
                    <td><div style={{ fontWeight: 600 }}>{w.component}</div><div className="muted" style={{ fontSize: 12 }}>{w.notes}{w.takesOutOfService ? " · needs the vehicle" : ""}{w.ticketId && <> · <Link href={`/support/tickets/${w.ticketId}`}>{w.ticketId}</Link></>}</div></td>
                    <td><span className="tag">{w.kind}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{w.dueAt ? day(w.dueAt) : w.dueKm ? `${w.dueKm.toLocaleString()} km` : "—"}</td>
                    <td>
                      <select className="select sm" value={w.assignee ?? ""} onChange={(e) => patch(w, { assignee: e.target.value || undefined } as Partial<WorkOrder>)} aria-label="Assignee">
                        <option value="">Unassigned</option>{engineers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select sm" value={w.status} onChange={(e) => patch(w, { status: e.target.value as WorkOrderStatus })} aria-label="Status">
                        {Object.entries(WO_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={7} className="muted">No work orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Active faults">
          {faults.length === 0 && <div className="empty">No active faults.</div>}
          <div className="stack">
            {faults.map(({ v, f }) => {
              const c = cmds.find((x) => x.vehicleId === v.id && x.kind === "fault.clear" && x.value === f.code) ?? null;
              return (
                <div key={v.id + f.code} className="card stack">
                  <div className="spread"><span className="mono" style={{ fontWeight: 700 }}>{v.id} · {f.code}</span><span className={`tag ${f.severity === "critical" ? "crit" : "warn"}`}>{f.severity}</span></div>
                  <div className="heading">{f.text}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{f.system} · last seen {ago(f.at)}</div>
                  <div className="row">
                    <Button disabled={!canFault || isPending(c)} onClick={() => live.cmd(v.id, "fault.clear", f.code)}>Clear fault</Button>
                    <Button variant="ghost" onClick={() => setEdit({ vehicleId: v.id, component: f.text, kind: "corrective", notes: `Fault ${f.code}.`, takesOutOfService: false })}>Work order</Button>
                  </div>
                  {c && <Readback c={c} />}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <WorkOrderDialog wo={edit} users={engineers} onClose={() => setEdit(null)} />
    </>
  );
}

function WorkOrderDialog({ wo, users, onClose }: { wo: Partial<WorkOrder> | null; users: User[]; onClose: () => void }) {
  const [d, setD] = useState<Partial<WorkOrder>>({});
  const [loaded, setLoaded] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  if (wo !== loaded) { setLoaded(wo); setD(wo ?? {}); setErr(null); }
  const isNew = !wo?.id;
  const set = (p: Partial<WorkOrder>) => setD({ ...d, ...p });
  const save = () => (isNew ? api("POST", "/api/workorders", d) : api("PATCH", `/api/workorders/${wo!.id}`, d)).then(onClose, (e: Error) => setErr(e.message));
  const local = (t?: number) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60e3).toISOString().slice(0, 10) : "");
  return (
    <Dialog open={!!wo} title={isNew ? "New work order" : wo!.id!} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isNew ? "Create" : "Save"}</Button></>}>
      <div className="grid-2">
        <Field label="Vehicle">
          <select className="select" disabled={!isNew} value={d.vehicleId ?? ""} onChange={(e) => set({ vehicleId: e.target.value })}>
            {live.vehicles.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </Field>
        <Field label="Kind">
          <select className="select" value={d.kind ?? "corrective"} onChange={(e) => set({ kind: e.target.value as WorkOrder["kind"] })}>
            {["preventive", "corrective", "inspection", "software"].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Component"><input className="input" value={d.component ?? ""} onChange={(e) => set({ component: e.target.value })} placeholder="Brake pads, front axle" /></Field>
      <div className="grid-2">
        <Field label="Due date"><input className="input" type="date" value={local(d.dueAt)} onChange={(e) => set({ dueAt: e.target.value ? new Date(e.target.value + "T12:00").getTime() : undefined })} /></Field>
        <Field label="Or due at odometer (km)"><input className="input" type="number" value={d.dueKm ?? ""} onChange={(e) => set({ dueKm: e.target.value ? Number(e.target.value) : undefined })} /></Field>
      </div>
      <Field label="Assignee">
        <select className="select" value={d.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value || undefined })}>
          <option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Notes"><textarea className="textarea" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <label className="row"><input type="checkbox" checked={!!d.takesOutOfService} onChange={(e) => set({ takesOutOfService: e.target.checked })} /> Needs the vehicle: take it out of service while in progress</label>
      {err && <div className="form-error">{err}</div>}
    </Dialog>
  );
}
