// One system, one story: the rigged Wheel, the operator's console and the vehicle, driven by a single timeline.
// The Wheel plays the rig's own clips (hardware/rig.py), scheduled on the timeline. Every frame the console reads the
// model's animated transforms (rim angle, paddle travel, which keys are down), and the operator's camera is the
// console's own three.js World, rendered from a vehicle pose the story drives. Nothing on screen changes size.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ControlStateName, VehicleState } from "@shared/types";
import cues from "../../../../hardware/out_v6/animation_cues.json";
import wheelGlb from "../../assets/wheel-rigged.glb?url";
import imgKeys from "../../assets/detail/keys.jpg";
import imgEstop from "../../assets/detail/estop.jpg";
import imgHalo from "../../assets/detail/halo.jpg";
import imgPaddles from "../../assets/detail/paddles.jpg";
import imgDpad from "../../assets/detail/dpad.jpg";
import imgStick from "../../assets/detail/stick.jpg";
import { AlertRow, Button, CameraSwitcher, ControlState, HoldToConfirm, LinkMeter } from "../../ds";
import { live } from "../../lib/live";
import { LANE_PATHS } from "../../ui/CityLayers";
import { Pedal, SteeringWheel } from "../operator/Controls";
import { World } from "../operator/scene/world";

const HALO = cues.halo_colors as Record<ControlStateName, string>;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (a: number, b: number, t: number) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };

// ── The script ──────────────────────────────────────────────────────────────

const CHAPTERS = [
  { id: "ask", name: "Autonomy asks", from: 0, to: 3.5, cam: "wide", caption: "UNIT-14 stops behind a double-parked truck and asks for help. The alert reaches the operator's console." },
  { id: "claim", name: "Claim", from: 3.5, to: 5.2, cam: "keys", caption: "The operator presses the mint Claim key. The console sends control.claim and waits for the vehicle to confirm before it says “You are driving”." },
  { id: "drive", name: "Drive around", from: 5.2, to: 11.7, cam: "drive", caption: "Right paddle for throttle, the rim to swing around the truck, left paddle to brake. The Wheel streams to the vehicle 20 times a second." },
  { id: "release", name: "Hand back", from: 11.7, to: 14.43, cam: "keys", caption: "Holding Release for 1.2 s hands UNIT-14 back to autonomy. The halo, the badge and the border all turn back to mint together." },
  { id: "stop", name: "Emergency stop", from: 14.43, to: 18.8, cam: "estop", caption: "A pedestrian steps out. One press of the red cap stops the vehicle and opens an incident; a twist releases it." },
] as const;
const TOTAL = 18.8;
/** When each rig clip plays, and which part of it. */
const SCHEDULE = [
  { clip: "claim_handoff", start: 3.5, from: 0.2, to: 1.9 },
  { clip: "paddles", start: 5.2, from: 0, to: 0.95 },
  { clip: "steer", start: 6.15, from: 0, to: 4.5 },
  { clip: "paddles", start: 10.65, from: 0.95, to: 2.0 },
  { clip: "claim_handoff", start: 11.7, from: 2.6, to: 5.33 },
  { clip: "estop", start: 14.6, from: 0, to: 3.33 },
];
const T_CLAIM = 3.9, T_HELD = 4.8, T_REL_DOWN = 12.2, T_REL_DONE = 13.4, T_AUTO = 14.1, T_STOP = 15.07, T_TWIST = 17.2, T_RESUME = 17.8;

function stateAt(T: number): ControlStateName {
  if (T < 3.9) return "autonomy";
  if (T < T_HELD) return "transitioning";
  if (T < T_REL_DONE) return "operator";
  if (T < T_AUTO) return "transitioning";
  if (T < T_STOP) return "autonomy";
  if (T < T_TWIST) return "stopped";
  if (T < T_RESUME) return "transitioning";
  return "autonomy";
}
/** The vehicle's speed in m/s: cruise, stop for the truck, creep past it, hand back, emergency stop, resume. */
function speedAt(T: number) {
  if (T < 2.6) return 6.5 * (1 - ease(0.4, 2.6, T));
  if (T < 5.35) return 0;
  if (T < 10.7) return 5.2 * ease(5.35, 6.4, T);
  if (T < T_AUTO) return 5.2 - 3.6 * ease(10.7, 11.4, T);
  if (T < T_STOP) return 1.6 + 4.6 * ease(T_AUTO, 15.0, T);
  if (T < T_RESUME) return 6.2 * (1 - ease(T_STOP, 15.5, T));
  return 4.5 * ease(T_RESUME, TOTAL, T);
}
/** Metres to the left of the lane centre: swing out around the truck and back in. */
const leftAt = (T: number) => 3.1 * ease(6.35, 7.7, T) * (1 - ease(9.0, 10.45, T));
const DT = 1 / 120;
const DIST = (() => { const n = Math.ceil(TOTAL / DT) + 2, a = new Float32Array(n); for (let i = 1; i < n; i++) a[i] = a[i - 1] + speedAt(i * DT) * DT; return a; })();
const distAt = (T: number) => DIST[Math.min(DIST.length - 1, Math.max(0, Math.round(T / DT)))];

function statusMsg(T: number, s: ControlStateName) {
  if (s === "stopped") return "Emergency stop latched. Twist the cap to release.";
  if (T < 2.6) return "On its run · Harbor freight";
  if (T < T_CLAIM) return "Double-parked truck in lane";
  if (T < T_HELD) return "Handing control to you";
  if (T < T_REL_DOWN) return "You are driving";
  if (T < T_REL_DONE) return "Hold Release to hand back";
  if (T < T_AUTO) return "Handing control back to autonomy";
  if (T < T_STOP) return T > 14.6 ? "Pedestrian stepping off the curb" : "On its run · Harbor freight";
  if (T < T_RESUME) return "Stop released · checks running";
  return "On its run · Harbor freight";
}
type Wire = { up?: string; down?: string; back?: string };
function wireAt(T: number, steerDeg: number, thr: number, brk: number): Wire {
  if (T >= 2.6 && T < 3.5) return { back: "assist · blocked lane" };
  if (T >= 3.75 && T < 4.1) return { up: "Claim key", down: "control.claim" };
  if (T >= 4.1 && T < T_HELD) return { down: "control.claim", back: "ack 38 ms" };
  if (T >= T_HELD && T < 5.25) return { back: "confirmed · 212 ms" };
  if (T >= 5.25 && T < 11.6) return { up: `rim ${Math.round(steerDeg) === 0 ? "" : steerDeg > 0 ? "R " : "L "}${Math.abs(Math.round(steerDeg))}° · ${thr > 0.02 ? `throttle ${Math.round(thr * 100)}%` : brk > 0.02 ? `brake ${Math.round(brk * 100)}%` : "paddles off"}`, down: "drive · 20 Hz" };
  if (T >= T_REL_DOWN && T < T_REL_DONE) return { up: `Release held ${Math.min(1.2, T - T_REL_DOWN).toFixed(1)} s` };
  if (T >= T_REL_DONE && T < T_AUTO) return { down: "control.release", back: "ack 41 ms" };
  if (T >= T_AUTO && T < 14.43) return { back: "confirmed · 188 ms" };
  if (T >= 14.95 && T < 15.4) return { up: "E-stop cap", down: "estop.engage" };
  if (T >= 15.4 && T < 16.6) return { back: "stopped · incident opened" };
  if (T >= 16.95 && T < 17.5) return { up: "Cap twisted", down: "estop.reset" };
  if (T >= 17.5 && T < 18.3) return { back: "checks passed · autonomy" };
  return {};
}

interface Frame {
  T: number; state: ControlStateName; pulse: number; msg: string; kmh: number;
  cmd: number; actDeg: number; brake: number; thr: number; brakeAct: number; thrAct: number;
  claimDown: boolean; estopDown: boolean; relProg: number; wire: Wire; waited: number;
}
const FIRST: Frame = { T: 0, state: "autonomy", pulse: 1, msg: statusMsg(0, "autonomy"), kmh: 23, cmd: 0, actDeg: 0, brake: 0, thr: 0, brakeAct: 0, thrAct: 0, claimDown: false, estopDown: false, relProg: 0, wire: {}, waited: 0 };

// ── The story player ────────────────────────────────────────────────────────

export function SystemStory() {
  const host = useRef<HTMLDivElement>(null);
  const wheelHost = useRef<HTMLDivElement>(null);
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const [f, setF] = useState<Frame>(FIRST);
  const [playing, setPlaying] = useState(!reduced());
  const [loaded, setLoaded] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const clock = useRef({ T: 0, playing: !reduced(), jump: null as number | null });
  clock.current.playing = playing;
  // Dev only: lets a script pause the story on an exact moment (window.__story.jump = 9.6) to check each beat.
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __story?: unknown }).__story = Object.assign(clock.current, { pause: () => setPlaying(false) }); }, []);

  useEffect(() => {
    const el = host.current!;
    let visible = false, started = false, disposed = false, stop = () => {};
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !started) { started = true; setLoaded("loading"); boot().catch((err) => { console.error(err); setLoaded("error"); }); }
    }, { rootMargin: "200px" });
    io.observe(el);

    async function boot() {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed) return;

      // The Wheel.
      const wh = wheelHost.current!;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
      wh.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.3); keyLight.position.set(-0.6, 1.2, 0.9); scene.add(keyLight);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.005, 20);
      const draco = new DRACOLoader(); draco.setDecoderPath("/draco/");
      const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
      const g = await loader.loadAsync(wheelGlb);
      if (disposed) { renderer.dispose(); return; }
      const model = g.scene; model.scale.setScalar(0.001); scene.add(model); model.updateMatrixWorld(true);
      const halo: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
      model.traverse((o) => {
        const m = o as InstanceType<typeof THREE.Mesh>;
        if (m.isMesh && /^Halo/.test((m.material as { name?: string })?.name ?? "")) { m.material = (m.material as InstanceType<typeof THREE.MeshStandardMaterial>).clone(); halo.push(m.material as InstanceType<typeof THREE.MeshStandardMaterial>); }
      });

      // Every node any clip moves, and its rest pose (for reading angles). The mixer itself returns a node to its saved
      // rest pose when no clip drives it; resetting by hand would hide the next write, since it only writes changes.
      const animated = new Set<string>();
      g.animations.forEach((a) => a.tracks.forEach((t) => animated.add(t.name.split(".")[0])));
      const rest = new Map([...animated].map((n) => { const o = model.getObjectByName(n)!; return [n, { o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }]; }));
      const mixer = new THREE.AnimationMixer(model);
      const actions = new Map(g.animations.map((a) => { const act = mixer.clipAction(a); act.play(); act.paused = true; act.enabled = false; return [a.name, act]; }));
      const pose = (T: number) => {
        actions.forEach((a) => { a.enabled = false; });
        const s = SCHEDULE.find((x) => T >= x.start && T < x.start + (x.to - x.from));
        if (s) { const a = actions.get(s.clip)!; a.enabled = true; a.setEffectiveWeight(1); a.time = Math.min(a.getClip().duration - 1e-4, s.from + (T - s.start)); }
        mixer.update(0);
      };
      const q = new THREE.Quaternion();
      const angle = (n: string) => {
        const r = rest.get(n)!; q.copy(r.q).invert().multiply(r.o.quaternion);
        const a = 2 * Math.acos(clamp(Math.abs(q.w))) * 180 / Math.PI;
        const ax = [q.x, q.y, q.z].reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
        return Math.sign(ax) * Math.sign(q.w || 1) < 0 ? -a : a;
      };
      const moved = (n: string) => { const r = rest.get(n)!; return r.o.position.distanceTo(r.p); };
      // Calibrate the rim's sign: in the rig the steer clip is at +90° (turning left) one second in.
      actions.get("steer")!.enabled = true; actions.get("steer")!.time = 1.0; mixer.update(0);
      const rimSign = angle("RIG_Steer") >= 0 ? 1 : -1;
      pose(0);

      // Close-up cameras, aimed at the parts each beat is about.
      const box = new THREE.Box3().setFromObject(model);
      const C = box.getCenter(new THREE.Vector3()), S = box.getSize(new THREE.Vector3()).length();
      const at = (n: string) => model.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
      const shot = (target: InstanceType<typeof THREE.Vector3>, dir: [number, number, number], dist: number) => ({ pos: target.clone().add(new THREE.Vector3(...dir).normalize().multiplyScalar(S * dist)), look: target.clone() });
      const keysAt = at("KEY_Claim").lerp(at("KEY_Release"), 0.5);
      const CAMS = {
        wide: shot(C, [-0.55, 0.3, 0.8], 1.55),
        keys: shot(keysAt, [0.28, 0.22, 1], 0.62),
        steer: shot(C.clone().add(new THREE.Vector3(0, S * 0.1, 0)), [-0.12, 0.18, 1], 1.55),
        paddles: shot(at("PADDLE_R").lerp(at("PADDLE_L"), 0.5).lerp(C, 0.2), [0.7, 0.36, -1], 1.4),
        estop: shot(at("KEY_EStop"), [-0.18, 0.32, 1], 0.62),
      };
      type CamName = keyof typeof CAMS;
      const camFor = (T: number): CamName => {
        const ch = CHAPTERS.find((c) => T >= c.from && T < c.to) ?? CHAPTERS[0];
        if (ch.cam === "drive") return T < 6.1 || T >= 10.6 ? "paddles" : "steer";
        return ch.cam as CamName;
      };
      let camName: CamName = camFor(0);
      const camPos = CAMS[camName].pos.clone(), camLook = CAMS[camName].look.clone();
      let move: { from: { pos: InstanceType<typeof THREE.Vector3>; look: InstanceType<typeof THREE.Vector3> }; t0: number } | null = null;
      camera.position.copy(camPos); camera.lookAt(camLook);

      // The operator's camera: the console's own world, rendered from the story's vehicle pose.
      const world = new World(camCanvas.current!);
      const lane = LANE_PATHS.harbor;
      const [a0, a1] = [lane[0], lane[1]];
      const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      const dir = { x: (a1[0] - a0[0]) / len, y: (a1[1] - a0[1]) / len }, leftV = { x: dir.y, y: -dir.x }, h0 = Math.atan2(dir.y, dir.x);
      const start = { x: a0[0] + dir.x * 60, y: a0[1] + dir.y * 60 };
      const posAt = (T: number) => { const s = distAt(T), l = leftAt(T); return { x: start.x + dir.x * s + leftV.x * l, y: start.y + dir.y * s + leftV.y * l }; };
      const truck = { x: start.x + dir.x * (distAt(2.6) + 11) - leftV.x * 0.3, y: start.y + dir.y * (distAt(2.6) + 11) - leftV.y * 0.3, heading: h0 };
      const ped = { x: start.x + dir.x * (distAt(T_STOP) + 9), y: start.y + dir.y * (distAt(T_STOP) + 9), heading: h0 };

      const resize = () => {
        const r = wh.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
        const c = camCanvas.current!; world.setSize(c.clientWidth, c.clientHeight, devicePixelRatio || 1);
      };
      const ro = new ResizeObserver(resize); ro.observe(wh); ro.observe(camCanvas.current!); resize();

      let last = performance.now(), brakeAct = 0, thrAct = 0, actDeg = 0;
      renderer.setAnimationLoop((now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!visible) return;
        const ck = clock.current;
        if (ck.jump != null) { ck.T = ck.jump; ck.jump = null; move = null; camName = camFor(ck.T); camPos.copy(CAMS[camName].pos); camLook.copy(CAMS[camName].look); }
        else if (ck.playing) ck.T = (ck.T + dt) % TOTAL;
        const T = ck.T;
        pose(T);

        // Read the Wheel.
        const rim = rimSign * angle("RIG_Steer");
        const cmd = clamp(-rim / 90, -1, 1);
        const brake = clamp(Math.abs(angle("PADDLE_L")) / 6), thr = clamp(Math.abs(angle("PADDLE_R")) / 6);
        const k = clamp(dt * 7); brakeAct += (brake - brakeAct) * k; thrAct += (thr - thrAct) * k; actDeg += (cmd * 35 * 0.6 - actDeg) * clamp(dt * 5);
        const state = stateAt(T);
        const pulse = state === "transitioning" && !reduced() ? 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((now / 900) * 2 * Math.PI)) : 1;
        const col = new THREE.Color(HALO[state]);
        halo.forEach((m) => { m.emissive.copy(col); m.color.copy(col); m.emissiveIntensity = 2.4 * pulse; });

        // Camera: glide to the beat's close-up.
        const want = camFor(T);
        if (want !== camName) { move = { from: { pos: camPos.clone(), look: camLook.clone() }, t0: now }; camName = want; }
        if (move) {
          const e = reduced() ? 1 : ease(0, 1, (now - move.t0) / 1100);
          camPos.lerpVectors(move.from.pos, CAMS[camName].pos, e); camLook.lerpVectors(move.from.look, CAMS[camName].look, e);
          if (e >= 1) move = null;
        }
        camera.position.copy(camPos); camera.lookAt(camLook);
        renderer.render(scene, camera);

        // The operator's view.
        const base = live.vehicles.find((v) => v.id === "UNIT-14") ?? live.vehicles[0];
        if (base) {
          const p = posAt(T), p2 = posAt(Math.min(TOTAL - 0.01, T + 0.05)), p1 = posAt(Math.max(0, T - 0.05));
          const moving = Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.002;
          const heading = moving ? Math.atan2(p2.y - p1.y, p2.x - p1.x) : h0;
          const assist: VehicleState["assist"] = T < 11 ? { id: "story-truck", kind: "blocked_lane", title: "Double-parked truck in lane", detail: "", since: 0, canProceed: true, obstacle: truck }
            : T >= 14.6 && T < T_RESUME ? { id: "story-ped", kind: "pedestrian", title: "Pedestrian", detail: "", since: 0, canProceed: false, obstacle: ped } : null;
          const v = { ...base, id: "UNIT-14", control: state, assist } as VehicleState;
          const c = camCanvas.current!;
          world.frame(v, live.vehicles.filter((o) => o.id !== base.id), { x: p.x, y: p.y, h: heading }, "front", 0, 1000 + T, c.clientWidth, c.clientHeight);
        }

        setF({
          T, state, pulse, msg: statusMsg(T, state), kmh: Math.round(speedAt(T) * 3.6), cmd, actDeg, brake, thr, brakeAct, thrAct,
          claimDown: moved("KEY_Claim") > 0.15, estopDown: moved("KEY_EStop") > 2,
          relProg: T >= T_REL_DOWN && T < T_AUTO ? clamp((T - T_REL_DOWN) / 1.2) : 0,
          wire: wireAt(T, cmd * 90, thr, brake), waited: Math.max(0, Math.round(Math.min(T, T_CLAIM) - 2.6)),
        });
      });
      setLoaded("ready");
      stop = () => { renderer.setAnimationLoop(null); ro.disconnect(); mixer.stopAllAction(); renderer.dispose(); pmrem.dispose(); draco.dispose(); world.dispose(); renderer.domElement.remove(); };
    }
    return () => { disposed = true; io.disconnect(); stop(); };
  }, []);

  const chIndex = Math.max(0, CHAPTERS.findIndex((c) => f.T >= c.from && f.T < c.to));
  const ch = CHAPTERS[chIndex];
  const jump = (T: number) => { clock.current.jump = T; setPlaying(true); };
  const held = f.state === "operator" || (f.state === "transitioning" && f.T >= T_REL_DONE && f.T < 14.43);
  const tone = f.state === "stopped" ? "stop" : f.state === "transitioning" ? "trans" : held ? "op" : "neutral";
  const alert = f.T >= 2.6 && f.T < T_AUTO
    ? { severity: "warning" as const, title: "Double-parked truck in lane", detail: f.T < T_HELD ? `UNIT-14 waiting ${f.waited} s · Harbor freight` : "An operator is driving around it" }
    : f.T >= T_STOP && f.T < T_RESUME ? { severity: "critical" as const, title: "Emergency stop", detail: "Engaged from the Wheel at ST-01 · incident opened" } : null;

  return (
    <div className="sys" ref={host}>
      <div className="sys-stage">
        <div className="sys-wheel">
          <div className="sys-wheel-gl" ref={wheelHost} />
          {loaded !== "ready" && <div className="sys-loading muted">{loaded === "error" ? "The 3D Wheel could not load in this browser." : "Loading the Wheel"}</div>}
          <div className="sys-tag"><i style={{ background: HALO[f.state], opacity: 0.4 + 0.6 * f.pulse }} />Halo<b>{f.state}</b></div>
          <div className="sys-tag right">teleop Wheel · ST-01</div>
        </div>

        <div className="sys-console" data-theme="dark">
          <div className={`statusbar sb-${tone} sys-sb`} role="status">
            <ControlState state={f.state} vehicle="UNIT-14" />
            <span className="sb-msg">{f.msg}</span>
            <div className="sys-action">
              {f.state === "stopped" ? <span className="sys-action-note">Twist the cap, or Reset under the map</span>
                : held || f.relProg > 0
                  ? <div className="sys-hold"><i style={{ width: `${f.relProg * 100}%` }} /><span>{f.relProg > 0 ? (f.relProg < 1 ? `Releasing · ${(f.relProg * 1.2).toFixed(1)} s` : "Released") : "Hold to release"}</span></div>
                  : <span className={`sys-press${f.claimDown ? " down" : ""}`}><Button variant="primary" glyph="claim" tabIndex={-1}>Claim vehicle</Button></span>}
            </div>
          </div>

          <div className={`viewport sys-view${held ? " held" : ""}${f.state === "stopped" ? " stopped" : ""}`}>
            <canvas ref={camCanvas} className="cam-canvas" aria-label="The operator's front camera, simulated" />
            <div className="hud hud-tl"><span className="label">front camera · simulated feed</span></div>
            <div className="hud hud-bl">
              <span className="readout">{f.kmh}<small> km/h</small></span>
              <span className="tag ink mono">D</span>
              {f.state === "stopped" && <span className="tag solid">Hazards</span>}
            </div>
            <div className="hud hud-br"><LinkMeter latencyMs={48} /></div>
            <div className="sys-toast">
              {alert && <div key={alert.title} className="sys-toast-in"><AlertRow severity={alert.severity} title={alert.title} detail={alert.detail} vehicle="UNIT-14" time="now" /></div>}
            </div>
          </div>

          <div className="sys-drive">
            <div className="sys-steer">
              <SteeringWheel enabled={f.state === "operator"} cmd={f.cmd} actualDeg={f.actDeg} halo={f.state} />
            </div>
            <div className="pedals">
              <Pedal which="brake" label="Brake" glyph="brake" enabled={f.state === "operator"} cmd={f.brake} actual={f.brakeAct} />
              <Pedal which="throttle" label="Throttle" glyph="throttle" enabled={f.state === "operator"} cmd={f.thr} actual={f.thrAct} />
            </div>
            <div className="sys-drive-read">
              <span className="label">Input</span>
              <b>{f.state === "operator" ? "teleop Wheel" : "Autonomy is driving"}</b>
              <span className="muted">{f.state === "operator" ? "Dashed is your input, solid is what the vehicle did." : "Controls go live when you claim."}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="sys-wire" aria-label="Signal path">
        <span className="sys-node"><b>Wheel</b><small>USB · ST-01</small></span>
        <span className={`sys-link${f.wire.up ? " on" : ""}`}><i /><em>{f.wire.up ?? ""}</em></span>
        <span className="sys-node"><b>Console</b><small>fleet service</small></span>
        <span className={`sys-link${f.wire.down ? " on" : ""}${f.wire.back ? " back" : ""}`}><i /><em>{f.wire.down ?? ""}{f.wire.down && f.wire.back ? " · " : ""}{f.wire.back ?? ""}</em></span>
        <span className="sys-node"><b>UNIT-14</b><small>vehicle gateway</small></span>
      </div>

      <div className="sys-chapters" role="tablist" aria-label="Story">
        {CHAPTERS.map((c, i) => {
          const p = i < chIndex ? 1 : i > chIndex ? 0 : (f.T - c.from) / (c.to - c.from);
          return (
            <button key={c.id} role="tab" aria-selected={i === chIndex} className={i === chIndex ? "on" : ""} onClick={() => jump(c.from + 0.001)}>
              <span className="sys-ch-bar"><i style={{ transform: `scaleX(${clamp(p)})` }} /></span>
              <span className="data faint">0{i + 1}</span>
              <span>{c.name}</span>
            </button>
          );
        })}
        <button className="sys-play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={playing ? "M4 2h3v12H4zM9 2h3v12H9z" : "M4 2l10 6-10 6z"} fill="currentColor" /></svg>
        </button>
      </div>
      <p className="sys-caption" key={ch.id}>{ch.caption}</p>
    </div>
  );
}

// ── Details: each part of the Wheel next to the console part it drives ─────

export function Details() {
  return (
    <div className="dt-grid">
      <DetailClaim />
      <DetailStop />
      <DetailHalo />
      <DetailPaddles />
      <DetailDpad />
      <DetailStick />
    </div>
  );
}

function Tile({ img, alt, title, text, children }: { img: string; alt: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <figure className="dt reveal">
      <div className="dt-img"><img src={img} alt={alt} loading="lazy" /></div>
      <div className="dt-ui" data-theme="dark">{children}</div>
      <figcaption><b className="heading">{title}</b><span className="muted">{text}</span></figcaption>
    </figure>
  );
}

function DetailClaim() {
  const [held, setHeld] = useState(false);
  return (
    <Tile img={imgKeys} alt="Close-up of the Wheel's right key column: the mint Claim key above Release and Horn." title="Claim and Release"
      text="Mint key to claim, the key below it held 1.2 s to release. The screen uses the same press and the same hold.">
      <ControlState state={held ? "operator" : "autonomy"} vehicle="UNIT-14" />
      {held
        ? <HoldToConfirm label="Hold to release" doneLabel="Released" glyph="release" onConfirm={() => setTimeout(() => setHeld(false), 300)} />
        : <Button variant="primary" glyph="claim" onClick={() => setHeld(true)}>Claim vehicle</Button>}
    </Tile>
  );
}

function DetailStop() {
  const [stopped, setStopped] = useState(false);
  return (
    <Tile img={imgEstop} alt="Close-up of the domed red emergency stop cap in its graphite bezel." title="Emergency stop"
      text="A domed cap you can hit without looking. Esc and the on-screen Stop do the same, and the vehicle stops on its own if the stream drops.">
      <ControlState state={stopped ? "stopped" : "autonomy"} vehicle="UNIT-14" />
      {stopped ? <Button variant="secondary" onClick={() => setStopped(false)}>Reset</Button> : <Button variant="stop" glyph="estop" onClick={() => setStopped(true)}>Stop</Button>}
    </Tile>
  );
}

const CYCLE: ControlStateName[] = ["autonomy", "transitioning", "operator", "transitioning", "autonomy", "stopped"];
function DetailHalo() {
  const [i, setI] = useState(0);
  useEffect(() => { if (reduced()) return; const t = setInterval(() => setI((n) => (n + 1) % CYCLE.length), 1800); return () => clearInterval(t); }, []);
  const s = CYCLE[i];
  return (
    <Tile img={imgHalo} alt="Close-up of the rim: a mint light guide set into the top of the satin carbon rim beside the tan grip." title="Halo"
      text="One light carries state, and it always matches the badge on screen and the strip on the vehicle.">
      <span className={`dt-halo${s === "transitioning" ? " pulse" : ""}`} style={{ "--halo": HALO[s] } as CSSProperties} aria-hidden="true" />
      <ControlState state={s} vehicle="UNIT-14" />
    </Tile>
  );
}

function DetailPaddles() {
  const [t, setT] = useState(0);
  useEffect(() => { if (reduced()) return; let raf = 0; const t0 = performance.now(); const step = (n: number) => { setT((n - t0) / 1000); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, []);
  const ph = t % 4, thr = ph < 2 ? Math.sin((ph / 2) * Math.PI) * 0.8 : 0, brk = ph >= 2 ? Math.sin(((ph - 2) / 2) * Math.PI) : 0;
  return (
    <Tile img={imgPaddles} alt="The back of the Wheel: two brushed aluminium paddles behind the rim, brake on the left and throttle on the right." title="Paddles"
      text="Brake on the left, throttle on the right. The pedals on screen show your input dashed and the vehicle solid.">
      <div className="pedals dt-pedals">
        <Pedal which="brake" label="Brake" glyph="brake" enabled cmd={brk} actual={brk * 0.92} />
        <Pedal which="throttle" label="Throttle" glyph="throttle" enabled cmd={thr} actual={thr * 0.9} />
      </div>
    </Tile>
  );
}

const VIEWS = ["front", "right", "rear", "left"];
function DetailDpad() {
  const [i, setI] = useState(0);
  useEffect(() => { if (reduced()) return; const t = setInterval(() => setI((n) => (n + 1) % VIEWS.length), 2200); return () => clearInterval(t); }, []);
  return (
    <Tile img={imgDpad} alt="Close-up of the D-pad at the bottom of the left key column." title="D-pad"
      text="Left and right switch cameras, up and down move through alerts, so eyes stay on the road view.">
      <CameraSwitcher active={VIEWS[i]} onChange={(v) => setI(Math.max(0, VIEWS.indexOf(v)))} />
    </Tile>
  );
}

function DetailStick() {
  const [ack, setAck] = useState(false);
  useEffect(() => { if (!ack) return; const t = setTimeout(() => setAck(false), 2600); return () => clearTimeout(t); }, [ack]);
  return (
    <Tile img={imgStick} alt="Close-up of the Hall-effect thumbstick at the bottom of the right key column." title="Thumbstick"
      text="Look around the camera view; click to acknowledge the selected alert.">
      <div className="dt-alert"><AlertRow severity="warning" title="Blocked loading zone" detail="Harbor freight · waiting 8 s" vehicle="UNIT-14" time="now" acknowledged={ack} onAck={() => setAck(true)} /></div>
    </Tile>
  );
}
