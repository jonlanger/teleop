// The city as SVG, drawn once and reused by the fleet map and the driver's route map.
// Only design tokens: water and parks are textures, not new colors, so nothing competes with control state.
import { memo } from "react";
import { BLOCKS, BOUNDS, STREETS, WATER } from "@shared/city";
import { ROUTES, lanePath } from "@shared/site";

export const CityBase = memo(function CityBase({ labels = true }: { labels?: boolean }) {
  return (
    <g className="city">
      <defs>
        <pattern id="water-hatch" width="24" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 6 Q6 2 12 6 T24 6" fill="none" stroke="var(--line)" strokeWidth="1.5" />
        </pattern>
        <pattern id="park-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="3" fill="var(--line)" />
        </pattern>
      </defs>
      <rect x={BOUNDS.x0 - 400} y={BOUNDS.y0 - 400} width={BOUNDS.x1 - BOUNDS.x0 + 800} height={BOUNDS.y1 - BOUNDS.y0 + 800} fill="var(--surface-2)" />
      <rect x={WATER.x0} y={WATER.y0} width={BOUNDS.x1 - WATER.x0 + 400} height={BOUNDS.y1 - WATER.y0 + 400} fill="var(--surface-0)" />
      <rect x={WATER.x0} y={WATER.y0} width={BOUNDS.x1 - WATER.x0 + 400} height={BOUNDS.y1 - WATER.y0 + 400} fill="url(#water-hatch)" />
      {STREETS.map((s) => s.axis === "x"
        ? <rect key={s.id} x={s.at - s.half} y={s.from} width={s.half * 2} height={s.to - s.from} fill={s.kind === "arterial" ? "var(--surface-0)" : "var(--surface-1)"} />
        : <rect key={s.id} x={s.from} y={s.at - s.half} width={s.to - s.from} height={s.half * 2} fill={s.kind === "arterial" ? "var(--surface-0)" : "var(--surface-1)"} />)}
      {BLOCKS.map((b) => {
        const [x0, y0, x1, y1] = b.inner;
        const green = b.kind === "park" || b.kind === "plaza";
        return (
          <g key={`${b.x0},${b.y0}`}>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={4} fill="var(--surface-2)" />
            {green && <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={4} fill="url(#park-dots)" />}
            {b.buildings.map((d) => <rect key={d.id} x={d.x0} y={d.y0} width={d.x1 - d.x0} height={d.y1 - d.y0} fill="var(--surface-3)" stroke="var(--line)" strokeWidth={1} />)}
          </g>
        );
      })}
      {labels && BLOCKS.filter((b) => b.name).map((b) => (
        <text key={b.name} x={(b.inner[0] + b.inner[2]) / 2} y={(b.inner[1] + b.inner[3]) / 2 + 7} textAnchor="middle" className="map-place">{b.name}</text>
      ))}
    </g>
  );
});

/** Street names for a north-up map, one per street, placed mid-block. */
export const StreetLabels = memo(function StreetLabels({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  return (
    <g>
      {STREETS.map((s) => {
        if (s.axis === "x") {
          if (s.at < x0 || s.at > x1) return null;
          const y = Math.max(y0 + 60, Math.min(y1 - 60, 75 + 150 * ((s.at / 200) % 3)));
          return <text key={s.id} x={s.at} y={y} transform={`rotate(-90 ${s.at} ${y})`} textAnchor="middle" dy={6} className={`map-street${s.kind === "arterial" ? " art" : ""}`}>{s.name}</text>;
        }
        if (s.at < y0 || s.at > y1) return null;
        const x = Math.max(x0 + 60, Math.min(Math.min(x1, s.to) - 80, 100 + 200 * ((s.at / 150) % 4)));
        return <text key={s.id} x={x} y={s.at} textAnchor="middle" dy={6} className={`map-street${s.kind === "arterial" ? " art" : ""}`}>{s.name}</text>;
      })}
    </g>
  );
});

export const LANE_PATHS = Object.fromEntries(ROUTES.map((r) => [r.id, lanePath(r)]));
export const pathD = (pts: [number, number][], close = true) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + (close ? "Z" : "");
