// A small path router: enough for three apps and their pages.
import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const subs = new Set<() => void>();
window.addEventListener("popstate", () => subs.forEach((f) => f()));

/** Asked before leaving the current page; return a message to confirm, or null to leave freely. */
let leaveGuard: ((to: string) => string | null) | null = null;
export function setLeaveGuard(fn: typeof leaveGuard) { leaveGuard = fn; }

export function navigate(path: string, replace = false) {
  if (path === location.pathname + location.search) return;
  const msg = leaveGuard?.(path);
  if (msg && !window.confirm(msg)) return;
  history[replace ? "replaceState" : "pushState"](null, "", path);
  subs.forEach((f) => f());
}

export function usePath() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => location.pathname);
}

export function useQuery() {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => location.search);
  return new URLSearchParams(location.search);
}

export function setQuery(patch: Record<string, string | null>) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) (v == null || v === "") ? q.delete(k) : q.set(k, v);
  const s = q.toString();
  navigate(location.pathname + (s ? `?${s}` : ""), true);
}

/** Match "/support/tickets/:id" against a path. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
  const m = path.match(re);
  return m ? Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) : null;
}

export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return createElement("a", {
    ...props,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      props.onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); navigate(props.href);
    },
  });
}
