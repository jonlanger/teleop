// Live and recent telemetry for one vehicle. One measure per chart; commanded vs actual share a chart and a unit.
import type { SensorId, TelemetryPoint } from "@shared/types";
import { kmh } from "@shared/controls";
import { ControlState, LinkMeter } from "../../ds";
import { usePolled } from "../../lib/api";
import { useVehicle } from "../../lib/live";
import { ago } from "../../lib/format";
import { Health, LineChart, PageHead, Panel, Stat } from "../../ui";
import { VehiclePicker, useVehicleParam } from "./VehiclePicker";

const SENSOR_NAME: Record<SensorId, string> = { cam_front: "Front camera", cam_rear: "Rear camera", cam_left: "Left camera", cam_right: "Right camera", lidar: "Lidar", radar: "Radar", gnss: "GNSS", imu: "IMU" };

export function Telemetry() {
  const id = useVehicleParam();
  const v = useVehicle(id);
  const hist = usePolled<TelemetryPoint[]>(id ? `/api/vehicles/${id}/history` : null, 1000).data ?? [];
  const h = hist.slice(-300);
  const t = h.map((p) => p.t);
  if (!v) return <PageHead title="Telemetry" />;
  return (
    <>
      <PageHead title="Telemetry" sub={`${v.model} · ${v.compute.sw} · last report ${ago(v.lastSeen)}. Charts show the last 5 minutes at 1 Hz.`}
        actions={<><VehiclePicker /><ControlState state={v.control} vehicle={v.id} /></>} />
      <div className="stats">
        <Stat label="Speed" value={kmh(v.speed)} unit="km/h" sub={`Cap ${v.drive.speedCapKmh} km/h when held`} />
        <Stat label="Battery" value={Math.round(v.power.soc)} unit="%" sub={`${v.power.volts} V · ${v.power.rangeKm} km · health ${v.power.sohPct}%`} />
        <Stat label="Link" value={v.link.latencyMs ?? "—"} unit="ms" sub={<LinkMeter latencyMs={v.link.latencyMs} />} />
        <Stat label="Packet loss" value={v.link.lossPct} unit="%" sub={`${v.link.upMbps} Mbps up · carriers ${v.link.carriers.join(" / ")}`} />
        <Stat label="Compute" value={Math.round(v.compute.cpuPct)} unit="% CPU" sub={`${v.thermal.computeC.toFixed(0)} °C · autonomy ${v.compute.autonomy}`} />
        <Stat label="Odometer" value={Math.round(v.odometerKm).toLocaleString()} unit="km" sub={`Off route ${Math.round(v.offRouteM)} m`} />
      </div>
      <div className="grid-2">
        <Panel title="Speed" tight><LineChart t={t} unit="km/h" series={[{ name: "Speed", values: h.map((p) => p.speedKmh) }]} /></Panel>
        <Panel title="Round-trip latency" tight actions={<span className="muted" style={{ fontSize: 12 }}>Shaded: link lost</span>}>
          <LineChart t={t} unit="ms" series={[{ name: "Latency", values: h.map((p) => p.latencyMs) }]} />
        </Panel>
        <Panel title="Steering, road-wheel angle" tight actions={<span className="legend"><span><i />Actual</span><span><i className="alt" />Commanded</span></span>}>
          <LineChart t={t} unit="°" min={-35} max={35} series={[{ name: "Actual", values: h.map((p) => p.steerDeg) }, { name: "Commanded", values: h.map((p) => p.steerCmdDeg), alt: true }]} />
        </Panel>
        <Panel title="Battery state of charge" tight><LineChart t={t} unit="%" series={[{ name: "Charge", values: h.map((p) => p.soc) }]} /></Panel>
        <Panel title="Motor temperature" tight><LineChart t={t} unit="°C" series={[{ name: "Motor", values: h.map((p) => p.motorC) }]} /></Panel>
        <Panel title="Compute load" tight><LineChart t={t} unit="%" min={0} max={100} series={[{ name: "CPU", values: h.map((p) => p.cpuPct) }]} /></Panel>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <Panel title="Sensors">
          <table className="t"><tbody>
            {(Object.keys(SENSOR_NAME) as SensorId[]).map((k) => <tr key={k}><td>{SENSOR_NAME[k]}</td><td style={{ textAlign: "right" }}><Health h={v.sensors[k]} /></td></tr>)}
          </tbody></table>
        </Panel>
        <Panel title="Drive-by-wire and body">
          <table className="t"><tbody>
            <tr><td>Gear</td><td className="num">{v.drive.gear}{v.drive.parkingBrake ? " · parking brake" : ""}</td></tr>
            <tr><td>Throttle / brake (actual)</td><td className="num">{Math.round(v.drive.throttle * 100)}% / {Math.round(v.drive.brake * 100)}%</td></tr>
            <tr><td>Drive stream age</td><td className="num">{v.drive.streamAgeMs != null ? `${Math.round(v.drive.streamAgeMs)} ms` : "Not held"}</td></tr>
            <tr><td>Lights</td><td className="num">{v.body.headlights} · signal {v.body.turnSignal}{v.body.hazards ? " · hazards" : ""}</td></tr>
            <tr><td>Doors</td><td className="num">{v.body.doorOpen ? "open" : "closed"} · {v.body.doorsLocked ? "locked" : "unlocked"}</td></tr>
            <tr><td>Brake pads</td><td className="num">{Math.round(v.wear.brakePadPct)}%</td></tr>
            <tr><td>Tires</td><td className="num">{v.wear.tiresKpa.join(" · ")} kPa</td></tr>
            <tr><td>Thermal</td><td className="num">motor {v.thermal.motorC.toFixed(0)} · battery {v.thermal.batteryC.toFixed(0)} · compute {v.thermal.computeC.toFixed(0)} °C</td></tr>
          </tbody></table>
        </Panel>
      </div>
    </>
  );
}
