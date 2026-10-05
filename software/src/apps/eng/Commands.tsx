// Every command sent to the fleet, with where its time went: link, vehicle actuation, readback.
import { useMemo } from "react";
import type { CommandKind, CommandStatus, User } from "@shared/types";
import { COMMAND_LABEL } from "@shared/controls";
import { useCommands } from "../../lib/live";
import { setQuery, useQuery } from "../../lib/router";
import { nameOf } from "../../lib/format";
import { PageHead, Panel, Seg, Stat } from "../../ui";
import { CommandRow } from "../../ui/CommandRow";
import { VehiclePicker, useVehicleParam } from "./VehiclePicker";

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

export function Commands({ users }: { users: User[] }) {
  const all = useCommands();
  const vehicle = useVehicleParam(false);
  const q = useQuery();
  const filter = (q.get("status") ?? "all") as "all" | "problems";
  const list = all.filter((c) => (!vehicle || c.vehicleId === vehicle) && (filter === "all" || !["confirmed", "sent", "received"].includes(c.status)));
  const done = list.filter((c) => c.status === "confirmed" && c.doneAt && c.receivedAt);
  const counts = list.reduce((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {} as Partial<Record<CommandStatus, number>>);

  const byKind = useMemo(() => {
    const m = new Map<CommandKind, { n: number; ack: number[]; total: number[]; bad: number }>();
    for (const c of list) {
      const r = m.get(c.kind) ?? { n: 0, ack: [], total: [], bad: 0 };
      r.n++;
      if (c.receivedAt) r.ack.push(c.receivedAt - c.sentAt);
      if (c.status === "confirmed" && c.doneAt) r.total.push(c.doneAt - c.sentAt);
      if (c.status === "rejected" || c.status === "failed" || c.status === "timeout") r.bad++;
      m.set(c.kind, r);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [list]);

  return (
    <>
      <PageHead title="Command audit" sub="Received is when the vehicle acknowledged. Confirmed is when it reported the new state." actions={<VehiclePicker allowAll />} />
      <div className="stats">
        <Stat label="Commands" value={list.length} sub="This server session" />
        <Stat label="Confirmed" value={counts.confirmed ?? 0} />
        <Stat label="Refused or failed" value={(counts.rejected ?? 0) + (counts.failed ?? 0)} sub={`${counts.timeout ?? 0} timed out`} />
        <Stat label="Ack p50 / p95" value={`${pct(done.map((c) => c.receivedAt! - c.sentAt), 0.5) ?? "—"} / ${pct(done.map((c) => c.receivedAt! - c.sentAt), 0.95) ?? "—"}`} unit="ms" />
        <Stat label="Confirm p50 / p95" value={`${pct(done.map((c) => c.doneAt! - c.sentAt), 0.5) ?? "—"} / ${pct(done.map((c) => c.doneAt! - c.sentAt), 0.95) ?? "—"}`} unit="ms" />
      </div>
      <div className="split-eng">
        <Panel title="By command">
          <table className="t">
            <thead><tr><th>Command</th><th className="num">Sent</th><th className="num">Ack p95</th><th className="num">Confirm p95</th><th className="num">Not confirmed</th></tr></thead>
            <tbody>
              {byKind.map(([k, r]) => (
                <tr key={k}><td>{COMMAND_LABEL[k]}</td><td className="num">{r.n}</td><td className="num">{pct(r.ack, 0.95) ?? "—"}</td><td className="num">{pct(r.total, 0.95) ?? "—"}</td><td className="num">{r.bad || ""}</td></tr>
              ))}
              {byKind.length === 0 && <tr><td colSpan={5} className="muted">No commands yet. Drive a vehicle from Operate.</td></tr>}
            </tbody>
          </table>
        </Panel>
        <Panel title="Trail" actions={<Seg label="Filter" value={filter} onChange={(v) => setQuery({ status: v })} options={[{ value: "all", label: "All" }, { value: "problems", label: "Not confirmed" }]} />}>
          <ol className="cmdlist">
            {list.slice(0, 150).map((c) => <CommandRow key={c.id} c={{ ...c }} who={`${c.vehicleId} · ${nameOf(users, c.by)}`} />)}
          </ol>
        </Panel>
      </div>
    </>
  );
}
