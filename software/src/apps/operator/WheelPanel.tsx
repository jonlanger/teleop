// The operator's wheel: which input is live, the halo it should be showing, and every control as it is pressed.
import { useState } from "react";
import type { ControlStateName } from "@shared/types";
import { STATE_COLOR_VAR, STATE_LABEL } from "@shared/controls";
import { BUTTON_CONTROL, PROGRAMMABLE_DEFAULTS, type WheelButton } from "@shared/wheel-hid";
import { Button, ControlGlyph } from "../../ds";
import { session, useSession } from "../../lib/session";
import { useWheel, wheel } from "../../lib/wheel";

const KEYS: [string, string][] = [
  ["W / S", "Throttle / brake"], ["A / D", "Steer"], ["Esc", "Emergency stop"], ["C", "Claim vehicle"], ["R (hold)", "Release vehicle"],
  ["H", "Horn"], ["T (hold)", "Talk"], ["Z", "Hazard lights"], ["K", "External speaker"], ["L", "Log"], ["1 / 2", "P1 / P2 signals"],
  ["[ / ]", "Camera"], ["PgUp / PgDn", "Alert selection"], ["Enter", "Acknowledge"],
];

export function WheelPanel({ halo, releaseHold }: { halo: ControlStateName | "off"; releaseHold: number }) {
  const w = useWheel();
  const s = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const pressed = new Set<WheelButton>(w.buttons);
  const glyphs: { b: WheelButton; label?: string }[] = [
    { b: "ptt" }, { b: "log" }, { b: "speaker" }, { b: "dpadUp", label: "D-pad" }, { b: "estop" }, { b: "hazard" },
    { b: "claim" }, { b: "release" }, { b: "horn" }, { b: "stick" }, { b: "p1", label: `P1 · ${PROGRAMMABLE_DEFAULTS.p1}` }, { b: "p2", label: `P2 · ${PROGRAMMABLE_DEFAULTS.p2}` },
  ];
  return (
    <section className="panel tight wheel-panel">
      <header className="panel-head"><h2>Wheel</h2><span className="tag">{w.kind === "none" ? "No input" : w.name}</span></header>
      <div className="panel-body stack">
        <div className="row-3">
          <svg width={56} height={56} viewBox="0 0 56 56" role="img" aria-label={`Halo ${halo === "off" ? "off" : STATE_LABEL[halo]}`}>
            <circle cx={28} cy={28} r={24} fill="none" stroke="var(--line)" strokeWidth={6} />
            <circle cx={28} cy={28} r={24} fill="none" stroke={STATE_COLOR_VAR[halo]} strokeWidth={4} className={halo === "transitioning" ? "halo-pulse" : ""}
              strokeDasharray={halo === "off" ? "0 200" : undefined} />
            <g transform={`rotate(${w.steer * 135} 28 28)`}><line x1={28} y1={28} x2={28} y2={10} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" /></g>
          </svg>
          <div className="stack" style={{ gap: 2 }}>
            <span className="label">Halo</span>
            <span style={{ fontWeight: 650 }}>{halo === "off" ? "Off · no vehicle selected" : STATE_LABEL[halo]}</span>
            <span className="muted" style={{ fontSize: 12 }}>{w.hidPaired ? "Paired: halo and grips follow the console" : "Not paired: halo shown here only"}</span>
          </div>
        </div>
        <div className="mini-bars">
          <Bar label="Steer" v={(w.steer + 1) / 2} center />
          <Bar label="Throttle" v={w.throttle} />
          <Bar label="Brake" v={w.brake} />
        </div>
        {releaseHold > 0 && <div className="hold-hw"><div style={{ width: `${Math.min(1, releaseHold / 1200) * 100}%` }} /><span>Keep holding Release</span></div>}
        <div className="glyph-grid">
          {glyphs.map(({ b, label }) => {
            const on = b === "dpadUp" ? ["dpadUp", "dpadDown", "dpadLeft", "dpadRight"].some((x) => pressed.has(x as WheelButton)) : pressed.has(b);
            return <span key={b} className={`gl${on ? " on" : ""}`} title={label}><ControlGlyph control={BUTTON_CONTROL[b]!} size={22} /></span>;
          })}
        </div>
        <div className="row wrap">
          {!w.hidPaired && <Button variant="secondary" onClick={() => wheel.pair().then(() => setErr(null), (e: Error) => setErr(e.message))}>Pair wheel</Button>}
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={s.keyboardDrive} onChange={(e) => { session.set({ keyboardDrive: e.target.checked }); wheel.keyboardEnabled = e.target.checked; }} />
            Keyboard fallback
          </label>
          <button className="linkbtn" onClick={() => setShowKeys(!showKeys)}>{showKeys ? "Hide keys" : "Keys"}</button>
        </div>
        {err && <div className="form-error">{err}</div>}
        {showKeys && <dl className="keys">{KEYS.map(([k, d]) => <div key={k}><dt className="mono">{k}</dt><dd>{d}</dd></div>)}</dl>}
      </div>
    </section>
  );
}

function Bar({ label, v, center }: { label: string; v: number; center?: boolean }) {
  return (
    <div className="mini-bar">
      <span className="label">{label}</span>
      <div className="track">{center ? <div className="fill c" style={{ left: `${Math.min(50, v * 100)}%`, width: `${Math.abs(v - 0.5) * 100}%` }} /> : <div className="fill" style={{ width: `${v * 100}%` }} />}</div>
    </div>
  );
}
