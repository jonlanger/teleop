// Operator stations and their teleop Wheels: firmware, who is at each, and what its halo is showing.
import type { Station, User } from "@shared/types";
import { STATE_COLOR_VAR, STATE_LABEL } from "@shared/controls";
import { WHEEL_MAP, WHEEL_USB } from "@shared/wheel-hid";
import { useResource } from "../../lib/api";
import { ago, nameOf } from "../../lib/format";
import { PageHead, Panel } from "../../ui";

const LATEST_FW = "1.4.2";

export function Stations({ users }: { users: User[] }) {
  const stations = useResource<Station[]>("/api/stations", ["stations"]).data ?? [];
  return (
    <>
      <PageHead title="Stations and wheels" sub={`Latest wheel firmware is ${LATEST_FW}. Wheels report when a console pairs with them over USB.`} />
      <Panel>
        <table className="t">
          <thead><tr><th>Station</th><th>Wheel</th><th>Firmware</th><th>At the desk</th><th>Halo</th><th>Last seen</th></tr></thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.id}>
                <td><b className="mono">{s.id}</b> <span className="muted">{s.name}</span></td>
                <td className="mono">{s.wheelSerial}</td>
                <td className="mono">{s.wheelFw}{s.wheelFw !== LATEST_FW && <span className="tag warn" style={{ marginLeft: 8 }}>Update</span>}</td>
                <td>{s.userId ? nameOf(users, s.userId) : <span className="muted">Empty</span>}</td>
                <td><span className="row"><svg width={16} height={16} aria-hidden="true"><circle cx={8} cy={8} r={6} fill="none" stroke={STATE_COLOR_VAR[s.halo]} strokeWidth={3} /></svg>{s.halo === "off" ? "Off" : STATE_LABEL[s.halo]}</span></td>
                <td className="muted">{s.lastSeen ? ago(s.lastSeen) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="USB contract" style={{ marginTop: 16 }}>
        <p className="muted" style={{ marginBottom: 12 }}>What the wheel firmware must expose. Source of truth: <span className="mono">software/shared/wheel-hid.ts</span>.</p>
        <div className="grid-2">
          <table className="t"><tbody>
            <tr><td>USB IDs</td><td className="mono">VID 0x{WHEEL_USB.vendorId.toString(16)} · PID 0x{WHEEL_USB.productId.toString(16)} (placeholder VID)</td></tr>
            <tr><td>Input</td><td>HID gamepad, read with the Gamepad API</td></tr>
            <tr><td>Output 0x01</td><td>Halo: state, RGB, pulse flag</td></tr>
            <tr><td>Output 0x02</td><td>Haptics: pattern, strength</td></tr>
            {Object.entries(WHEEL_MAP.axes).map(([k, i]) => <tr key={k}><td>Axis {i}</td><td className="mono">{k}</td></tr>)}
          </tbody></table>
          <table className="t"><tbody>
            {Object.entries(WHEEL_MAP.buttons).map(([k, i]) => <tr key={k}><td>Button {i}</td><td className="mono">{k}</td></tr>)}
          </tbody></table>
        </div>
      </Panel>
    </>
  );
}
