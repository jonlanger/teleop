// One name per control, everywhere: hardware legend, ControlGlyph, UI copy and logs.
import type { CommandKind, ControlStateName } from "./types";

export type Control = "estop" | "hazard" | "claim" | "release" | "horn" | "ptt" | "log" | "speaker"
  | "dpad" | "stick" | "p1" | "p2" | "throttle" | "brake";

export const CONTROL_NAME: Record<Control, string> = {
  estop: "Emergency stop", hazard: "Hazard lights", claim: "Claim vehicle", release: "Release vehicle", horn: "Horn",
  ptt: "Talk", log: "Log", speaker: "External speaker", dpad: "D-pad", stick: "Thumbstick", p1: "P1", p2: "P2",
  throttle: "Throttle", brake: "Brake",
};

export const STATE_LABEL: Record<ControlStateName, string> = {
  autonomy: "Autonomy", operator: "Operator", transitioning: "Transitioning", stopped: "Stopped",
};

/** Human label for each command kind, in dispatcher voice. */
export const COMMAND_LABEL: Record<CommandKind, string> = {
  "control.claim": "Claim vehicle", "control.release": "Release vehicle",
  "estop.engage": "Emergency stop", "estop.reset": "Reset stop",
  "drive.gear": "Gear", "drive.parking_brake": "Parking brake", "drive.speed_cap": "Speed cap", "drive.speed_hold": "Speed hold",
  "body.hazards": "Hazard lights", "body.turn_signal": "Turn signal", "body.headlights": "Headlights",
  "body.wipers": "Wipers", "body.horn": "Horn", "body.doors_lock": "Door locks", "body.door": "Door",
  "body.cabin_lights": "Cabin lights", "comms.speaker": "External speaker", "comms.talk": "Talk",
  "assist.proceed": "Approve path", "mrm.pull_over": "Pull over", "log.mark": "Log",
  "perception.label": "Label", "perception.unlabel": "Remove label",
  "diag.run": "Run diagnostics", "sys.restart": "Restart subsystem", "fault.clear": "Clear fault",
};

/** Which commands need the issuing user to hold the vehicle. */
export const NEEDS_CONTROL: ReadonlySet<CommandKind> = new Set<CommandKind>([
  "control.release", "drive.gear", "drive.parking_brake", "drive.speed_cap", "drive.speed_hold",
  "body.turn_signal", "body.headlights", "body.wipers", "body.horn", "body.doors_lock", "body.door", "body.cabin_lights",
  "comms.speaker", "comms.talk", "estop.reset",
]);

/** Preset external-speaker announcements. Text is played by the vehicle's TTS. */
export const SPEAKER_PRESETS = [
  { id: "wait", text: "Please wait. This vehicle will move shortly." },
  { id: "clear", text: "Please step back from the vehicle." },
  { id: "thanks", text: "Thank you. Proceeding now." },
  { id: "help", text: "A remote operator is assisting this vehicle." },
];

export const STATE_COLOR_VAR: Record<ControlStateName | "off", string> = {
  autonomy: "var(--mint-fill)", operator: "var(--amber-fill)", transitioning: "var(--ink)", stopped: "var(--stop-fill)", off: "var(--line)",
};

export const ROLE_LABEL = { operator: "Operator", manager: "Fleet manager", engineer: "Vehicle engineer", support: "Support" } as const;

export const kmh = (ms: number) => Math.round(Math.abs(ms) * 3.6);
