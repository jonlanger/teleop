// On-screen driving input (steering wheel, pedals) and how it merges with the wheel, gamepad or keyboard.
// Brake always takes the larger of the two; on-screen steering overrides while it is being held.
import { useSyncExternalStore } from "react";
import { wheel } from "./wheel";

export const screenInput = {
  steer: 0, steerActive: false, throttle: 0, brake: 0,
  set(p: Partial<{ steer: number; steerActive: boolean; throttle: number; brake: number }>) { Object.assign(this, p); version++; subs.forEach((f) => f()); },
};
let version = 0;
const subs = new Set<() => void>();
export function useScreenInput() {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
  return screenInput;
}

export type InputSource = "screen" | "wheel" | "gamepad" | "keyboard" | "none";

/** What the console sends in each drive packet. */
export function mergedInput() {
  const w = wheel.state, s = screenInput;
  const screenOn = s.steerActive || s.throttle > 0 || s.brake > 0;
  const source: InputSource = screenOn ? "screen" : w.kind;
  return {
    steer: s.steerActive ? s.steer : w.steer,
    throttle: Math.max(w.throttle, s.throttle),
    brake: Math.max(w.brake, s.brake),
    source,
  };
}

export const SOURCE_LABEL: Record<InputSource, string> = { screen: "On-screen", wheel: "teleop Wheel", gamepad: "Gamepad", keyboard: "Keyboard", none: "No input" };
