// The team: role, certifications, this week's hours and who is clocked in.
import type { Shift, Station, User } from "@shared/types";
import { ROLE_LABEL } from "@shared/controls";
import { useResource } from "../../lib/api";
import { useCommands, useVehicles } from "../../lib/live";
import { clock } from "../../lib/format";
import { Avatar, PageHead, Panel } from "../../ui";
import { shiftStatus } from "./Shifts";

const D = 86400e3;

export function People({ users }: { me: User; users: User[] }) {
  const now = Date.now();
  const ws = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * D; })();
  const shifts = useResource<Shift[]>(`/api/shifts?from=${ws}&to=${ws + 7 * D}`, ["shifts"]).data ?? [];
  const stations = useResource<Station[]>("/api/stations", ["stations"]).data ?? [];
  const vehicles = useVehicles();
  const commands = useCommands();
  return (
    <>
      <PageHead title="People" sub="Hours are this week's scheduled shifts. Claims count this session." />
      <Panel>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Person</th><th>Role</th><th>Certifications</th><th>Now</th><th>Station</th><th className="num">Hours</th><th className="num">Holding</th><th className="num">Claims</th><th className="num">Stops</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const mine = shifts.filter((s) => s.userId === u.id);
                const cur = mine.find((s) => s.start <= now && s.end > now);
                const st = cur ? shiftStatus(cur, now) : null;
                const station = stations.find((s) => s.userId === u.id);
                return (
                  <tr key={u.id}>
                    <td><span className="row"><Avatar name={u.name} /><b>{u.name}</b></span></td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td><span className="row wrap">{(u.certifications ?? []).map((c) => <span key={c} className="tag">{c}</span>)}</span></td>
                    <td>{st === "on" ? <span className="tag ink">On shift until {clock(cur!.end)}</span> : st === "late" ? <span className="tag warn">Not clocked in</span> : <span className="muted">Off</span>}</td>
                    <td className="mono">{station ? `${station.id} · wheel` : cur?.station ?? ""}</td>
                    <td className="num">{Math.round(mine.reduce((a, s) => a + (s.end - s.start), 0) / 3600e3)}</td>
                    <td className="num">{vehicles.filter((v) => v.controller === u.id).map((v) => v.id).join(", ") || "—"}</td>
                    <td className="num">{commands.filter((c) => c.by === u.id && c.kind === "control.claim" && c.status === "confirmed").length}</td>
                    <td className="num">{commands.filter((c) => c.by === u.id && c.kind === "estop.engage").length}</td>
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
