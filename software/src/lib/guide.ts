// Remote guidance: brake and nudge the path while autonomy keeps the vehicle. Nothing here claims it.
// Inputs: the on-screen guide buttons, dragging across the camera, and the wheel/keyboard/on-screen
// wheel and brake pedal (which steer the nudge and brake when you are not driving).
import { useSyncExternalStore } from "react";
import { screenInput } from "./driveInput";
import { wheel } from "./wheel";

export const MAX_NUDGE = 3; // metres either side of autonomy's own path

export interface GuideState { brakeHold: number; nudgeHold: number; nudgeRamp: number; drag: number; dragging: boolean }
export const guideInput: GuideState & { set(p: Partial<GuideState>): void } = {
  brakeHold: 0,       // "Hold to brake" button
  nudgeHold: 0,       // -1 / 0 / +1 while a nudge button is held; ramps the offset
  nudgeRamp: 0,       // current ramped offset from the buttons, metres
  drag: 0,            // offset from dragging across the camera, metres
  dragging: false,
  set(p) { Object.assign(this, p); version++; subs.forEach((f) => f()); },
};
let version = 0;
const subs = new Set<() => void>();
export function useGuideInput() {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
  return guideInput;
}

/** Advance the button ramp (2 m/s toward the held side, back to centre on release) and merge every source. */
export function stepGuide(dt: number) {
  const g = guideInput;
  const target = g.nudgeHold * MAX_NUDGE;
  const step = 2 * dt;
  const ramp = g.nudgeRamp < target ? Math.min(target, g.nudgeRamp + step) : Math.max(target, g.nudgeRamp - step);
  if (ramp !== g.nudgeRamp) g.set({ nudgeRamp: ramp });
  const w = wheel.state, s = screenInput;
  const fromWheel = (s.steerActive ? s.steer : w.steer) * MAX_NUDGE;
  const offset = g.dragging ? g.drag : Math.abs(ramp) > 0.01 ? ramp : fromWheel;
  return {
    brake: Math.max(g.brakeHold, s.brake, w.brake),
    offset: Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, offset)),
  };
}
