// Remote diagnostics and subsystem restarts. Both run parked; the vehicle refuses them while moving.
import { useState } from "react";
import type { SensorId, User } from "@shared/types";
import { Button, ControlState } from "../../ds";
import { isPending, live, useLastCommand, useVehicle, useVehicles } from "../../lib/live";
import { clock } from "../../lib/format";
import { Field, Health, PageHead, Panel } from "../../ui";
import { Readback } from "../operator/Controls";
import { VehiclePicker, useVehicleParam } from "./VehiclePicker";

const TARGETS: (SensorId | "autonomy")[] = ["autonomy", "cam_front", "cam_rear", "cam_left", "cam_right", "lidar", "radar", "gnss", "imu"];

export function Diagnostics({ me }: { me: User }) {
  const id = useVehicleParam();
  const v = useVehicle(id);
  const all = useVehicles();
  const diag = useLastCommand(id, "diag.run");
  const restart = useLastCommand(id, "sys.restart");
  const [target, setTarget] = useState<SensorId | "autonomy">("cam_left");
  const allowed = me.role === "engineer" || me.role === "support";
  if (!v) return <PageHead title="Diagnostics" />;
  const moving = Math.abs(v.speed) > 0.3;
  return (
    <>
      <PageHead title="Diagnostics" sub="Runs on the vehicle. It must be parked; take it out of service or ask an operator to pull over first." actions={<><VehiclePicker /><ControlState state={v.control} vehicle={v.id} /></>} />
      {moving && <div className="form-error" style={{ marginBottom: 16 }}>{v.id} is moving at {Math.round(Math.abs(v.speed) * 3.6)} km/h. The vehicle will refuse diagnostics and restarts.</div>}
      <div className="grid-2">
        <Panel title="Self-test" actions={<Button variant="primary" disabled={!allowed || v.diag.running || isPending(diag)} onClick={() => live.cmd(v.id, "diag.run")}>{v.diag.running ? "Running" : "Run diagnostics"}</Button>}>
          <div className="stack">
            <Readback c={diag} idle="About 4 s. Checks sensors, brakes, tires, wipers, battery and link." />
            {v.diag.results ? (
              <table className="t">
                <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
                <tbody>{v.diag.results.map((r) => <tr key={r.check}><td className="mono">{r.check}</td><td><Health h={r.status} /></td><td className="muted">{r.detail}</td></tr>)}</tbody>
              </table>
            ) : <div className="empty">No results on this vehicle yet.</div>}
            {v.diag.at && <span className="muted" style={{ fontSize: 12 }}>Last run {clock(v.diag.at, true)}</span>}
          </div>
        </Panel>
        <Panel title="Restart a subsystem">
          <div className="stack-4">
            <Field label="Subsystem" hint="Clears software faults. A hardware problem, like a dirty lens, comes back degraded.">
              <select className="select" value={target} onChange={(e) => setTarget(e.target.value as SensorId | "autonomy")}>
                {TARGETS.map((t) => <option key={t} value={t}>{t}{t !== "autonomy" ? ` · ${v.sensors[t]}` : ` · ${v.compute.autonomy}`}</option>)}
              </select>
            </Field>
            <div className="row"><Button disabled={!allowed || isPending(restart)} onClick={() => live.cmd(v.id, "sys.restart", target)}>Restart {target}</Button></div>
            <Readback c={restart} idle="Takes about 3 s; the subsystem reports offline meanwhile." />
          </div>
        </Panel>
      </div>
      <Panel title="Software across the fleet" style={{ marginTop: 16 }}>
        <table className="t">
          <thead><tr><th>Vehicle</th><th>Autonomy software</th><th>Autonomy</th><th>Service</th></tr></thead>
          <tbody>{all.map((x) => <tr key={x.id}><td className="id">{x.id}</td><td className="mono">{x.compute.sw}{x.compute.sw !== "av 4.12.1" && <span className="tag" style={{ marginLeft: 8 }}>Behind 4.12.1</span>}</td><td><Health h={x.compute.autonomy} /></td><td className="muted">{x.service === "out_of_service" ? "Out of service" : "In service"}</td></tr>)}</tbody>
        </table>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Install updates through a software work order. Over-the-air install isn't wired to the vehicles in this build.</p>
      </Panel>
    </>
  );
}
