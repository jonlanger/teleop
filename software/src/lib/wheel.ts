// Operator input: the teleop Wheel over USB (Gamepad API in, WebHID out), a standard gamepad as a stand-in,
// or the keyboard. Everything downstream sees one WheelInput and one set of named button events.
import { useSyncExternalStore } from "react";
import type { ControlStateName } from "@shared/types";
import { HALO_REPORT_ID, HAPTIC_REPORT_ID, STANDARD_MAP, WHEEL_MAP, WHEEL_USB, type WheelButton } from "@shared/wheel-hid";

export type InputKind = "wheel" | "gamepad" | "keyboard" | "none";
export interface WheelInput {
  kind: InputKind; name: string;
  steer: number; throttle: number; brake: number; stickX: number; stickY: number;
  buttons: WheelButton[]; grip: boolean | null;
  hidPaired: boolean;
}

const KEYMAP: Record<string, WheelButton> = {
  KeyC: "claim", KeyR: "release", KeyH: "horn", KeyT: "ptt", KeyL: "log", KeyK: "speaker", KeyZ: "hazard", Escape: "estop",
  Digit1: "p1", Digit2: "p2", Enter: "stick", PageUp: "dpadUp", PageDown: "dpadDown", BracketLeft: "dpadLeft", BracketRight: "dpadRight",
};
const DRIVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const HALO_RGB: Record<ControlStateName | "off", [number, number, number]> = {
  autonomy: [0x3c, 0xe6, 0xb4], operator: [0xff, 0xb0, 0x20], transitioning: [0xee, 0xf0, 0xee], stopped: [0xd0, 0x2b, 0x21], off: [0, 0, 0],
};

type Hid = { opened: boolean; sendReport(id: number, data: Uint8Array): Promise<void>; open(): Promise<void>; productName: string };

class WheelSource {
  state: WheelInput = { kind: "none", name: "No input", steer: 0, throttle: 0, brake: 0, stickX: 0, stickY: 0, buttons: [], grip: null, hidPaired: false };
  keyboardEnabled = true;
  private keys = new Set<string>();
  private kbSteer = 0; private kbThrottle = 0; private kbBrake = 0;
  private prev = new Set<WheelButton>();
  private subs = new Set<() => void>();
  private press = new Set<(b: WheelButton) => void>();
  private release = new Set<(b: WheelButton, heldMs: number) => void>();
  private downAt = new Map<WheelButton, number>();
  private last = performance.now();
  private hid: Hid | null = null;
  private halo: ControlStateName | "off" = "off";

  constructor() {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); };
    window.addEventListener("keydown", (e) => {
      if (!this.keyboardEnabled || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (DRIVE_KEYS.has(e.code) || KEYMAP[e.code]) {
        if (e.code === "Escape" && document.querySelector("dialog[open]")) return;
        if (DRIVE_KEYS.has(e.code)) e.preventDefault();
        this.keys.add(e.code);
        // Buttons fire on the key event itself, never on the next poll: a tapped Esc must always stop.
        const b = KEYMAP[e.code];
        if (b && !e.repeat && this.state.kind !== "wheel" && this.state.kind !== "gamepad" && !this.prev.has(b)) {
          this.prev.add(b); this.downAt.set(b, performance.now()); this.press.forEach((f) => f(b));
        }
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      const b = KEYMAP[e.code];
      if (b && this.prev.has(b) && this.state.kind !== "wheel" && this.state.kind !== "gamepad") {
        this.prev.delete(b); const held = performance.now() - (this.downAt.get(b) ?? performance.now()); this.release.forEach((f) => f(b, held));
      }
    });
    window.addEventListener("blur", () => this.keys.clear());
    // A timer, not requestAnimationFrame: rAF stalls in hidden or throttled views, input must not.
    setInterval(() => this.poll(), 16);
  }

  private poll() {
    const t = performance.now(), dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && /teleop/i.test(p.id)) ?? [...pads].find((p) => p && p.mapping === "standard") ?? null;
    const buttons = new Set<WheelButton>();
    let next: WheelInput;

    if (pad && /teleop/i.test(pad.id)) {
      const A = WHEEL_MAP.axes, B = WHEEL_MAP.buttons;
      for (const [name, i] of Object.entries(B)) if (pad.buttons[i]?.pressed) buttons.add(name as WheelButton);
      const paddle = (v: number | undefined) => Math.max(0, ((v ?? -1) + 1) / 2);
      next = { kind: "wheel", name: "teleop Wheel", steer: pad.axes[A.steer] ?? 0, throttle: paddle(pad.axes[A.throttle]), brake: paddle(pad.axes[A.brake]),
        stickX: pad.axes[A.stickX] ?? 0, stickY: pad.axes[A.stickY] ?? 0, buttons: [], grip: buttons.has("gripLeft") || buttons.has("gripRight"), hidPaired: !!this.hid };
    } else if (pad) {
      const S = STANDARD_MAP;
      for (const [name, i] of Object.entries(S.buttons)) if (i >= 0 && pad.buttons[i]?.pressed) buttons.add(name as WheelButton);
      const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : v);
      next = { kind: "gamepad", name: pad.id.replace(/\(.*?\)/g, "").trim().slice(0, 40) || "Gamepad", steer: dz(pad.axes[S.axes.steer] ?? 0),
        throttle: pad.buttons[S.triggers.throttle]?.value ?? 0, brake: pad.buttons[S.triggers.brake]?.value ?? 0,
        stickX: dz(pad.axes[S.axes.stickX] ?? 0), stickY: dz(pad.axes[S.axes.stickY] ?? 0), buttons: [], grip: null, hidPaired: !!this.hid };
    } else if (this.keyboardEnabled) {
      const k = this.keys;
      const left = k.has("KeyA") || k.has("ArrowLeft"), right = k.has("KeyD") || k.has("ArrowRight");
      const target = left === right ? 0 : left ? -1 : 1;
      this.kbSteer = target === 0 ? approach(this.kbSteer, 0, 2.6 * dt) : approach(this.kbSteer, target, 1.4 * dt);
      this.kbThrottle = approach(this.kbThrottle, k.has("KeyW") || k.has("ArrowUp") ? 0.7 : 0, 2.2 * dt);
      this.kbBrake = approach(this.kbBrake, k.has("KeyS") || k.has("ArrowDown") ? 1 : 0, 4 * dt);
      for (const [code, b] of Object.entries(KEYMAP)) if (k.has(code)) buttons.add(b);
      next = { kind: "keyboard", name: "Keyboard", steer: this.kbSteer, throttle: this.kbThrottle, brake: this.kbBrake, stickX: 0, stickY: 0, buttons: [], grip: null, hidPaired: !!this.hid };
    } else {
      next = { ...this.state, kind: "none", name: "No input", steer: 0, throttle: 0, brake: 0, buttons: [] };
    }
    next.buttons = [...buttons];

    for (const b of buttons) if (!this.prev.has(b)) { this.downAt.set(b, t); this.press.forEach((f) => f(b)); }
    for (const b of this.prev) if (!buttons.has(b)) { const held = t - (this.downAt.get(b) ?? t); this.release.forEach((f) => f(b, held)); }
    this.prev = buttons;

    const s = this.state;
    const changed = s.kind !== next.kind || Math.abs(s.steer - next.steer) > 0.002 || Math.abs(s.throttle - next.throttle) > 0.002 || Math.abs(s.brake - next.brake) > 0.002
      || s.buttons.join() !== next.buttons.join() || Math.abs(s.stickX - next.stickX) > 0.01 || s.grip !== next.grip || s.hidPaired !== next.hidPaired;
    if (changed) { this.state = next; this.subs.forEach((f) => f()); }
  }

  /** How long a button has been held, for hardware hold-to-release. */
  heldMs(b: WheelButton) { const d = this.downAt.get(b); return d != null && this.prev.has(b) ? performance.now() - d : 0; }

  onPress(f: (b: WheelButton) => void) { this.press.add(f); return () => { this.press.delete(f); }; }
  onRelease(f: (b: WheelButton, heldMs: number) => void) { this.release.add(f); return () => { this.release.delete(f); }; }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }

  /** Pair the wheel over WebHID so the console can drive its halo and haptics. Needs a user gesture. */
  async pair() {
    const hid = (navigator as unknown as { hid?: { requestDevice(o: unknown): Promise<Hid[]> } }).hid;
    if (!hid) throw new Error("This browser has no WebHID. Use Chrome or Edge to pair the wheel.");
    const [dev] = await hid.requestDevice({ filters: [{ vendorId: WHEEL_USB.vendorId, productId: WHEEL_USB.productId }] });
    if (!dev) return false;
    if (!dev.opened) await dev.open();
    this.hid = dev;
    await this.setHalo(this.halo, true);
    this.subs.forEach((f) => f());
    return true;
  }

  /** Keep the wheel's halo in step with ControlState. */
  async setHalo(state: ControlStateName | "off", force = false) {
    if (state === this.halo && !force) return;
    this.halo = state;
    if (!this.hid) return;
    const [r, g, b] = HALO_RGB[state];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    await this.hid.sendReport(HALO_REPORT_ID, new Uint8Array([["off", "autonomy", "operator", "transitioning", "stopped"].indexOf(state), r, g, b, state === "transitioning" && !reduced ? 1 : 0])).catch(() => {});
  }

  /** One grip pulse for a new warning or critical alert. */
  pulse(pattern: 1 | 2 = 1) {
    if (this.hid) { this.hid.sendReport(HAPTIC_REPORT_ID, new Uint8Array([pattern, 200])).catch(() => {}); return; }
    const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean) as (Gamepad & { vibrationActuator?: { playEffect(t: string, p: object): Promise<unknown> } }) | undefined;
    pad?.vibrationActuator?.playEffect("dual-rumble", { duration: pattern === 1 ? 120 : 400, strongMagnitude: 0.8, weakMagnitude: 0.4 }).catch(() => {});
  }
}

const approach = (v: number, t: number, step: number) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));

export const wheel = new WheelSource();
export function useWheel() { return useSyncExternalStore((f) => wheel.subscribe(f), () => wheel.state); }
