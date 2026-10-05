// The driver's route map: heading-up around the vehicle, the route ahead, the next turn and the next stop.
import { useMemo, useState } from "react";
import type { VehicleState } from "@shared/types";
import { STATE_COLOR_VAR, kmh } from "@shared/controls";
import { STREETS } from "@shared/city";
import { nextCorner, nextStop, pointAt, project, routeById, routeGeometry } from "@shared/site";
import { live } from "../../lib/live";
import { CityBase, LANE_PATHS, pathD } from "../../ui/CityLayers";
import { Seg } from "../../ui";

export function NavMap({ v }: { v: VehicleState }) {
  const [range, setRange] = useState<"near" | "far">("near");
  const [north, setNorth] = useState(false);
  const route = routeById(v.route);
  const geom = useMemo(() => routeGeometry(route), [route]);
  const { x, y, heading } = v.pose;
  const proj = project(geom, x, y);
  const turn = nextCorner(geom, proj.s);
  const stop = nextStop(geom, proj.s, v.stop ? 3 : 1);
  const W = range === "near" ? 240 : 560, H = W * 1.3;
  const rot = north ? 0 : -(heading * 180) / Math.PI - 90;
  const rad = (rot * Math.PI) / 180;
  const toScreen = (px: number, py: number) => { const dx = px - x, dy = py - y; return [dx * Math.cos(rad) - dy * Math.sin(rad), dx * Math.sin(rad) + dy * Math.cos(rad)]; };
  const ahead = Array.from({ length: Math.ceil((range === "near" ? 350 : 800) / 8) }, (_, k) => { const p = pointAt(geom, proj.s + k * 8); return [p.x, p.y] as [number, number]; });
  const offRoute = v.offRouteM > 8;
  const speedRef = Math.max(Math.abs(v.speed), (route.targetKmh / 3.6) * 0.6);

  // Street names near the vehicle, kept upright as the map turns.
  const labels = useMemo(() => {
    const out: { key: string; sx: number; sy: number; ang: number; name: string; art: boolean }[] = [];
    for (const s of STREETS) {
      const dist = s.axis === "x" ? Math.abs(s.at - x) : Math.abs(s.at - y);
      if (dist > W * 0.7) continue;
      const step = s.axis === "x" ? 150 : 200;
      const along0 = s.axis === "x" ? y : x;
      for (const k of [-1, 0, 1]) {
        const a = Math.round(along0 / step) * step + step / 2 + k * step;
        if (a < s.from || a > s.to) continue;
        const [sx, sy] = s.axis === "x" ? toScreen(s.at, a) : toScreen(a, s.at);
        if (Math.abs(sx) > W / 2 - 10 || sy < -H * 0.68 + 10 || sy > H * 0.32 - 10) continue;
        let ang = (s.axis === "x" ? 90 : 0) + rot;
        ang = ((ang % 180) + 180) % 180; if (ang > 90) ang -= 180;
        out.push({ key: `${s.id}${k}`, sx, sy, ang, name: s.name, art: s.kind === "arterial" });
      }
    }
    return out;
  }, [x, y, rot, W, H]);

  return (
    <section className="nav" aria-label="Route map">
      <div className="nav-head">
        {v.stop ? <>
          <span className="label">At stop</span>
          <span className="heading">{v.stop.name}</span>
          <span className="muted">{v.body.doorOpen ? "Doors open" : "Departing"} · {Math.max(0, Math.round((v.stop.until - Date.now()) / 1000))} s</span>
        </> : offRoute ? <>
          <span className="label nav-warn">Off route by {Math.round(v.offRouteM)} m</span>
          <span className="heading">Rejoin {turn.current}</span>
          <span className="muted">Release needs the vehicle within 15 m of the route</span>
        </> : turn.dist > 450 || turn.dir === "straight" ? <>
          <span className="label">Next</span>
          <span className="heading">Continue on {turn.current}</span>
          <span className="mono muted">{Math.round(turn.dist)} m</span>
        </> : <>
          <span className="label">In <span className="mono">{Math.max(0, Math.round(turn.dist / 10) * 10)} m</span></span>
          <span className="heading">Turn {turn.dir} onto {turn.onto}</span>
          <span className="muted">from {turn.current}</span>
        </>}
      </div>
      <svg className="nav-map" viewBox={`${-W / 2} ${-H * 0.68} ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Map around ${v.id}`}>
        <g transform={`rotate(${rot}) translate(${-x} ${-y})`}>
          <CityBase labels={false} />
          <path d={pathD(LANE_PATHS[route.id])} fill="none" stroke="var(--line-strong)" strokeWidth={range === "near" ? 2.5 : 4} strokeLinejoin="round" />
          <path d={pathD(ahead, false)} fill="none" stroke="var(--ink)" strokeWidth={range === "near" ? 4 : 7} strokeLinejoin="round" strokeLinecap="round" />
          {route.stops.map((s) => <rect key={s.name} x={s.at[0] - 5} y={s.at[1] - 5} width={10} height={10} rx={2} fill="var(--surface-1)" stroke="var(--ink)" strokeWidth={2.5} />)}
          {live.vehicles.filter((o) => o.id !== v.id && Math.hypot(o.pose.x - x, o.pose.y - y) < W).map((o) => (
            <circle key={o.id} cx={o.pose.x} cy={o.pose.y} r={range === "near" ? 4 : 7} fill={STATE_COLOR_VAR[o.control]} stroke="var(--surface-0)" strokeWidth={2} />
          ))}
        </g>
        {labels.map((l) => (
          <text key={l.key} x={l.sx} y={l.sy} transform={`rotate(${l.ang} ${l.sx} ${l.sy})`} textAnchor="middle" dy={3} className={`nav-street${l.art ? " art" : ""}`} style={{ fontSize: W / 26 }}>{l.name}</text>
        ))}
        {route.stops.map((s) => {
          const [sx, sy] = toScreen(s.at[0], s.at[1]);
          if (Math.abs(sx) > W / 2 || sy < -H * 0.68 || sy > H * 0.32) return null;
          return <text key={s.name} x={sx + W / 40} y={sy - W / 40} className="nav-stop" style={{ fontSize: W / 24 }}>{s.name}</text>;
        })}
        <g transform={`rotate(${north ? (heading * 180) / Math.PI + 90 : 0})`}>
          <circle r={W / 22} fill="var(--surface-0)" opacity={0.6} />
          <path d={`M0 ${-W / 26} L${W / 42} ${W / 40} L0 ${W / 70} L${-W / 42} ${W / 40}Z`} fill={STATE_COLOR_VAR[v.control]} stroke="var(--surface-0)" strokeWidth={W / 200} />
        </g>
      </svg>
      <div className="nav-foot">
        <div className="nav-next" title={stop ? `${stop.name}, stop ${stop.index + 1} of ${stop.count}` : undefined}>
          {stop ? <><span className="label">Next</span> <b>{stop.name}</b> <span className="mono muted">{Math.round(stop.dist)} m · {Math.max(1, Math.round(stop.dist / speedRef / 60))} min</span></>
            : <span className="muted">No stops on this route</span>}
        </div>
        <div className="nav-tools">
          <Seg label="Map range" value={range} onChange={setRange} options={[{ value: "near", label: "Near" }, { value: "far", label: "Far" }]} />
          <Seg label="Map orientation" value={north} onChange={setNorth} options={[{ value: false, label: "Heading" }, { value: true, label: "North" }]} />
        </div>
      </div>
      <span className="sr-only">{route.name}, {kmh(v.speed)} km/h</span>
    </section>
  );
}
