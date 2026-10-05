// How the teleop Wheel presents itself to the browser over USB-C.
//
// The wheel enumerates as a HID gamepad. This file is the contract the firmware must follow; the console reads it
// through the Gamepad API (inputs) and WebHID (halo and haptic output reports). A standard-mapping game controller
// (Xbox, DualSense) is accepted as a stand-in for development, using STANDARD_MAP below.
import type { Control } from "./controls";

export const WHEEL_USB = { vendorId: 0x2e8a /* placeholder until the USB-IF VID is issued */, productId: 0x7e10, product: "teleop Wheel" };

/** Axis and button indices in the wheel's HID report descriptor. */
export const WHEEL_MAP = {
  axes: { steer: 0, throttle: 1, brake: 2, stickX: 3, stickY: 4 },     // steer: -1..1 = ±450°; paddles: -1 released .. 1 full
  buttons: {
    claim: 0, release: 1, horn: 2, ptt: 3, log: 4, speaker: 5, hazard: 6, estop: 7, p1: 8, p2: 9, stick: 10,
    dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15, gripLeft: 16, gripRight: 17,
  },
} as const;

/** A standard-mapping gamepad stands in for the wheel during development. */
export const STANDARD_MAP = {
  axes: { steer: 0, stickX: 2, stickY: 3 },
  triggers: { throttle: 7, brake: 6 },                                  // RT / LT button values 0..1
  buttons: {
    claim: 0 /* A */, release: 1 /* B */, horn: 2 /* X */, ptt: 3 /* Y */, log: 8 /* View */, speaker: 9 /* Menu */,
    hazard: 4 /* LB */, estop: 5 /* RB */, p1: 10 /* L3 */, p2: -1, stick: 11 /* R3 */,
    dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15, gripLeft: -1, gripRight: -1,
  },
} as const;

export type WheelButton = keyof typeof WHEEL_MAP.buttons;

export const BUTTON_CONTROL: Partial<Record<WheelButton, Control>> = {
  claim: "claim", release: "release", horn: "horn", ptt: "ptt", log: "log", speaker: "speaker", hazard: "hazard",
  estop: "estop", p1: "p1", p2: "p2", stick: "stick", dpadUp: "dpad", dpadDown: "dpad", dpadLeft: "dpad", dpadRight: "dpad",
};

/** Output report 0x01: halo. [reportId, state, r, g, b, pulse(0/1)] */
export const HALO_REPORT_ID = 0x01;
/** Output report 0x02: haptics. [reportId, pattern, strength 0..255]; pattern 1 = single pulse, 2 = rising (link degrading) */
export const HAPTIC_REPORT_ID = 0x02;
/** P1 and P2 default to the turn signals, since the wheel has no stalk. */
export const PROGRAMMABLE_DEFAULTS = { p1: "Left turn signal", p2: "Right turn signal" } as const;
