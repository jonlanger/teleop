// teleop — operator console components. window.teleop.<Name>
export type ControlStateName = "autonomy" | "operator" | "transitioning" | "stopped";
export type Control = "estop" | "hazard" | "claim" | "release" | "horn" | "ptt" | "log" | "speaker"
  | "dpad" | "stick" | "p1" | "p2" | "throttle" | "brake";

export interface ControlStateProps { state: ControlStateName; vehicle?: string; label?: string; size?: "md" | "lg"; className?: string }
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "stop"; glyph?: Control; size?: "md" | "lg"; children: React.ReactNode }
export interface HoldToConfirmProps { label?: string; doneLabel?: string; holdMs?: number; tone?: "amber" | "mint";
  glyph?: Control; onConfirm?: () => void; disabled?: boolean; className?: string }
export interface ControlGlyphProps { control: Control; size?: number; showLabel?: boolean; className?: string }
export interface LinkMeterProps { latencyMs: number | null; quality?: "good" | "fair" | "poor" | "lost"; compact?: boolean; className?: string }
export interface AlertRowProps { severity: "critical" | "warning" | "info"; title: string; detail?: string; vehicle?: string;
  time?: string; acknowledged?: boolean; onAck?: () => void; className?: string }
export interface VehicleTileProps { id: string; route?: string; state: ControlStateName; speed?: number; latencyMs?: number | null;
  alert?: string; alertSeverity?: "warning" | "critical"; selected?: boolean; onSelect?: () => void; className?: string }
export interface CameraSwitcherProps { views?: { id: string; label: string }[]; active?: string; onChange?: (id: string) => void; className?: string }

export declare function ControlState(p: ControlStateProps): JSX.Element;
export declare function Button(p: ButtonProps): JSX.Element;
export declare function HoldToConfirm(p: HoldToConfirmProps): JSX.Element;
export declare function ControlGlyph(p: ControlGlyphProps): JSX.Element;
export declare function LinkMeter(p: LinkMeterProps): JSX.Element;
export declare function AlertRow(p: AlertRowProps): JSX.Element;
export declare function VehicleTile(p: VehicleTileProps): JSX.Element;
export declare function CameraSwitcher(p: CameraSwitcherProps): JSX.Element;

// Scene objects (components/SceneObjects/scene-kit.js): window.teleop.createSceneKit(THREE)
export type SceneKind = "car" | "bus" | "truck" | "shuttle" | "pedestrian" | "cyclist" | "cone" | "barrier" | "tree" | "streetLight" | "stopShelter";
export type SceneColorKey = "paint" | "shirt" | "pants" | "skin" | "halo" | "hazard";
export interface SceneKit {
  palette: Record<string, any>;
  /** [length (X), width (Z), height (Y)] in metres */
  dims: Record<SceneKind, [number, number, number]>;
  templates: Record<SceneKind, () => any /* THREE.Group facing +X, origin on the ground */>;
  pose: { pedestrian(g: any, phase: number): void; cyclist(g: any, crank: number): void };
  facadeMaterial(): any /* THREE.MeshStandardMaterial */;
  materials: Record<string, any>;
}
export declare function createSceneKit(THREE: any): SceneKit;
