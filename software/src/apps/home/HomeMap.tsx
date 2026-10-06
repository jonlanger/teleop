// The homepage hero: the live simulator's fleet on an interactive card.
// Routes draw in and then flow in the direction of travel, every vehicle pings its link, help requests pulse and get a
// callout, and the camera flies to a new request on its own (unless you are exploring). Click a vehicle to follow it.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { VehicleState } from "@shared/types";
import { DEPOT, ROUTES, WEAK_ZONES, routeById } from "@shared/site";
import { STATE_COLOR_VAR, STATE_LABEL, kmh } from "@shared/controls";
import { ControlState, LinkMeter } from "../../ds";
import { useLogs, useVehicles } from "../../lib/live";
import { CityBase, LANE_PATHS, pathD } from "../../ui/CityLayers";

/** The simulator's routes, named as delivery runs for this page. */
export const RUN_NAME: Record<string, string> = { downtown: "Downtown drops", harbor: "Harbor freight", campus: "Campus lockers", airport: "Airport cargo" };
const runName = (id: string) => RUN_NAME[id] ?? routeById(id).name;

const FULL = { x: -230, y: -90, w: 1860, h: 1046 };   // 16:9, the whole service area and the harbor
const ZOOM_W = 620;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Bubble = { id: string; vehicleId: string; x: number; y: number; text: string; tone: "ask" | "done"; at: number };

export function HomeMap() {
  const vs = useVehicles();
  const logs = useLogs();
  const svgRef = useRef<SVGSVGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [spot, setSpot] = useState<string | null>(null);        // auto-follow of a new help request
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const lastTouch = useRef(0);
  const seen = useRef(new Map<string, { since: number; title: string }>());
  const byId = useMemo(() => new Map(vs.map((v) => [v.id, v])), [vs]);
  const followId = sel ?? spot;
  const follow = followId ? byId.get(followId) ?? null : null;

  // Watch help requests open and close, and tell the story on the map.
  useEffect(() => {
    const now = Date.now();
    const add: Bubble[] = [];
    for (const v of vs) {
      const prev = seen.current.get(v.id);
      if (v.assist && !prev) {
        seen.current.set(v.id, { since: v.assist.since, title: v.assist.title });
        // Fly to it unless the visitor touched the map in the last 12 s.
        if (!sel && now - lastTouch.current > 12000) setSpot(v.id);
      } else if (!v.assist && prev) {
        seen.current.delete(v.id);
        const secs = Math.max(1, Math.round((now - prev.since) / 1000));
        add.push({ id: `${v.id}-${now}`, vehicleId: v.id, x: v.pose.x, y: v.pose.y, text: `Moving again · ${secs} s`, tone: "done", at: now });
        if (spot === v.id) setTimeout(() => setSpot((s) => (s === v.id ? null : s)), 2500);
      }
    }
    if (add.length) setBubbles((b) => [...b, ...add].slice(-4));
  }, [vs, sel, spot]);
  useEffect(() => {
    const t = setInterval(() => setBubbles((b) => b.filter((x) => Date.now() - x.at < 4500)), 1000);
    return () => clearInterval(t);
  }, []);
  // A spotlight never outstays its welcome.
  useEffect(() => { if (!spot) return; const t = setTimeout(() => setSpot(null), 14000); return () => clearTimeout(t); }, [spot]);

  // The camera: ease the viewBox toward the followed vehicle, or the whole city. Written straight to the DOM.
  const target = useRef(FULL);
  target.current = follow ? { x: follow.pose.x - ZOOM_W / 2, y: follow.pose.y - (ZOOM_W * FULL.h / FULL.w) / 2, w: ZOOM_W, h: ZOOM_W * FULL.h / FULL.w } : FULL;
  useEffect(() => {
    let raf = 0;
    const cur = { ...FULL };
    const tick = () => {
      const t = target.current, k = reduced() ? 1 : 0.07;
      cur.x += (t.x - cur.x) * k; cur.y += (t.y - cur.y) * k; cur.w += (t.w - cur.w) * k; cur.h += (t.h - cur.h) * k;
      svgRef.current?.setAttribute("viewBox", `${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${cur.w.toFixed(1)} ${cur.h.toFixed(1)}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // A gentle 3D tilt toward the pointer.
  const onMove = (e: React.PointerEvent) => {
    lastTouch.current = Date.now();
    const el = cardRef.current; if (!el || reduced()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 3).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 4).toFixed(2)}deg`);
  };
  const onLeave = () => { cardRef.current?.style.setProperty("--rx", "0deg"); cardRef.current?.style.setProperty("--ry", "0deg"); };
  const pick = (id: string | null) => { lastTouch.current = Date.now(); setSpot(null); setSel(id); };

  const ins = vs.filter((v) => v.service === "in_service");
  const asking = vs.filter((v) => v.assist);
  const ticker = logs.filter((l) => l.vehicleId).slice(-3).reverse();
  const zoom = follow ? FULL.w / ZOOM_W : 1;

  return (
    <div className="hm-wrap" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className={`hm-card${follow ? " following" : ""}`} ref={cardRef}>
        <svg ref={svgRef} className="hm-svg" viewBox={`${FULL.x} ${FULL.y} ${FULL.w} ${FULL.h}`} preserveAspectRatio="xMidYMid slice" role="img"
          aria-label={`Live map of ${vs.length} delivery vehicles; ${asking.length} asking for help`} onClick={() => pick(null)}>
          <CityBase labels={false} />
          {WEAK_ZONES.map((z) => <circle key={z.label} className="hm-weak" cx={z.x} cy={z.y} r={z.r} />)}
          <g fill="none" strokeLinejoin="round" strokeLinecap="round">
            {ROUTES.map((r, i) => {
              const d = pathD(LANE_PATHS[r.id]);
              const on = follow?.route === r.id;
              return (
                <g key={r.id}>
                  <path d={d} pathLength={1} className={`hm-route${on ? " on" : ""}`} style={{ animationDelay: `${0.2 + i * 0.18}s` }} />
                  <path d={d} pathLength={1} className="hm-flow" style={{ animationDelay: `${1.6 + i * 0.18}s, ${1.6 + i * 0.18}s` } as CSSProperties} />
                </g>
              );
            })}
          </g>
          {ROUTES.flatMap((r) => r.stops.map((s) => <rect key={r.id + s.name} className="hm-stop" x={s.at[0] - 6} y={s.at[1] - 6} width={12} height={12} rx={3} />))}
          <text x={DEPOT.x} y={DEPOT.y + 34} textAnchor="middle" className="map-place">DEPOT</text>
          {vs.map((v, i) => <Vehicle key={v.id} v={v} i={i} sel={v.id === followId} onPick={() => pick(v.id)} />)}
          {asking.map((v) => <Callout key={`ask-${v.id}`} x={v.pose.x} y={v.pose.y} tone="ask" scale={1 / zoom ** 0.5}
            title={`${v.id} needs a decision`} sub={`${v.assist!.title} · ${Math.max(0, Math.round((Date.now() - v.assist!.since) / 1000))} s`} />)}
          {bubbles.map((b) => { const v = byId.get(b.vehicleId); return <Callout key={b.id} x={v?.pose.x ?? b.x} y={v?.pose.y ?? b.y} tone="done" scale={1 / zoom ** 0.5} title={b.vehicleId} sub={b.text} />; })}
        </svg>

        <div className="hm-hud">
          <span className="hm-chip"><i className="hm-live" />Live simulation</span>
          <span className="hm-chip"><i className="hm-dot autonomy" />{ins.filter((v) => v.control === "autonomy").length} driving themselves</span>
          <span className={`hm-chip${asking.length ? " ask" : ""}`}><i className="hm-dot ask" />{asking.length} asking for help</span>
        </div>

        {follow ? <FollowCard v={follow} spotlight={!sel} onClose={() => pick(null)} /> : (
          <div className="hm-hint">Click a vehicle to follow it</div>
        )}

        <ul className="hm-ticker" aria-live="polite">
          {ticker.map((l) => <li key={l.seq}><span className="data">{l.vehicleId}</span> {l.msg}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Vehicle({ v, i, sel, onPick }: { v: VehicleState; i: number; sel: boolean; onPick: () => void }) {
  const fill = v.service === "out_of_service" ? "var(--surface-3)" : STATE_COLOR_VAR[v.control];
  const hx = Math.cos(v.pose.heading) * 24, hy = Math.sin(v.pose.heading) * 24;
  return (
    <g className={`hm-v${sel ? " sel" : ""}${v.assist ? " ask" : ""}`} style={{ transform: `translate(${v.pose.x}px, ${v.pose.y}px)` }}
      onClick={(e) => { e.stopPropagation(); onPick(); }} role="button" aria-label={`${v.id}, ${STATE_LABEL[v.control]}`}>
      <circle r={40} fill="transparent" />
      {v.service === "in_service" && <circle r={14} className="hm-ping" style={{ stroke: fill, animationDelay: `${(i * 0.53) % 3}s` }} />}
      {v.assist && <><circle r={16} className="hm-ask-pulse" /><circle r={26} className="hm-ask-ring" /></>}
      {sel && <circle r={30} className="hm-sel" />}
      <line x1={0} y1={0} x2={hx} y2={hy} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
      <circle r={14} fill={fill} stroke="var(--surface-0)" strokeWidth={4} />
      <text x={20} y={-18} className="map-unit">{v.id.replace("UNIT-", "")}</text>
    </g>
  );
}

function Callout({ x, y, title, sub, tone, scale }: { x: number; y: number; title: string; sub: string; tone: "ask" | "done"; scale: number }) {
  const w = Math.max(title.length * 15, sub.length * 12.5) + 40;
  return (
    <g className={`hm-callout ${tone}`} style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
      <g transform="translate(34 -96)">
        <path d={`M-20 70 L0 58`} className="hm-callout-leg" />
        <rect width={w} height={72} rx={14} />
        <text x={20} y={30} className="hm-callout-t">{title}</text>
        <text x={20} y={56} className="hm-callout-s">{sub}</text>
      </g>
    </g>
  );
}

function FollowCard({ v, spotlight, onClose }: { v: VehicleState; spotlight: boolean; onClose: () => void }) {
  const r = routeById(v.route);
  return (
    <aside className="hm-follow" onClick={(e) => e.stopPropagation()}>
      <div className="spread">
        <span className="label">{spotlight ? "Spotlight" : "Following"}</span>
        <button className="hm-x" onClick={onClose}>{spotlight ? "Skip" : "Back to the fleet"}</button>
      </div>
      <ControlState state={v.control} vehicle={v.id} />
      <div className="hm-follow-run">{runName(v.route)}</div>
      {v.assist
        ? <div className="hm-follow-ask"><b>{v.assist.title}</b><span>{v.assist.detail}</span></div>
        : <div className="muted hm-follow-note">{v.stop ? `At ${v.stop.name}, handing over a delivery` : v.control === "autonomy" ? `On its run in autonomy, ${r.stops.length} drops a loop` : "Held by an operator"}</div>}
      <dl className="hm-stats">
        <div><dt>Speed</dt><dd className="data">{kmh(v.speed)} <small>km/h</small></dd></div>
        <div><dt>Battery</dt><dd className="data">{Math.round(v.power.soc)} <small>%</small></dd></div>
        <div><dt>Link</dt><dd><LinkMeter latencyMs={v.link.latencyMs} compact /></dd></div>
      </dl>
    </aside>
  );
}
