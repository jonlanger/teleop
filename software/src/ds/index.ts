// Typed access to the teleop design system components (design-system/project/components).
import "./react-global";
import "@ds/components/bundle.js";
import "./tokens.css";
import "@ds/components/bundle.css";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import type { Control } from "@shared/controls";
import type { ControlStateName } from "@shared/types";

export interface ControlStateProps { state: ControlStateName; vehicle?: string; label?: string; size?: "md" | "lg"; className?: string }
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "ghost" | "stop"; glyph?: Control; size?: "md" | "lg"; children: ReactNode }
export interface HoldToConfirmProps { label?: string; doneLabel?: string; holdMs?: number; tone?: "amber" | "mint"; glyph?: Control; onConfirm?: () => void; disabled?: boolean; className?: string }
export interface ControlGlyphProps { control: Control; size?: number; showLabel?: boolean; className?: string }
export interface LinkMeterProps { latencyMs: number | null; quality?: "good" | "fair" | "poor" | "lost"; compact?: boolean; className?: string }
export interface AlertRowProps { severity: "critical" | "warning" | "info"; title: string; detail?: string; vehicle?: string; time?: string; acknowledged?: boolean; onAck?: () => void; className?: string }
export interface VehicleTileProps { id: string; route?: string; state: ControlStateName; speed?: number; latencyMs?: number | null; alert?: string; alertSeverity?: "warning" | "critical"; selected?: boolean; onSelect?: () => void; className?: string }
export interface CameraSwitcherProps { views?: { id: string; label: string }[]; active?: string; onChange?: (id: string) => void; className?: string }

type C<P> = (p: P & { key?: string | number }) => ReactElement;
const T = (window as unknown as { teleop: Record<string, unknown> }).teleop;

export const ControlState = T.ControlState as C<ControlStateProps>;
export const Button = T.Button as C<ButtonProps>;
export const HoldToConfirm = T.HoldToConfirm as C<HoldToConfirmProps>;
export const ControlGlyph = T.ControlGlyph as C<ControlGlyphProps>;
export const LinkMeter = T.LinkMeter as C<LinkMeterProps>;
export const AlertRow = T.AlertRow as C<AlertRowProps>;
export const VehicleTile = T.VehicleTile as C<VehicleTileProps>;
export const CameraSwitcher = T.CameraSwitcher as C<CameraSwitcherProps>;
export const Halo = T.Halo as C<{ size?: number }>;
