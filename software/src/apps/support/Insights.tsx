// How the queue is doing: where tickets come from, what they're about, and how fast support answers.
import type { Ticket, TicketCategory, TicketSource, User } from "@shared/types";
import { CATEGORY_LABEL, RESOLUTION_CODES, SOURCE_LABEL, sla } from "@shared/support";
import { nameOf } from "../../lib/format";
import { PageHead, Panel, Stat } from "../../ui";

const D = 86400e3;
const median = (xs: number[]) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const fmtMin = (ms: number | null) => (ms == null ? "—" : ms < 3600e3 ? `${Math.round(ms / 60e3)}` : `${(ms / 3600e3).toFixed(1)}`);

export function Insights({ tickets, users }: { tickets: Ticket[]; users: User[] }) {
  const now = Date.now();
  const open = tickets.filter((t) => t.status !== "resolved");
  const recent = tickets.filter((t) => t.createdAt > now - 7 * D);
  const replies = tickets.filter((t) => t.source === "customer" && t.firstResponseAt).map((t) => t.firstResponseAt! - t.createdAt);
  const resolved7 = tickets.filter((t) => t.resolution && t.resolution.at > now - 7 * D);
  const resolveTimes = resolved7.map((t) => t.resolution!.at - t.createdAt);
  const firstMed = median(replies), resMed = median(resolveTimes);
  const by = <K extends string>(xs: Ticket[], key: (t: Ticket) => K) => xs.reduce((m, t) => ((m[key(t)] = (m[key(t)] ?? 0) + 1), m), {} as Record<K, number>);
  const bySource = by(open, (t) => t.source), byCat = by(recent, (t) => t.category), byCode = by(resolved7, (t) => t.resolution!.code);
  const owners = by(open.filter((t) => t.assignee), (t) => t.assignee!);

  return (
    <>
      <PageHead title="Insights" sub="Open work now, plus the last 7 days of tickets and resolutions." />
      <div className="stats">
        <Stat label="Open" value={open.length} sub={`${open.filter((t) => !t.assignee).length} unassigned`} />
        <Stat label="Overdue" value={open.filter((t) => sla(t, now).overdue).length} sub="Past a reply or resolution target" />
        <Stat label="Waiting on teams" value={open.filter((t) => t.escalation && !t.escalation.done).length} sub={`${open.filter((t) => t.escalation?.team === "engineering" && !t.escalation.done).length} engineering · ${open.filter((t) => t.escalation?.team === "fleet" && !t.escalation.done).length} fleet`} />
        <Stat label="First reply, median" value={fmtMin(firstMed)} unit={firstMed != null && firstMed >= 3600e3 ? "h" : "min"} sub="Rider tickets" />
        <Stat label="Time to resolve, median" value={fmtMin(resMed)} unit={resMed != null && resMed >= 3600e3 ? "h" : "min"} sub={`${resolved7.length} resolved in 7 days`} />
      </div>
      <div className="grid-2">
        <Panel title="Open by source" tight><Bars rows={(Object.keys(SOURCE_LABEL) as TicketSource[]).map((k) => [SOURCE_LABEL[k], bySource[k] ?? 0])} /></Panel>
        <Panel title="New in 7 days, by category" tight><Bars rows={(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((k) => [CATEGORY_LABEL[k], byCat[k] ?? 0] as [string, number]).filter(([, n]) => n > 0)} /></Panel>
        <Panel title="Resolved in 7 days, by outcome" tight><Bars rows={RESOLUTION_CODES.map((r) => [r.label, byCode[r.id] ?? 0] as [string, number]).filter(([, n]) => n > 0)} empty="Nothing resolved this week yet." /></Panel>
        <Panel title="Open by owner" tight><Bars rows={Object.entries(owners).map(([u, n]) => [nameOf(users, u), n] as [string, number]).sort((a, b) => b[1] - a[1])} empty="Nothing assigned." /></Panel>
      </div>
    </>
  );
}

/** A single-series bar list: label, bar, count. Counts are always printed, so the bar never carries the number alone. */
function Bars({ rows, empty }: { rows: [string, number][]; empty?: string }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <span className="muted">{empty ?? "No data."}</span>;
  return (
    <div className="bars" role="table">
      {rows.map(([label, n]) => (
        <div key={label} className="bar-row" role="row" title={`${label}: ${n}`}>
          <span role="cell">{label}</span>
          <span className="bar-track" role="cell"><span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="mono" role="cell">{n}</span>
        </div>
      ))}
    </div>
  );
}
