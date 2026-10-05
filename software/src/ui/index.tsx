// App building blocks composed from design tokens. Anything with a hardware twin comes from the design system instead.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Health as HealthT } from "@shared/types";
import { initials } from "../lib/format";

export function Panel(p: { title?: ReactNode; actions?: ReactNode; children: ReactNode; tight?: boolean; className?: string; bodyClass?: string; style?: React.CSSProperties }) {
  return (
    <section className={`panel${p.tight ? " tight" : ""} ${p.className ?? ""}`} style={p.style}>
      {(p.title || p.actions) && <header className="panel-head"><h2>{p.title}</h2>{p.actions && <div className="row">{p.actions}</div>}</header>}
      <div className={`panel-body ${p.bodyClass ?? ""}`}>{p.children}</div>
    </section>
  );
}

export function PageHead(p: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{p.title}</h1>{p.sub && <p>{p.sub}</p>}</div>{p.actions && <div className="row">{p.actions}</div>}</div>;
}

export function Stat(p: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{p.label}</span>
      <span className="readout">{p.value}{p.unit && <small> {p.unit}</small>}</span>
      {p.sub && <span className="sub">{p.sub}</span>}
    </div>
  );
}

export interface SegOption<T> { value: T; label: ReactNode; title?: string }
/** Segmented control. `value` is what the vehicle reports; `pending` outlines a requested value until it is confirmed. */
export function Seg<T extends string | boolean | number>(p: { options: SegOption<T>[]; value: T | null; pending?: T | null; onChange?: (v: T) => void; disabled?: boolean; size?: "lg"; square?: boolean; label?: string }) {
  return (
    <div className={`seg${p.size === "lg" ? " lg" : ""}${p.square ? " sq" : ""}`} role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => {
        const on = o.value === p.value, pend = p.pending != null && o.value === p.pending && !on;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} title={o.title} disabled={p.disabled}
            className={`${on ? "on" : ""}${pend ? " pending" : ""}`} onClick={() => p.onChange?.(o.value)}>{o.label}</button>
        );
      })}
    </div>
  );
}

export function Dialog(p: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (p.open && !d.open) d.showModal();
    if (!p.open && d.open) d.close();
  }, [p.open]);
  return (
    <dialog ref={ref} className="dlg" onClose={p.onClose} onCancel={(e) => { e.preventDefault(); p.onClose(); }}>
      {p.open && <>
        <div className="dlg-head"><h2 className="heading">{p.title}</h2><button className="tp-btn tp-btn-ghost" onClick={p.onClose}>Close</button></div>
        <div className="dlg-body">{p.children}</div>
        {p.footer && <div className="dlg-foot">{p.footer}</div>}
      </>}
    </dialog>
  );
}

export function Field(p: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span className="label">{p.label}</span>{p.children}{p.hint && <span className="muted" style={{ fontSize: 12 }}>{p.hint}</span>}</label>;
}

export const Health = ({ h, label }: { h: HealthT; label?: string }) =>
  <span className={`health ${h}`}><i />{label ?? { ok: "OK", degraded: "Degraded", fault: "Fault", offline: "Offline" }[h]}</span>;

export const Tag = ({ children, tone }: { children: ReactNode; tone?: "ink" | "solid" | "info" | "warn" | "crit" }) => <span className={`tag ${tone ?? ""}`}>{children}</span>;
export const Prio = ({ p }: { p: number }) => <span className={`prio p${p}`} title={["", "Urgent", "High", "Normal", "Low"][p]}>P{p}</span>;
export const Avatar = ({ name }: { name: string }) => <span className="avatar" aria-hidden="true">{initials(name)}</span>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

// ── Line chart ──────────────────────────────────────────────────────────────

export interface Series { name: string; values: (number | null)[]; alt?: boolean }
/** A single-axis line chart with a crosshair tooltip. Null values break the line (e.g. link lost). */
export function LineChart(p: { t: number[]; series: Series[]; unit: string; height?: number; min?: number; max?: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = p.height ?? 140, padL = 40, padR = 8, padT = 8, padB = 20;
  const all = p.series.flatMap((s) => s.values.filter((v): v is number => v != null));
  let lo = p.min ?? Math.min(0, ...all), hi = p.max ?? Math.max(1, ...all);
  if (p.max == null) hi = niceCeil(hi);
  if (hi === lo) hi = lo + 1;
  const n = p.t.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const fmt = p.format ?? ((v: number) => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(1)).toString());
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const ticks = [lo, (lo + hi) / 2, hi];
  const gaps: [number, number][] = [];
  if (p.series[0]) { let s = -1; p.series[0].values.forEach((v, i) => { if (v == null && s < 0) s = i; if (v != null && s >= 0) { gaps.push([s, i]); s = -1; } }); if (s >= 0) gaps.push([s, n - 1]); }

  return (
    <div className="chart" ref={ref}
      onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (n - 1)); setHover(i >= 0 && i < n ? i : null); }}
      onPointerLeave={() => setHover(null)}>
      <svg height={H} role="img" aria-label={`${p.series.map((s) => s.name).join(" and ")}, ${p.unit}`}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />)}</g>
        {gaps.map(([a, b]) => <rect key={a} className="gap" x={x(a)} y={padT} width={Math.max(2, x(b) - x(a))} height={H - padT - padB} />)}
        <g className="axis">
          {ticks.map((t) => <text key={t} x={padL - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>)}
          {n > 1 && <><text x={padL} y={H - 4}>{ago(p.t[0], p.t[n - 1])}</text><text x={w - padR} y={H - 4} textAnchor="end">now</text></>}
        </g>
        {p.series.map((s) => <path key={s.name} className={`series${s.alt ? " alt" : ""}`} d={path(s.values)} />)}
        {hover != null && <>
          <line className="cross" x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} />
          {p.series.map((s) => s.values[hover] != null && <circle key={s.name} className="dot" r={4} cx={x(hover)} cy={y(s.values[hover]!)} />)}
        </>}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: Math.min(x(hover) + 10, w - 170) }}>
          <div className="muted">{new Date(p.t[hover]).toLocaleTimeString([], { hour12: false })}</div>
          {p.series.map((s) => <div key={s.name}>{s.name}: {s.values[hover] == null ? "no data" : `${fmt(s.values[hover]!)} ${p.unit}`}</div>)}
        </div>
      )}
    </div>
  );
}

function ago(a: number, b: number) { const m = Math.round((b - a) / 60000); return m >= 1 ? `−${m} min` : `−${Math.round((b - a) / 1000)} s`; }
function niceCeil(v: number) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

export function Sparkline(p: { values: (number | null)[]; height?: number; width?: number }) {
  const W = p.width ?? 120, H = p.height ?? 28;
  const vs = p.values.filter((v): v is number => v != null);
  const lo = Math.min(...vs, 0), hi = Math.max(...vs, 1);
  let d = "", pen = false;
  p.values.forEach((v, i) => { if (v == null) { pen = false; return; } const X = (i / Math.max(1, p.values.length - 1)) * W, Y = H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4); d += `${pen ? "L" : "M"}${X.toFixed(1)},${Y.toFixed(1)}`; pen = true; });
  return <svg width={W} height={H} aria-hidden="true"><path d={d} fill="none" stroke="var(--ink-muted)" strokeWidth={1.5} /></svg>;
}
