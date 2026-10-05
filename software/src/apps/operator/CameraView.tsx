// Simulated camera feed: a three.js render of the shared city from the vehicle's reported pose, using the design
// system's scene objects. It stands in for the WebRTC video. A 2D overlay on top carries perception: hover to see
// what the vehicle detects, click to label it (or a spot on the road), and drag across the view to nudge autonomy.
import { useEffect, useRef, useState } from "react";
import type { VehicleState } from "@shared/types";
import { live } from "../../lib/live";
import { MAX_NUDGE, guideInput } from "../../lib/guide";
import { VIEWS, World, type Detection } from "./scene/world";

export interface LabelRequest { label: string; x: number; y: number; objectKind?: string }
const OBJECT_LABELS = ["Pedestrian", "Cyclist", "Car", "Bus", "Truck", "Cone", "Debris", "Construction", "Animal", "Not an obstacle"];
const GROUND_LABELS = ["Pothole", "Debris", "Flooding", "Construction", "Blocked lane", "Crossing pedestrians"];

export function CameraView({ vehicleId, view, pan, guideAllowed, showDetections, onLabel }: {
  vehicleId: string | null; view: string; pan: number; guideAllowed: boolean; showDetections: boolean; onLabel: (r: LabelRequest) => void;
}) {
  const gl = useRef<HTMLCanvasElement>(null);
  const ov = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const state = useRef({ view, pan, vehicleId, showDetections, pose: null as null | { x: number; y: number; h: number }, last: performance.now(), hits: [] as Detection[], hover: null as null | { x: number; y: number } });
  state.current.view = view; state.current.pan = pan; state.current.vehicleId = vehicleId; state.current.showDetections = showDetections;
  const [menu, setMenu] = useState<null | { sx: number; sy: number; target: Detection | null; wx: number; wy: number }>(null);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);

  useEffect(() => {
    try { world.current = new World(gl.current!); } catch { setFailed(true); return; }
    if (import.meta.env.DEV) (window as unknown as { __teleopWorld?: World }).__teleopWorld = world.current; // for render-cost checks
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const W = world.current!, st = state.current, v = st.vehicleId ? live.byId.get(st.vehicleId) : null;
      const now = performance.now(), dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
      const c = gl.current!, o = ov.current!, w = c.clientWidth, h = c.clientHeight, dpr = devicePixelRatio || 1;
      if (!w || !h || !v) return;
      if (c.width !== Math.round(w * Math.min(dpr, 1.75))) W.setSize(w, h, dpr);
      if (o.width !== Math.round(w * dpr) || o.height !== Math.round(h * dpr)) { o.width = Math.round(w * dpr); o.height = Math.round(h * dpr); }
      if (v.link.latencyMs == null) return; // link lost: freeze the last frame, the overlay says so
      // Reports arrive at 10 Hz; extrapolate between them so motion is smooth.
      const p = st.pose && Math.hypot(st.pose.x - v.pose.x, st.pose.y - v.pose.y) < 6 ? st.pose : { x: v.pose.x, y: v.pose.y, h: v.pose.heading };
      p.h += angDiff(v.pose.heading, p.h) * Math.min(1, dt * 8);
      p.x += v.speed * Math.cos(p.h) * dt; p.y += v.speed * Math.sin(p.h) * dt;
      p.x += (v.pose.x - p.x) * Math.min(1, dt * 6); p.y += (v.pose.y - p.y) * Math.min(1, dt * 6);
      st.pose = p;
      const vw = (st.view as keyof typeof VIEWS) in VIEWS ? (st.view as keyof typeof VIEWS) : "front";
      st.hits = W.frame(v, live.vehicles, p, vw, st.pan, (Date.now() + live.clockSkew) / 1000, w, h);
      const ctx = o.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      overlay(ctx, W, v, vw, st.pan, w, h, st.hits, st.showDetections, st.hover);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); world.current?.dispose(); world.current = null; };
  }, []);

  const local = (e: React.PointerEvent) => { const r = ov.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; };
  const hitAt = (x: number, y: number) => state.current.hits.filter((d) => x >= d.box[0] && x <= d.box[2] && y >= d.box[1] && y <= d.box[3]).sort((a, b) => a.d - b.d)[0] ?? null;

  if (failed) return <div className="lost"><span>3D view unavailable: this browser has no WebGL.</span></div>;
  return (
    <>
      <canvas ref={gl} className="cam-canvas" aria-hidden="true" />
      <canvas ref={ov} className={`cam-canvas cam-overlay${guideAllowed ? " guide" : ""}`} aria-label={`${view} camera, simulated. Hover to see detections; click to label.`}
        onPointerMove={(e) => {
          const p = local(e);
          state.current.hover = { x: p.x, y: p.y };
          const g = drag.current;
          if (g && guideAllowed) {
            if (Math.abs(p.x - g.x0) > 6) g.moved = true;
            if (g.moved) guideInput.set({ dragging: true, drag: Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, ((p.x - g.x0) / (p.w * 0.3)) * MAX_NUDGE)) });
          }
        }}
        onPointerLeave={() => { state.current.hover = null; }}
        onPointerDown={(e) => { const p = local(e); drag.current = { x0: p.x, moved: false }; try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* synthetic */ } }}
        onPointerUp={(e) => {
          const g = drag.current; drag.current = null;
          if (guideInput.dragging) { guideInput.set({ dragging: false, drag: 0 }); return; }
          if (g?.moved) return;
          const p = local(e);
          const target = hitAt(p.x, p.y);
          const ground = world.current?.toGround(p.x, p.y) ?? null;
          if (!target && !ground) return;
          setMenu({ sx: p.x, sy: p.y, target, wx: target?.x ?? ground!.x, wy: target?.y ?? ground!.y });
        }}
        onPointerCancel={() => { drag.current = null; guideInput.set({ dragging: false, drag: 0 }); }} />
      {menu && (
        <div className="label-menu" style={{ left: Math.min(menu.sx, (ov.current?.clientWidth ?? 400) - 220), top: Math.min(menu.sy, (ov.current?.clientHeight ?? 300) - 250) }} role="menu"
          onPointerDown={(e) => e.stopPropagation()}>
          <div className="label-menu-head">
            <span className="label">{menu.target ? `Perception: ${menu.target.label}` : "Point on the road"}</span>
            {menu.target && <span className="mono muted">{menu.target.detail}</span>}
          </div>
          <div className="label-menu-opts">
            {(menu.target ? OBJECT_LABELS : GROUND_LABELS).map((l) => (
              <button key={l} role="menuitem" onClick={() => { onLabel({ label: l, x: menu.wx, y: menu.wy, objectKind: menu.target?.kind }); setMenu(null); }}>{l}</button>
            ))}
          </div>
          <button className="linkbtn" onClick={() => setMenu(null)}>Cancel</button>
        </div>
      )}
    </>
  );
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Perception and guidance drawn over the 3D view: detections, the hovered object, operator labels, the predicted path. */
function overlay(ctx: CanvasRenderingContext2D, W: World, v: VehicleState, view: keyof typeof VIEWS, pan: number, w: number, h: number,
  hits: Detection[], showDetections: boolean, hover: { x: number; y: number } | null) {
  // Predicted path: autonomy's own, shifted by any operator nudge. Amber while an operator is guiding.
  if (view === "front" && Math.abs(pan) < 0.05) {
    const curv = Math.tan((v.drive.steerDeg * Math.PI) / 180) / 3.1, nudge = v.guide?.offsetM ?? 0;
    const c = Math.cos(v.pose.heading), s = Math.sin(v.pose.heading), ox = v.pose.x, oy = v.pose.y;
    ctx.strokeStyle = v.guide ? "rgba(255,176,32,.9)" : "rgba(238,240,238,.65)"; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    for (const off of [-1.15, 1.15]) {
      ctx.beginPath();
      let first = true;
      for (let d = 3; d < 30; d += 0.6) {
        const th = curv * d, blend = Math.min(1, d / 10);
        const fwd = Math.abs(curv) < 1e-4 ? d : Math.sin(th) / curv, lat = (Math.abs(curv) < 1e-4 ? 0 : (1 - Math.cos(th)) / curv) + off + nudge * blend;
        const p = W.toScreen(ox + c * fwd - s * lat, 0.05, oy + s * fwd + c * lat);
        if (!p) continue;
        first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Operator labels, pinned where they were placed.
  for (const l of v.labels) {
    const a = W.toScreen(l.x, 0, l.y), b = W.toScreen(l.x, 2.6, l.y);
    if (!a || !b || Math.hypot(l.x - v.pose.x, l.y - v.pose.y) > 140) continue;
    ctx.strokeStyle = "rgba(238,240,238,.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.fillStyle = "rgba(238,240,238,.95)"; ctx.beginPath(); ctx.arc(a[0], a[1], 3, 0, Math.PI * 2); ctx.fill();
    tag(ctx, b[0], b[1], l.label.toUpperCase(), "operator label");
  }
  const hovered = hover ? hits.filter((d) => hover.x >= d.box[0] && hover.x <= d.box[2] && hover.y >= d.box[1] && hover.y <= d.box[3]).sort((a, b) => a.d - b.d)[0] : null;
  if (showDetections) {
    ctx.strokeStyle = "rgba(238,240,238,.38)"; ctx.lineWidth = 1;
    for (const d of hits) if (d.d < 70 && d !== hovered) ctx.strokeRect(d.box[0] + 0.5, d.box[1] + 0.5, d.box[2] - d.box[0], d.box[3] - d.box[1]);
  }
  if (hovered) {
    const [x0, y0, x1, y1] = hovered.box, k = Math.min(12, (x1 - x0) / 3, (y1 - y0) / 3);
    ctx.strokeStyle = "rgba(238,240,238,.95)"; ctx.lineWidth = 2; ctx.beginPath();
    for (const [px, py, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) { ctx.moveTo(px + dx * k, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy * k); }
    ctx.stroke();
    tag(ctx, x0, y0 - 4, hovered.label.toUpperCase(), `${hovered.detail} · click to label`);
  } else if (hover && W.toGround(hover.x, hover.y)) {
    ctx.fillStyle = "rgba(238,240,238,.8)"; ctx.beginPath(); ctx.arc(hover.x, hover.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (view === "rear") { ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(0, 0, w, h); }
  if (view === "left" && v.sensors.cam_left !== "ok") {
    ctx.save(); ctx.filter = "blur(22px)"; ctx.fillStyle = "rgba(150,140,120,.55)";
    ctx.beginPath(); ctx.ellipse(w * 0.45, h * 0.45, w * 0.32, h * 0.3, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

/** A two-line tag: an uppercase label and a mono detail, on a dark plate. */
function tag(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, detail: string) {
  ctx.font = "600 11px Archivo, sans-serif";
  const w1 = ctx.measureText(title).width;
  ctx.font = "500 11px 'JetBrains Mono', monospace";
  const w2 = ctx.measureText(detail).width;
  const W = Math.max(w1, w2) + 14, H = 34;
  const left = Math.max(4, Math.min(x, ctx.canvas.clientWidth - W - 4)), top = Math.max(4, y - H);
  ctx.fillStyle = "rgba(16,18,20,.88)"; ctx.beginPath(); ctx.roundRect(left, top, W, H, 4); ctx.fill();
  ctx.fillStyle = "#EEF0EE"; ctx.font = "600 11px Archivo, sans-serif"; ctx.fillText(title, left + 7, top + 14);
  ctx.fillStyle = "#9AA2A9"; ctx.font = "500 11px 'JetBrains Mono', monospace"; ctx.fillText(detail, left + 7, top + 28);
}
