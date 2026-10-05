// The service area, north up: the city, routes and stops, the weak-coverage zone and every vehicle by control state.
import type { VehicleState } from "@shared/types";
import { DEPOT, ROUTES, WEAK_ZONES } from "@shared/site";
import { STATE_COLOR_VAR } from "@shared/controls";
import { CityBase, LANE_PATHS, StreetLabels, pathD } from "./CityLayers";

const VB = { x: -150, y: -110, w: 1700, h: 1110 };

export function SiteMap(p: { vehicles: VehicleState[]; selected?: string | null; onSelect?: (id: string) => void; highlightRoute?: string; height?: number }) {
  return (
    <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} style={{ width: "100%", height: p.height ?? "auto", display: "block", borderRadius: 16 }} role="img" aria-label="Fleet map">
      <CityBase />
      <StreetLabels x0={VB.x} y0={VB.y} x1={VB.x + VB.w} y1={VB.y + VB.h} />
      {WEAK_ZONES.map((z) => (
        <g key={z.label}>
          <circle cx={z.x} cy={z.y} r={z.r} fill="none" stroke="var(--ink-muted)" strokeWidth={3} strokeDasharray="10 10" />
          <text x={z.x + z.r - 20} y={z.y - z.r - 12} textAnchor="end" className="map-place">{z.label}: weak coverage</text>
        </g>
      ))}
      <g fill="none" strokeLinejoin="round">
        {ROUTES.map((r) => <path key={r.id} d={pathD(LANE_PATHS[r.id])} stroke={p.highlightRoute === r.id ? "var(--ink)" : "var(--line-strong)"} strokeWidth={p.highlightRoute === r.id ? 5 : 3} />)}
      </g>
      {ROUTES.flatMap((r) => r.stops.map((s) => (
        <rect key={r.id + s.name} x={s.at[0] - 7} y={s.at[1] - 7} width={14} height={14} rx={3} fill="var(--surface-1)" stroke="var(--ink-muted)" strokeWidth={2.5}><title>{`${s.name} · ${r.name}`}</title></rect>
      )))}
      <text x={DEPOT.x} y={DEPOT.y + 34} textAnchor="middle" className="map-place">DEPOT</text>
      {p.vehicles.map((v) => {
        const sel = v.id === p.selected, fill = v.service === "out_of_service" ? "var(--surface-3)" : STATE_COLOR_VAR[v.control];
        const hx = Math.cos(v.pose.heading) * 24, hy = Math.sin(v.pose.heading) * 24;
        return (
          <g key={v.id} transform={`translate(${v.pose.x},${v.pose.y})`} style={{ cursor: p.onSelect ? "pointer" : undefined }} onClick={() => p.onSelect?.(v.id)}>
            <title>{`${v.id} · ${v.control}${v.assist ? ` · ${v.assist.title}` : ""}${v.stop ? ` · at ${v.stop.name}` : ""}`}</title>
            <circle r={30} fill="transparent" />
            {sel && <circle r={28} fill="none" stroke="var(--ink)" strokeWidth={4} />}
            <line x1={0} y1={0} x2={hx} y2={hy} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
            <circle r={14} fill={fill} stroke="var(--surface-0)" strokeWidth={4} />
            {v.assist && <circle r={21} fill="none" stroke="var(--amber)" strokeWidth={3} strokeDasharray="6 5" />}
            <text x={20} y={-18} className="map-unit">{v.id.replace("UNIT-", "")}</text>
          </g>
        );
      })}
    </svg>
  );
}
