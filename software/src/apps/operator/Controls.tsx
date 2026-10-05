// The vehicle control deck. Every control shows two things: what the vehicle reports (filled) and what was asked
// for (outlined until the vehicle confirms). The readback line under each says what happened on the vehicle.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Command, CommandKind, Gear, Headlights, TurnSignal, VehicleState, Wipers } from "@shared/types";
import { SPEAKER_PRESETS, STATE_COLOR_VAR } from "@shared/controls";
import type { Control } from "@shared/controls";
import { Button, ControlGlyph, HoldToConfirm } from "../../ds";
import { isPending, live, useLastCommand } from "../../lib/live";
import { useWheel } from "../../lib/wheel";
import { SOURCE_LABEL, mergedInput, screenInput, useScreenInput } from "../../lib/driveInput";
import { Seg, type SegOption } from "../../ui";
import "./operator.css";

export function Readback({ c, idle }: { c: Command | null; idle?: string }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!c) return <span className="rb muted">{idle ?? "No commands yet"}</span>;
  const ms = (t?: number) => (t ? `${t - c.sentAt} ms` : "");
  const stale = c.doneAt && Date.now() - c.doneAt > 15000;
  switch (c.status) {
    case "sent": return <span className="rb muted">Sent · waiting for vehicle</span>;
    case "received": return <span className="rb">Received {ms(c.receivedAt)} · actuating</span>;
    case "confirmed": return <span className={`rb${stale ? " muted" : ""}`} title={c.readback}>Confirmed {ms(c.doneAt)}{c.readback ? ` · ${c.readback}` : ""}</span>;
    case "rejected": return <span className="rb warn" title={c.reason}>{c.rejectedBy === "server" ? "Not sent" : "Vehicle refused"}: {c.reason}</span>;
    case "failed": return <span className="rb warn" title={c.reason}>Failed: {c.reason}</span>;
    case "timeout": return <span className="rb warn">{c.reason ?? "No response from the vehicle"}</span>;
  }
}

function Ctl(p: { label: string; glyph?: Control; c: Command | null; children: ReactNode; idle?: string; drift?: string | null }) {
  return (
    <div className="ctl">
      <span className="label row">{p.glyph && <ControlGlyph control={p.glyph} size={16} />}{p.label}</span>
      {p.children}
      {p.drift ? <span className="rb">{p.drift}</span> : <Readback c={p.c} idle={p.idle} />}
    </div>
  );
}

/** The vehicle changed this itself after our last confirmed command (autonomy, pull over, brake cancelling hold). */
function driftText(c: Command | null, actual: unknown, label: (v: unknown) => string) {
  if (!c || c.status !== "confirmed" || c.value === undefined || (c.value ?? null) === (actual ?? null)) return null;
  if (Date.now() - (c.doneAt ?? 0) < 1500) return null;
  return `Now ${label(actual)} · changed on the vehicle`;
}

function CmdSeg<T extends string | boolean>(p: { v: VehicleState; kind: CommandKind; label: string; glyph?: Control; options: SegOption<T>[]; actual: T; disabled: boolean; size?: "lg" }) {
  const c = useLastCommand(p.v.id, p.kind);
  const name = (x: unknown) => String(p.options.find((o) => o.value === x)?.label ?? x).toLowerCase();
  return (
    <Ctl label={p.label} glyph={p.glyph} c={c} drift={driftText(c, p.actual, name)}>
      <Seg label={p.label} options={p.options} value={p.actual} pending={isPending(c) ? (c!.value as T) : null} size={p.size}
        disabled={p.disabled} onChange={(val) => val !== p.actual && live.cmd(p.v.id, p.kind, val)} />
    </Ctl>
  );
}

/** The announcement the wheel's External speaker key plays. */
export const speakerChoice = { id: SPEAKER_PRESETS[0].id };

const ONOFF: SegOption<boolean>[] = [{ value: false, label: "Off" }, { value: true, label: "On" }];

/** Everything that isn't driving or safety. Lives below the cockpit. */
export function MoreControls({ v, held, onTicket }: { v: VehicleState; held: boolean; onTicket: (c?: Command) => void }) {
  const usable = held && !v.pendingControl;
  const mark = useLastCommand(v.id, "log.mark");
  return (
    <div className="deck">
      <section className="deck-panel">
        <h3>Lights and wipers</h3>
        <CmdSeg v={v} kind="body.headlights" label="Headlights" actual={v.body.headlights} disabled={!usable}
          options={(["off", "auto", "low", "high"] as Headlights[]).map((x) => ({ value: x, label: cap(x) }))} />
        <CmdSeg v={v} kind="body.wipers" label="Wipers" actual={v.body.wipers} disabled={!usable}
          options={(["off", "int", "low", "high"] as Wipers[]).map((x) => ({ value: x, label: x === "int" ? "Int" : cap(x) }))} />
      </section>
      <CabinPanel v={v} usable={usable} />
      <section className="deck-panel">
        <h3>Log and report</h3>
        <div className="ctl">
          <span className="label row"><ControlGlyph control="log" size={16} />Log</span>
          <div className="row">
            <Button glyph="log" onClick={() => live.cmd(v.id, "log.mark")}>Mark this moment</Button>
            <Button variant="ghost" onClick={() => onTicket(mark ?? undefined)}>Report issue</Button>
          </div>
          <Readback c={mark} idle="Saves 30 s of camera and telemetry" />
        </div>
      </section>
    </div>
  );
}

const STEER_SPAN = (150 * Math.PI) / 180; // on-screen wheel: ±150° of rotation is full lock

/** The driving strip: wheel, pedals, speed, gear and the signals a driver uses while moving. Always in view. */
export function DriveStrip({ v, held, guide = false }: { v: VehicleState; held: boolean; guide?: boolean }) {
  const usable = held && !v.pendingControl;
  const driving = usable && v.control === "operator";
  // Guiding: the wheel nudges autonomy's path and the brake pedal slows it. Throttle stays with autonomy.
  const guiding = !driving && guide;
  const d = v.drive;
  useScreenInput(); useWheel();
  const m = mergedInput();
  const hold = useLastCommand(v.id, "drive.speed_hold");
  const capCmd = useLastCommand(v.id, "drive.speed_cap");
  const capPending = isPending(capCmd);
  const inCmd = driving || guiding ? { ...m, throttle: driving ? m.throttle : d.throttleCmd } : { steer: d.steerCmdDeg / 35, throttle: d.throttleCmd, brake: d.brakeCmd, source: "none" as const };
  return (
    <section className="drive-strip" aria-label="Drive">
      <div className="ds-cell ds-wheel">
        <SteeringWheel enabled={driving || guiding} cmd={inCmd.steer} actualDeg={d.steerDeg} halo={v.control} />
        <div className="steer-read">
          <span className="mono">{fmtDeg(d.steerDeg)}<span className="unit"> vehicle</span></span>
          {guiding
            ? <span className="mono muted">{Math.abs(inCmd.steer * 3).toFixed(1)} m<span className="unit"> nudge</span></span>
            : <span className="mono muted">{fmtDeg(inCmd.steer * 35)}<span className="unit"> {driving ? "you" : "plan"}</span></span>}
        </div>
      </div>
      <div className="ds-cell pedals">
        <Pedal which="brake" label="Brake" glyph="brake" enabled={driving || guiding} cmd={inCmd.brake} actual={d.brake} />
        <Pedal which="throttle" label="Throttle" glyph="throttle" enabled={driving} cmd={inCmd.throttle} actual={d.throttle} />
      </div>
      <div className="ds-cell ds-speed">
        <div className="row" style={{ gap: 10 }}>
          <span className="label">Speed cap</span>
          <span className="row" style={{ gap: 4 }}>
            <button className="tp-btn tp-btn-secondary sq sm" disabled={!usable || capPending} onClick={() => live.cmd(v.id, "drive.speed_cap", d.speedCapKmh - 5)} aria-label="Lower speed cap">−</button>
            <span className="mono" style={{ fontSize: 12, minWidth: 54, textAlign: "center" }}>{d.speedCapKmh} km/h</span>
            <button className="tp-btn tp-btn-secondary sq sm" disabled={!usable || capPending} onClick={() => live.cmd(v.id, "drive.speed_cap", d.speedCapKmh + 5)} aria-label="Raise speed cap">+</button>
          </span>
        </div>
        <Ctl label="Speed hold" c={hold} idle="Brake cancels it"
          drift={driftText(hold, d.speedHoldKmh, (x) => (x == null ? "off" : `${x} km/h`))}>
          <Seg label="Speed hold" value={d.speedHoldKmh ?? 0} pending={isPending(hold) ? ((hold!.value as number | null) ?? 0) : null} disabled={!driving}
            onChange={(val) => live.cmd(v.id, "drive.speed_hold", val === 0 ? null : val)}
            options={[0, 5, 10, 15, 20].map((k) => ({ value: k, label: k === 0 ? "Off" : String(k) }))} />
        </Ctl>
        <span className="drive-src">
          {driving ? <>Input <b>{SOURCE_LABEL[m.source]}</b> · heard {d.streamAgeMs != null ? `${Math.round(d.streamAgeMs)} ms` : "—"} ago</>
            : guiding ? <>Guiding autonomy · wheel nudges, brake slows{v.guide ? <> · <b>following you</b></> : ""}</>
            : v.controller ? "Another operator is driving" : "Autonomy is driving"}
        </span>
      </div>
      <div className="ds-cell ds-gear">
        <CmdSeg v={v} kind="drive.gear" label="Gear" size="lg" actual={d.gear} disabled={!usable}
          options={(["P", "R", "N", "D"] as Gear[]).map((g) => ({ value: g, label: g }))} />
        <CmdSeg v={v} kind="drive.parking_brake" label="Parking brake" actual={d.parkingBrake} options={ONOFF} disabled={!usable} />
      </div>
      <div className="ds-cell ds-signals">
        <CmdSeg v={v} kind="body.turn_signal" label="Turn signal" actual={v.body.turnSignal} disabled={!usable}
          options={[{ value: "left" as TurnSignal, label: "Left", title: "P1 on the wheel" }, { value: "off" as TurnSignal, label: "Off" }, { value: "right" as TurnSignal, label: "Right", title: "P2 on the wheel" }]} />
        <CmdSeg v={v} kind="body.hazards" label="Hazard lights" glyph="hazard" actual={v.body.hazards} options={ONOFF} disabled={!usable} />
        <Momentary v={v} kind="body.horn" label="Horn" glyph="horn" active={v.body.horn} activeText="Sounding" holdLabel="Horn" compact disabled={!usable} />
      </div>
    </section>
  );
}

/** Drag the rim to steer. It springs back to centre when you let go, like the hardware wheel. */
function SteeringWheel({ enabled, cmd, actualDeg, halo }: { enabled: boolean; cmd: number; actualDeg: number; halo: VehicleState["control"] }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ last: number; steer: number } | null>(null);
  const spring = useRef(0);
  const angleAt = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  const release = () => {
    drag.current = null;
    cancelAnimationFrame(spring.current);
    const t0 = performance.now(), s0 = screenInput.steer;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 280);
      screenInput.set({ steer: s0 * (1 - k) * (1 - k) });
      if (k < 1) spring.current = requestAnimationFrame(step); else screenInput.set({ steer: 0, steerActive: false });
    };
    spring.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { cancelAnimationFrame(spring.current); screenInput.set({ steer: 0, steerActive: false }); }, []);
  useEffect(() => { if (!enabled && screenInput.steerActive) screenInput.set({ steer: 0, steerActive: false }); }, [enabled]);
  const rot = (cmd * STEER_SPAN * 180) / Math.PI;
  const act = (actualDeg / 35) * 150;
  const tick = (deg: number, r0: number, r1: number) => { const a = ((deg - 90) * Math.PI) / 180; return { x1: Math.cos(a) * r0, y1: Math.sin(a) * r0, x2: Math.cos(a) * r1, y2: Math.sin(a) * r1 }; };
  return (
    <svg ref={ref} className={`steer-wheel${enabled ? " live" : ""}`} viewBox="-110 -110 220 220" role="slider" tabIndex={enabled ? 0 : -1}
      aria-label="Steering" aria-valuemin={-35} aria-valuemax={35} aria-valuenow={Math.round(cmd * 35)} aria-disabled={!enabled}
      onPointerDown={(e) => {
        if (!enabled) return;
        capture(e);
        cancelAnimationFrame(spring.current);
        drag.current = { last: angleAt(e), steer: screenInput.steerActive ? screenInput.steer : 0 };
        screenInput.set({ steerActive: true, steer: drag.current.steer });
      }}
      onPointerMove={(e) => {
        const g = drag.current; if (!g) return;
        const a = angleAt(e), da = Math.atan2(Math.sin(a - g.last), Math.cos(a - g.last));
        g.last = a; g.steer = Math.max(-1, Math.min(1, g.steer + da / STEER_SPAN));
        screenInput.set({ steer: g.steer });
      }}
      onPointerUp={release} onPointerCancel={release}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault(); e.stopPropagation(); cancelAnimationFrame(spring.current);
        const s = Math.max(-1, Math.min(1, (screenInput.steerActive ? screenInput.steer : 0) + (e.key === "ArrowRight" ? 0.08 : -0.08)));
        screenInput.set({ steerActive: true, steer: s });
      }}
      onKeyUp={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") release(); }}>
      {/* Fixed scale: where the vehicle's road wheels actually are. */}
      <path d="M -88.3 -57.3 A 105 105 0 0 1 88.3 -57.3" transform="rotate(0)" fill="none" stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
      {[-150, -75, 0, 75, 150].map((t) => <line key={t} {...tick(t * 0.38, 100, 108)} stroke="var(--line-strong)" strokeWidth={2} />)}
      <line {...tick(act * 0.38, 92, 110)} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round"><title>Vehicle road-wheel angle</title></line>
      <g transform={`rotate(${rot})`}>
        <circle r={80} fill="none" stroke="var(--surface-3)" strokeWidth={18} />
        <circle r={80} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
        <circle r={70} fill="none" stroke={STATE_COLOR_VAR[halo]} strokeWidth={3} opacity={0.9} />
        <rect x={-78} y={-6} width={36} height={12} rx={6} fill="var(--surface-3)" />
        <rect x={42} y={-6} width={36} height={12} rx={6} fill="var(--surface-3)" />
        <rect x={-44} y={-24} width={88} height={48} rx={16} fill="var(--surface-2)" stroke="var(--line-strong)" />
        <rect x={-3} y={-89} width={6} height={18} rx={3} fill="var(--ink)" />
      </g>
    </svg>
  );
}

/** Press and hold; how far up you press is how hard. Springs back to zero on release. */
function Pedal({ which, label, glyph, enabled, cmd, actual }: { which: "throttle" | "brake"; label: string; glyph: Control; enabled: boolean; cmd: number; actual: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [down, setDown] = useState(false);
  const valueAt = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.max(0.05, Math.min(1, (r.bottom - e.clientY) / r.height)); };
  const end = () => { setDown(false); screenInput.set({ [which]: 0 }); };
  useEffect(() => () => { screenInput.set({ [which]: 0 }); }, [which]);
  return (
    <div className="pedal-col">
      <div ref={ref} className={`pedal-v${down ? " down" : ""}${enabled ? " live" : ""}`} role="slider" tabIndex={enabled ? 0 : -1} aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cmd * 100)} aria-disabled={!enabled}
        onPointerDown={(e) => { if (!enabled) return; capture(e); setDown(true); screenInput.set({ [which]: valueAt(e) }); }}
        onPointerMove={(e) => { if (down) screenInput.set({ [which]: valueAt(e) }); }}
        onPointerUp={end} onPointerCancel={end}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); e.stopPropagation(); setDown(true); screenInput.set({ [which]: which === "brake" ? 1 : 0.5 }); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") end(); }}>
        <div className="pedal-fill-v" style={{ height: `${actual * 100}%` }} />
        <div className="pedal-cmd-v" style={{ bottom: `${cmd * 100}%` }} />
      </div>
      <span className="label row"><ControlGlyph control={glyph} size={16} />{label}</span>
      <span className="mono" style={{ fontSize: 12 }}>{Math.round(actual * 100)}<span className="unit">%</span></span>
    </div>
  );
}
/** Keep receiving moves outside the control. Never let a failed capture block a steer or brake input. */
function capture(e: React.PointerEvent) { try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ } }
const fmtDeg = (d: number) => `${Math.abs(d) < 0.05 ? "" : d > 0 ? "R " : "L "}${Math.abs(d).toFixed(1)}°`;

/** Press and hold: sends on at pointer down and off at release, like the hardware key. */
function Momentary(p: { v: VehicleState; kind: CommandKind; label: string; glyph: Control; active: boolean; activeText: string; disabled: boolean; holdLabel?: string; compact?: boolean }) {
  const c = useLastCommand(p.v.id, p.kind);
  const [down, setDown] = useState(false);
  const start = () => { if (p.disabled || down) return; setDown(true); live.cmd(p.v.id, p.kind, true); };
  const end = () => { if (!down) return; setDown(false); live.cmd(p.v.id, p.kind, false); };
  return (
    <Ctl label={p.label} glyph={p.glyph} c={c}>
      <div className="row">
        <button type="button" className={`tp-btn tp-btn-secondary momentary${down ? " down" : ""}`} disabled={p.disabled}
          onPointerDown={start} onPointerUp={end} onPointerLeave={end}
          onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } }}
          onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") end(); }}>
          <ControlGlyph control={p.glyph} size={18} />{p.holdLabel ?? `Hold for ${p.label.toLowerCase()}`}
        </button>
        {!p.compact && <span className={`tag${p.active ? " solid" : ""}`}>{p.active ? p.activeText : "Off"}</span>}
      </div>
    </Ctl>
  );
}

function CabinPanel({ v, usable }: { v: VehicleState; usable: boolean }) {
  const [preset, setPreset] = useState(speakerChoice.id);
  const spk = useLastCommand(v.id, "comms.speaker");
  useEffect(() => { speakerChoice.id = preset; }, [preset]);
  return (
    <section className="deck-panel">
      <h3>Doors and cabin</h3>
      <CmdSeg v={v} kind="body.doors_lock" label="Door locks" actual={v.body.doorsLocked} disabled={!usable}
        options={[{ value: true, label: "Locked" }, { value: false, label: "Unlocked" }]} />
      <CmdSeg v={v} kind="body.door" label="Door" actual={v.body.doorOpen ? "open" : "closed"} disabled={!usable}
        options={[{ value: "closed", label: "Closed" }, { value: "open", label: "Open" }]} />
      <CmdSeg v={v} kind="body.cabin_lights" label="Cabin lights" actual={v.body.cabinLights} options={ONOFF} disabled={!usable} />
      <Ctl label="External speaker" glyph="speaker" c={spk}>
        <div className="row">
          <select className="select sm grow" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Announcement">
            {SPEAKER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.text}</option>)}
          </select>
          <Button disabled={!usable || isPending(spk)} onClick={() => live.cmd(v.id, "comms.speaker", preset)}>Play</Button>
        </div>
        {v.comms.speaker && <span className="tag solid" style={{ justifySelf: "start" }}>Playing on vehicle</span>}
      </Ctl>
      <Momentary v={v} kind="comms.talk" label="Talk" glyph="ptt" active={v.comms.talk} activeText="Intercom open" holdLabel="Hold to talk to cabin" disabled={!usable} />
      <div className="muted" style={{ fontSize: 12 }}>{v.comms.passengers} {v.comms.passengers === 1 ? "rider" : "riders"} on board</div>
    </section>
  );
}

/** Stop, reset, pull over, approve path. Docked beside the camera so it is always in view. */
export function SafetyBox({ v, held }: { v: VehicleState; held: boolean }) {
  const stop = useLastCommand(v.id, "estop.engage");
  const reset = useLastCommand(v.id, "estop.reset");
  const pull = useLastCommand(v.id, "mrm.pull_over");
  const proceed = useLastCommand(v.id, "assist.proceed");
  const latched = v.estop.engaged;
  return (
    <section className="safety" aria-label="Safety">
      <Button variant="stop" size="lg" glyph="estop" className="estop-btn" onClick={() => live.cmd(v.id, "estop.engage")} disabled={latched}>
        {latched ? "Stopped" : "Stop"}
      </Button>
      {latched
        ? <>
            <HoldToConfirm key={`reset-${v.estop.at}`} label="Hold to reset stop" doneLabel="Reset sent" glyph="release" tone="amber"
              disabled={!(held || !v.controller)} onConfirm={() => live.cmd(v.id, "estop.reset")} />
            <Readback c={reset} idle={v.controller && !held ? "Only the holding operator can reset" : `Latched${v.estop.source ? ` from ${v.estop.source}` : ""}. Reset hands it to you, parked.`} />
          </>
        : <Readback c={stop} idle="Esc or the red cap on the wheel" />}
      <div className="safety-row">
        <Button disabled={latched || isPending(pull)} onClick={() => live.cmd(v.id, "mrm.pull_over")} title="Stops at the curb, hazards on, then parks">Pull over</Button>
        {v.assist?.canProceed && v.control === "autonomy" && <Button disabled={isPending(proceed)} onClick={() => live.cmd(v.id, "assist.proceed")} title={v.assist.detail}>Approve path</Button>}
      </div>
      {v.assist && !(proceed && Date.now() - proceed.sentAt < 15000)
        ? <span className="rb" title={v.assist.detail}>Autonomy asks: {v.assist.title}</span>
        : v.assist ? <Readback c={proceed} /> : <Readback c={pull} idle="Pull over stops at the curb and parks" />}
    </section>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
