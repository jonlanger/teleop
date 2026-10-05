// Formatting in the design system's voice: numbers carry units, IDs and times are mono.
import type { User } from "@shared/types";

export const clock = (t: number, seconds = false) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false });

export const clockMs = (t: number) => {
  const d = new Date(t);
  return `${clock(t, true)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

export const day = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function duration(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export const nameOf = (users: User[] | null | undefined, id: string | null | undefined) =>
  (id && users?.find((u) => u.id === id)?.name) || (id ? id : "Unassigned");

export const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);
