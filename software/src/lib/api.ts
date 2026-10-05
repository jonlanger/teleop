// REST helpers and a resource hook that refetches when the server says a record set changed.
import { useCallback, useEffect, useState } from "react";
import type { ResourceName } from "@shared/types";
import { live } from "./live";
import { session } from "./session";

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method, headers: { "content-type": "application/json", "x-teleop-user": session.get().userId ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useResource<T>(path: string | null, resources: ResourceName[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = resources.join(",");
  const reload = useCallback(() => {
    if (!path) return;
    api<T>("GET", path).then((d) => { setData(d); setError(null); }, (e: Error) => setError(e.message));
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => live.onInvalidate((r) => { if (key.split(",").includes(r)) reload(); }), [key, reload]);
  return { data, error, reload, setData };
}

/** Poll a path at an interval (for metrics and telemetry history). */
export function usePolled<T>(path: string | null, ms: number) {
  const r = useResource<T>(path);
  useEffect(() => { if (!path) return; const t = setInterval(r.reload, ms); return () => clearInterval(t); }, [path, ms, r.reload]);
  return r;
}
