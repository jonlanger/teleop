// Who is signed in, at which station, and in which theme. Kept per browser.
import { useSyncExternalStore } from "react";

export type SiteTheme = "system" | "light" | "dark";
/** `theme` is the console's; `siteTheme` is the public homepage's, which follows the system unless chosen. */
export interface Session { userId: string | null; station: string; theme: "dark" | "light"; siteTheme: SiteTheme; keyboardDrive: boolean; vehiclesOpen: boolean; alertsOpen: boolean }
const KEY = "teleop.session";
const DEFAULT: Session = { userId: null, station: "ST-01", theme: "dark", siteTheme: "system", keyboardDrive: true, vehiclesOpen: true, alertsOpen: true };

function read(): Session {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULT; }
}

let current = read();
const subs = new Set<() => void>();

export const session = {
  get: () => current,
  set(patch: Partial<Session>) {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode: session lasts the tab */ }
    document.documentElement.dataset.theme = current.theme;
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};

document.documentElement.dataset.theme = current.theme;

export function useSession() { return useSyncExternalStore(session.subscribe, session.get); }

const darkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
/** The operating system's light or dark preference, live. */
export function useSystemDark() {
  return useSyncExternalStore((f) => { darkQuery?.addEventListener("change", f); return () => darkQuery?.removeEventListener("change", f); }, () => darkQuery?.matches ?? true);
}
