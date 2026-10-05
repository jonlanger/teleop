// What the fleet is doing right now.
import type { Assignment, Metrics, Ticket, User } from "@shared/types";
import { kmh } from "@shared/controls";
import { ControlState, LinkMeter } from "../../ds";
import { usePolled, useResource } from "../../lib/api";
import { useAlerts, useVehicles } from "../../lib/live";
import { Link, setQuery, useQuery } from "../../lib/router";
import { ago, nameOf } from "../../lib/format";
import { PageHead, Panel, Stat } from "../../ui";
import { SiteMap } from "../../ui/SiteMap";

export function Overview({ users }: { users: User[] }) {
  const vehicles = useVehicles();
  const alerts = useAlerts();
  const m = usePolled<Metrics>("/api/metrics", 3000).data;
  const assignments = useResource<Assignment[]>("/api/assignments", ["assignments"]).data ?? [];
  const sel = useQuery().get("v");
  const assist = vehicles.filter((v) => v.assist);
  const tickets = useResource<Ticket[]>("/api/tickets", ["tickets"]).data ?? [];
  const fleetAsks = tickets.filter((t) => t.status !== "resolved" && t.escalation?.team === "fleet" && !t.escalation.done);
  return (
    <>
      <PageHead title="Fleet overview" sub="Live. Vehicles report ten times a second." />
      <div className="stats">
        <Stat label="In service" value={m ? m.inService : "—"} unit={m ? `of ${m.total}` : undefined} />
        <Stat label="Held by operators" value={m?.claimed ?? "—"} sub={`${vehicles.filter((v) => v.control === "stopped").length} stopped`} />
        <Stat label="Waiting for assist" value={m?.assistOpen ?? "—"} sub={m ? `${m.assistLastHour} requests in the last hour` : undefined} />
        <Stat label="Operators on shift" value={m?.onShift ?? "—"} sub={m && m.onShift ? `1 : ${(m.inService / m.onShift).toFixed(1)} vehicles` : "Nobody clocked in"} />
        <Stat label="Command p95" value={m?.commandP95Ms ?? "—"} unit="ms" sub={m ? `${m.commands15m} commands, ${m.rejected15m} not confirmed, last 15 min` : undefined} />
        <Stat label="Open tickets" value={m?.openTickets ?? "—"} sub={<Link href="/support?view=waiting_fleet">{fleetAsks.length} waiting on fleet</Link>} />
      </div>
      <div className="overview">
        <Panel title="Map" actions={<span className="muted" style={{ fontSize: 12 }}>Dot color is control state. Dashed ring: waiting for assist.</span>}>
          <SiteMap vehicles={vehicles} selected={sel} onSelect={(id) => setQuery({ v: id === sel ? null : id })} />
        </Panel>
        <Panel title="Needs attention">
          {assist.length === 0 && alerts.length === 0 && fleetAsks.length === 0 && <div className="empty">Nothing needs attention.</div>}
          <div className="stack">
            {fleetAsks.map((t) => (
              <div key={t.id} className="card attn">
                <div className="spread"><span className="tag ink">Support asks fleet</span><span className="muted" style={{ fontSize: 12 }}>{ago(t.escalation!.at)}</span></div>
                <div className="heading">{t.escalation!.note}</div>
                <div className="muted" style={{ fontSize: 13 }}><span className="mono">{t.id}</span> · {t.title}{t.vehicleId ? ` · ${t.vehicleId}` : ""}</div>
                <Link href={`/support/tickets/${t.id}`}>Open ticket</Link>
              </div>
            ))}
            {assist.map((v) => (
              <div key={v.id} className="card attn">
                <div className="spread"><span className="mono" style={{ fontWeight: 700 }}>{v.id}</span><span className="muted" style={{ fontSize: 12 }}>{ago(v.assist!.since)}</span></div>
                <div className="heading">{v.assist!.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>{v.controller ? `Held by ${nameOf(users, v.controller)}` : `Assigned to ${nameOf(users, assignments.find((a) => a.vehicleId === v.id)?.userId)}`}</div>
                <Link href={`/operate?v=${v.id}`}>Open in console</Link>
              </div>
            ))}
            {alerts.filter((a) => !a.assistId).slice(0, 6).map((a) => (
              <div key={a.id} className="card attn">
                <div className="spread"><span className={`tag ${a.severity === "critical" ? "crit" : a.severity === "warning" ? "warn" : "info"}`}>{a.severity}</span><span className="muted" style={{ fontSize: 12 }}>{ago(a.at)}</span></div>
                <div className="heading">{a.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>{a.vehicleId}{a.acknowledgedBy ? ` · acknowledged by ${nameOf(users, a.acknowledgedBy)}` : ""}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Vehicles" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vehicle</th><th>State</th><th>Route</th><th>Operator</th><th className="num">Speed</th><th className="num">Battery</th><th>Link</th><th>Now</th></tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className={`click${v.id === sel ? " sel" : ""}`} onClick={() => setQuery({ v: v.id })}>
                  <td className="id">{v.id}</td>
                  <td>{v.service === "out_of_service" ? <span className="tag">Out of service</span> : <ControlState state={v.control} />}</td>
                  <td>{v.routeName}</td>
                  <td>{v.controller ? <b>{nameOf(users, v.controller)}</b> : <span className="muted">{nameOf(users, assignments.find((a) => a.vehicleId === v.id)?.userId)}</span>}</td>
                  <td className="num">{kmh(v.speed)} <span className="unit">km/h</span></td>
                  <td className="num">{Math.round(v.power.soc)} <span className="unit">%</span></td>
                  <td><LinkMeter latencyMs={v.link.latencyMs} compact /></td>
                  <td className="muted">{v.estop.engaged ? "Emergency stop latched" : v.assist?.title ?? v.faults[0]?.text ?? (v.body.doorOpen ? "Door open" : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
