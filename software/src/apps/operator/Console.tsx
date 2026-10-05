// Operator console: fleet list on the left, the camera and control deck in the centre, the alert rail on the right.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Alert, Assignment, Command, User } from "@shared/types";
import { COMMAND_LABEL, STATE_COLOR_VAR, STATE_LABEL, kmh } from "@shared/controls";
import { AlertRow, Button, CameraSwitcher, ControlState, HoldToConfirm, LinkMeter, VehicleTile } from "../../ds";
import { useResource } from "../../lib/api";
import { live, useAlerts, useLastCommand, useVehicle, useVehicles } from "../../lib/live";
import { setLeaveGuard, setQuery, useQuery } from "../../lib/router";
import { clock, nameOf } from "../../lib/format";
import { wheel, useWheel } from "../../lib/wheel";
import { session, useSession } from "../../lib/session";
import { Seg } from "../../ui";
import { TicketDialog, type TicketDraft } from "../../ui/TicketDialog";
import { CameraView } from "./CameraView";
import { DriveStrip, MoreControls, Readback, SafetyBox, speakerChoice } from "./Controls";
import { mergedInput } from "../../lib/driveInput";
import { guideInput, stepGuide, useGuideInput } from "../../lib/guide";
import { NavMap } from "./NavMap";
import { WheelPanel } from "./WheelPanel";
import { MyShift } from "./MyShift";
import "./operator.css";

const VIEWS = ["front", "rear", "left", "right"];
const SEV_RANK = { critical: 0, warning: 1, info: 2 };

export function OperatorConsole({ me, users }: { me: User; users: User[] }) {
  const q = useQuery();
  const vehicles = useVehicles();
  const assignments = useResource<Assignment[]>("/api/assignments", ["assignments"]);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [view, setView] = useState("front");
  const [alertSel, setAlertSel] = useState(0);
  const [ticket, setTicket] = useState<TicketDraft | null>(null);
  const [releaseHold, setReleaseHold] = useState(0);
  const [toasts, setToasts] = useState<string[]>([]);
  const input = useWheel();
  const { vehiclesOpen, alertsOpen } = useSession();

  const mineIds = useMemo(() => new Set((assignments.data ?? []).filter((a) => a.userId === me.id).map((a) => a.vehicleId)), [assignments.data, me.id]);
  const isMine = (id: string) => mineIds.has(id) || live.byId.get(id)?.controller === me.id;
  const list = vehicles.filter((v) => scope === "all" || isMine(v.id));
  const selId = q.get("v") ?? list[0]?.id ?? vehicles[0]?.id ?? null;
  const v = useVehicle(selId);
  const held = !!v && v.controller === me.id;
  const heldByOther = !!v && !!v.controller && !held;

  const alerts = useAlerts()
    .filter((a) => !a.vehicleId || scope === "all" || isMine(a.vehicleId))
    .slice().sort((a, b) => Number(!!a.acknowledgedBy) - Number(!!b.acknowledgedBy) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.at - a.at);
  // With the alert panel closed, new alerts arrive as toasts (three at most). They leave when acknowledged,
  // dismissed or, for anything but critical, after 10 s. Every alert stays in the full list either way.
  const toastAlerts = toasts.map((id) => alerts.find((a) => a.id === id)).filter((a): a is Alert => !!a && !a.acknowledgedBy);
  const navAlerts = alertsOpen ? alerts : toastAlerts;
  const selAlert: Alert | undefined = navAlerts[Math.min(alertSel, navAlerts.length - 1)];
  const openCount = alerts.filter((a) => !a.acknowledgedBy).length;
  const critCount = alerts.filter((a) => !a.acknowledgedBy && a.severity === "critical").length;
  const setPanels = (p: { vehiclesOpen?: boolean; alertsOpen?: boolean }) => {
    session.set(p);
    if (p.alertsOpen) { setToasts([]); setAlertSel(0); }
  };
  const dismissToast = (id: string) => setToasts((t) => t.filter((x) => x !== id));

  // Latest state for wheel handlers without re-binding them every frame.
  const ref = useRef({ v, held, alerts: navAlerts, selAlert, view, me, scope });
  ref.current = { v, held, alerts: navAlerts, selAlert, view, me, scope };
  const select = (id: string) => setQuery({ v: id });

  const releaseFired = useRef(false);
  const [detections, setDetections] = useState(true);
  // Guidance: brake and nudge while autonomy keeps the vehicle. Only when nobody holds it.
  const guideAllowed = !!v && v.control === "autonomy" && !v.controller && v.service === "in_service" && (me.role === "operator" || me.role === "manager");
  useEffect(() => {
    if (!guideAllowed || !v) return;
    let seq = 0, lastActive = 0;
    const t = setInterval(() => {
      const g = stepGuide(0.1);
      const active = g.brake > 0.02 || Math.abs(g.offset) > 0.05;
      const now = performance.now();
      if (active) lastActive = now;
      if (active || now - lastActive < 600) live.send({ t: "guide", vehicleId: v.id, brake: g.brake, offset: g.offset, seq: ++seq });
    }, 100);
    return () => { clearInterval(t); guideInput.set({ brakeHold: 0, nudgeHold: 0, nudgeRamp: 0, drag: 0, dragging: false }); };
  }, [guideAllowed, v?.id]);
  // Drive stream: 20 Hz while this console holds the vehicle. The vehicle's 600 ms watchdog brakes if it stops.
  useEffect(() => {
    if (!held || !v) return;
    let seq = 0;
    const t = setInterval(() => {
      const s = mergedInput();
      live.send({ t: "drive", vehicleId: v.id, steer: s.steer, throttle: s.throttle, brake: s.brake, seq: ++seq });
      const h = wheel.heldMs("release");
      setReleaseHold(h);
      if (h >= 1200 && !releaseFired.current) { releaseFired.current = true; live.cmd(v.id, "control.release", undefined, src()); }
      if (h === 0) releaseFired.current = false;
    }, 50);
    return () => { clearInterval(t); setReleaseHold(0); };
  }, [held, v?.id]);

  // Wheel and keyboard buttons, one name per control.
  useEffect(() => {
    const offPress = wheel.onPress((b) => {
      const { v, held, alerts, selAlert, view } = ref.current;
      const cmd = (kind: Command["kind"], value?: unknown) => v && live.cmd(v.id, kind, value, src());
      switch (b) {
        case "estop": cmd("estop.engage"); break;
        case "claim": if (v && !held) cmd("control.claim"); break;
        case "hazard": if (v) cmd("body.hazards", !v.body.hazards); break;
        case "horn": if (held) cmd("body.horn", true); break;
        case "ptt": if (held) cmd("comms.talk", true); break;
        case "log": cmd("log.mark"); break;
        case "speaker": if (held) cmd("comms.speaker", speakerChoice.id); break;
        case "p1": if (held && v) cmd("body.turn_signal", v.body.turnSignal === "left" ? "off" : "left"); break;
        case "p2": if (held && v) cmd("body.turn_signal", v.body.turnSignal === "right" ? "off" : "right"); break;
        case "stick": if (selAlert && !selAlert.acknowledgedBy) live.ack(selAlert.id); break;
        case "dpadUp": setAlertSel((i) => Math.max(0, i - 1)); break;
        case "dpadDown": setAlertSel((i) => Math.min(Math.max(0, alerts.length - 1), i + 1)); break;
        case "dpadLeft": setView(VIEWS[(VIEWS.indexOf(view) + 3) % 4]); break;
        case "dpadRight": setView(VIEWS[(VIEWS.indexOf(view) + 1) % 4]); break;
      }
    });
    const offRelease = wheel.onRelease((b) => {
      const { v, held } = ref.current;
      if (!v || !held) return;
      if (b === "horn") live.cmd(v.id, "body.horn", false, src());
      if (b === "ptt") live.cmd(v.id, "comms.talk", false, src());
    });
    return () => { offPress(); offRelease(); };
  }, []);

  // Leaving the console stops the drive stream; the vehicle's watchdog then brakes it. Ask first.
  useEffect(() => {
    const holding = () => live.vehicles.filter((x) => x.controller === me.id && x.control === "operator").map((x) => x.id);
    setLeaveGuard((to) => {
      const ids = holding();
      return ids.length && !to.startsWith("/operate") ? `You are driving ${ids.join(", ")}. Leaving the console stops your input and the vehicle will brake to a stop. Release it first, or leave anyway?` : null;
    });
    const unload = (e: BeforeUnloadEvent) => { if (holding().length) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", unload);
    return () => { setLeaveGuard(null); window.removeEventListener("beforeunload", unload); };
  }, [me.id]);

  // The halo follows the selected vehicle; grips pulse once for new warnings and criticals on my vehicles.
  useEffect(() => { wheel.setHalo(v ? v.control : "off"); }, [v?.control, v?.id]);
  useEffect(() => live.onAlert((a, isNew) => {
    if (!isNew) return;
    const relevant = !a.vehicleId || ref.current.scope === "all" || isMine(a.vehicleId);
    if (!relevant) return;
    if (a.severity !== "info") wheel.pulse(1);
    if (session.get().alertsOpen) return;
    setToasts((t) => [a.id, ...t.filter((x) => x !== a.id)].slice(0, 3));
    if (a.severity !== "critical") setTimeout(() => setToasts((t) => t.filter((x) => x !== a.id)), 10000);
  }), [mineIds]);
  useEffect(() => { wheel.keyboardEnabled = session.get().keyboardDrive; }, []);

  const claim = useLastCommand(v?.id ?? null, "control.claim");
  const release = useLastCommand(v?.id ?? null, "control.release");
  const handoff = claim && release ? (claim.sentAt > release.sentAt ? claim : release) : claim ?? release;
  const openTicket = (c?: Command) => {
    if (!v) return;
    setTicket(c
      ? { vehicleId: c.vehicleId, type: c.kind === "log.mark" ? "incident" : "vehicle", priority: c.kind === "log.mark" ? 3 : 2,
          title: c.kind === "log.mark" ? `Operator mark on ${c.vehicleId}` : `${COMMAND_LABEL[c.kind]} ${c.status} on ${c.vehicleId}`,
          body: c.kind === "log.mark" ? `Marked at ${clock(c.sentAt, true)}. ${c.readback ?? ""}\n\n` : `${COMMAND_LABEL[c.kind]} at ${clock(c.sentAt, true)}: ${c.reason ?? c.readback ?? c.status}.`,
          links: { commandId: c.id } }
      : { vehicleId: v.id, title: "", body: "" });
  };

  return (
    <div className={`console${vehiclesOpen ? "" : " no-left"}${alertsOpen ? "" : " no-right"}`}>
      {!vehiclesOpen ? (
        <aside className="col col-left rail" aria-label="Vehicles">
          <button className="rail-toggle" onClick={() => setPanels({ vehiclesOpen: true })} title="Show the vehicle panel">Show</button>
          {list.map((x) => (
            <button key={x.id} className={`rail-unit${x.id === selId ? " sel" : ""}${x.controller === me.id ? " held" : ""}${x.estop.engaged ? " stopped" : ""}`}
              style={{ "--st": STATE_COLOR_VAR[x.control] } as React.CSSProperties} onClick={() => select(x.id)}
              title={`${x.id} · ${STATE_LABEL[x.control]}${x.assist ? ` · ${x.assist.title}` : ""}${x.controller === me.id ? " · held by you" : ""}`}
              aria-label={`${x.id}, ${STATE_LABEL[x.control]}${x.assist ? `, ${x.assist.title}` : ""}`} aria-pressed={x.id === selId}>
              <span className="mono">{x.id.replace("UNIT-", "")}</span>
              {x.assist && <i className="rail-assist" aria-hidden="true" />}
            </button>
          ))}
        </aside>
      ) : (
      <aside className="col col-left">
        <div className="panel-bar"><h2 className="heading">Vehicles</h2><Button variant="ghost" onClick={() => setPanels({ vehiclesOpen: false })}>Hide</Button></div>
        <MyShift me={me} />
        <div className="spread">
          <span className="label">Showing</span>
          <Seg label="Vehicle scope" value={scope} onChange={setScope} options={[{ value: "mine", label: `Mine · ${mineIds.size}` }, { value: "all", label: "All" }]} />
        </div>
        <div className="tiles">
          {list.length === 0 && <div className="empty">No vehicles assigned to you. A fleet manager assigns vehicles on the Fleet page.</div>}
          {list.map((x) => (
            <div key={x.id} className="tile-wrap">
              <VehicleTile id={x.id} route={x.service === "out_of_service" ? "Out of service" : x.routeName} state={x.control} speed={kmh(x.speed)} latencyMs={x.link.latencyMs}
                alert={x.assist?.title ?? (x.faults[0]?.text)} alertSeverity={x.estop.engaged ? "critical" : "warning"} selected={x.id === selId} onSelect={() => select(x.id)} />
              {x.controller && <span className="held-by">{x.controller === me.id ? "Held by you" : `Held by ${nameOf(users, x.controller)}`}</span>}
            </div>
          ))}
        </div>
        <WheelPanel halo={v ? v.control : "off"} releaseHold={releaseHold} />
      </aside>
      )}

      <main className="col col-center">
        {!v ? <div className="empty">Select a vehicle.</div> : <>
          <div className="cockpit">
            <StatusBar v={v} held={held} holder={nameOf(users, v.controller)}>
              {!alertsOpen && (
                <Button variant="ghost" className="sb-alerts" onClick={() => setPanels({ alertsOpen: true })}>
                  Alerts · {openCount}{critCount > 0 && <span className="tag crit" style={{ marginLeft: 6 }}>{critCount} critical</span>}
                </Button>
              )}
              <div className="sb-action">
                {held
                  ? <HoldToConfirm key={`rel-${v.id}-${v.controller}-${v.control}`} label="Hold to release" doneLabel="Releasing" glyph="release" tone="amber"
                      disabled={!!v.pendingControl || v.estop.engaged} onConfirm={() => live.cmd(v.id, "control.release")} />
                  : heldByOther
                    ? <HoldToConfirm key={`steal-${v.id}-${v.controller}`} label={`Hold to claim from ${nameOf(users, v.controller).split(" ")[0]}`} doneLabel="Claiming" glyph="claim" tone="mint"
                        onConfirm={() => live.cmd(v.id, "control.claim", { force: true })} />
                    : <Button variant="primary" glyph="claim" disabled={!!v.pendingControl || v.service === "out_of_service"} onClick={() => live.cmd(v.id, "control.claim")}>Claim vehicle</Button>}
                {held && v.estop.engaged ? <span className="rb muted">Reset the stop before releasing</span>
                  : <Readback c={handoff} idle={held ? "Release returns it to autonomy" : "Press C, or the mint key on the wheel"} />}
              </div>
            </StatusBar>

              <div data-theme="dark" className={`viewport${held ? " held" : ""}${v.estop.engaged ? " stopped" : ""}`}>
                <CameraView vehicleId={v.id} view={view} pan={input.stickX} guideAllowed={guideAllowed} showDetections={detections}
                  onLabel={(r) => live.cmd(v.id, "perception.label", r)} />
                <div className="hud hud-tl"><span className="label">{view} camera · simulated feed</span></div>
                <div className="hud hud-tr">
                  <button className={`hud-toggle${detections ? " on" : ""}`} aria-pressed={detections} onClick={() => setDetections(!detections)} title="Outline everything perception detects nearby">Detections</button>
                  <CameraSwitcher active={view} onChange={setView} />
                </div>
                {guideAllowed && <GuideBar v={v} />}
                {!alertsOpen && toastAlerts.length > 0 && (
                  <section className="toasts alerts" aria-label="New alerts" aria-live="polite">
                    {toastAlerts.map((a) => (
                      <div key={a.id} className={`toast alert-wrap${a === selAlert ? " sel" : ""}`} onClick={() => { if (a.vehicleId) select(a.vehicleId); }}>
                        <AlertRow severity={a.severity} title={a.title} detail={a.detail} vehicle={a.vehicleId} time={clock(a.at)} acknowledged={false} onAck={() => live.ack(a.id)} />
                        <button className="toast-x" onClick={(e) => { e.stopPropagation(); dismissToast(a.id); }} aria-label={`Dismiss ${a.title}`}>Dismiss</button>
                      </div>
                    ))}
                    <button className="toast-all" onClick={() => setPanels({ alertsOpen: true })}>View all alerts · {openCount} open</button>
                  </section>
                )}

                <div className="hud hud-bl">
                  <span className="readout">{kmh(v.speed)}<small> km/h</small></span>
                  <span className="tag ink mono">{v.drive.gear}{v.drive.parkingBrake ? " · P-brake" : ""}</span>
                  {v.body.turnSignal !== "off" && <span className="tag solid">Signal {v.body.turnSignal}</span>}
                  {v.body.hazards && <span className="tag solid">Hazards</span>}
                  {v.body.doorOpen && <span className="tag solid">Door open</span>}
                </div>
                <div className="hud hud-br"><LinkMeter latencyMs={v.link.latencyMs} /></div>
                {v.link.latencyMs == null && <div className="lost"><span className="tp-link-q" style={{ background: "var(--stop-fill)", color: "var(--on-stop)", padding: "4px 10px", borderRadius: 4, fontSize: 14 }}>Link lost</span><span>Last frame shown. {v.control === "operator" ? "The vehicle is braking to a stop." : "Autonomy continues on route."}</span></div>}
              </div>
              <NavMap v={v} />
              <div className="drive-wrap"><DriveStrip v={v} held={held} guide={guideAllowed} /></div>
              <SafetyBox v={v} held={held} />
          </div>

          <div className="below">
            <div className="deck-legend muted">More controls. Filled is what the vehicle reports; outlined is requested and not yet confirmed.{!held && " Claim the vehicle to use them."}</div>
            <MoreControls v={v} held={held} onTicket={openTicket} />
          </div>
        </>}
      </main>

      {alertsOpen && <aside className="col col-right">
        <div className="panel-bar">
          <h2 className="heading">Alerts <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{openCount} open</span></h2>
          <Button variant="ghost" onClick={() => setPanels({ alertsOpen: false })} title="New alerts will appear as toasts">Hide</Button>
        </div>
        <div className="alerts">
          {alerts.length === 0 && <div className="empty">No open alerts.</div>}
          {alerts.map((a, i) => (
            <div key={a.id} className={`alert-wrap${a === selAlert ? " sel" : ""}`} onClick={() => { setAlertSel(i); if (a.vehicleId) select(a.vehicleId); }}>
              <AlertRow severity={a.severity} title={a.title} detail={a.detail} vehicle={a.vehicleId} time={clock(a.at)} acknowledged={!!a.acknowledgedBy}
                onAck={() => live.ack(a.id)} />
            </div>
          ))}
        </div>
      </aside>}
      <TicketDialog open={!!ticket} draft={ticket ?? undefined} users={users} onClose={() => setTicket(null)} />
    </div>
  );
}

/** One slim line that says who is driving. Amber when you hold the vehicle; solid red only for a latched stop. */
function StatusBar({ v, held, holder, children }: { v: NonNullable<ReturnType<typeof useVehicle>>; held: boolean; holder: string; children: React.ReactNode }) {
  const tone = v.estop.engaged ? "stop" : v.control === "transitioning" ? "trans" : held ? "op" : "neutral";
  const msg = v.estop.engaged ? `Emergency stop latched${v.estop.at ? ` at ${clock(v.estop.at, true)}` : ""}. Reset it under the map when it is safe.`
    : v.control === "transitioning" ? (v.pendingControl === "claim" ? "Handing control to you" : "Handing control back to autonomy")
    : held ? "You are driving"
    : v.controller ? `Held by ${holder}. Controls are read-only.`
    : v.service === "out_of_service" ? "Out of service" : v.stop ? `At ${v.stop.name}` : v.assist ? v.assist.title : v.routeName;
  return (
    <div className={`statusbar sb-${tone}`} role="status">
      <ControlState state={v.control} vehicle={v.id} />
      <span className="sb-msg">{msg}</span>
      <span className="sb-meta">
        <span className="mono">{kmh(v.speed)}<span className="unit"> km/h</span></span>
        <span className="mono">{Math.round(v.power.soc)}<span className="unit"> %</span></span>
        <LinkMeter latencyMs={v.link.latencyMs} compact />
      </span>
      {children}
    </div>
  );
}

const src = (): Command["source"] => (wheel.state.kind === "keyboard" ? "keyboard" : wheel.state.kind === "none" ? "console" : "wheel");

/** Remote guidance on the camera: hold to nudge autonomy's path or to brake. Let go and autonomy carries on. */
function GuideBar({ v }: { v: NonNullable<ReturnType<typeof useVehicle>> }) {
  const g = useGuideInput();
  const label = useLastCommand(v.id, "perception.label");
  const hold = (patch: Partial<typeof guideInput>, off: Partial<typeof guideInput>) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* synthetic */ } guideInput.set(patch); },
    onPointerUp: () => guideInput.set(off), onPointerCancel: () => guideInput.set(off), onPointerLeave: () => guideInput.set(off),
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); e.stopPropagation(); guideInput.set(patch); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") guideInput.set(off); },
  });
  const status = v.guide
    ? [v.guide.brake > 0.02 && `braking ${Math.round(v.guide.brake * 100)}%`, Math.abs(v.guide.offsetM) > 0.05 && `path ${Math.abs(v.guide.offsetM).toFixed(1)} m ${v.guide.offsetM < 0 ? "left" : "right"}`].filter(Boolean).join(" · ")
    : null;
  return (
    <div className="guide-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="guide-btns">
        <button className={`guide-btn${g.nudgeHold < 0 ? " down" : ""}`} {...hold({ nudgeHold: -1 }, { nudgeHold: 0 })}>Nudge left</button>
        <button className={`guide-btn brake${g.brakeHold > 0 ? " down" : ""}`} {...hold({ brakeHold: 1 }, { brakeHold: 0 })}>Hold to brake</button>
        <button className={`guide-btn${g.nudgeHold > 0 ? " down" : ""}`} {...hold({ nudgeHold: 1 }, { nudgeHold: 0 })}>Nudge right</button>
      </div>
      <span className="guide-status">
        {status ? <>Autonomy is following you: {status}</> : label && Date.now() - label.sentAt < 8000 ? <Readback c={label} /> : "Guide without claiming: hold a button, drag across the view, or click anything to label it"}
      </span>
    </div>
  );
}
