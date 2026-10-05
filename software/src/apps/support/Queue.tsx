// The support queue: every open ticket, sorted by the deadline it faces next.
import { useState } from "react";
import type { Role, Ticket, TicketSource, User } from "@shared/types";
import { CATEGORY_LABEL, CHANNEL_LABEL, SOURCE_LABEL, dueText, sla } from "@shared/support";
import { Button } from "../../ds";
import { navigate, setQuery, useQuery } from "../../lib/router";
import { ago, nameOf } from "../../lib/format";
import { Empty, PageHead, Panel, Prio, Seg } from "../../ui";
import { TicketDialog } from "../../ui/TicketDialog";
import { ContactDialog } from "./ContactDialog";

export type ViewId = "inbox" | "respond" | "mine" | "unassigned" | "overdue" | "waiting_eng" | "waiting_fleet" | "reported" | "resolved";
export const VIEWS: { id: ViewId; label: string; roles?: Role[] }[] = [
  { id: "inbox", label: "All open" },
  { id: "respond", label: "Needs first reply" },
  { id: "overdue", label: "Overdue" },
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "waiting_eng", label: "Waiting on engineering" },
  { id: "waiting_fleet", label: "Waiting on fleet" },
  { id: "reported", label: "Reported by me" },
  { id: "resolved", label: "Resolved" },
];

export function inView(t: Ticket, v: ViewId, me: User, now: number) {
  const open = t.status !== "resolved";
  switch (v) {
    case "inbox": return open;
    case "respond": return open && t.source === "customer" && !t.firstResponseAt;
    case "overdue": return open && sla(t, now).overdue;
    case "mine": return open && t.assignee === me.id;
    case "unassigned": return open && !t.assignee;
    case "waiting_eng": return open && t.escalation?.team === "engineering" && !t.escalation.done;
    case "waiting_fleet": return open && t.escalation?.team === "fleet" && !t.escalation.done;
    case "reported": return t.reporter === me.id;
    case "resolved": return !open;
  }
}

const SOURCES: ("all" | TicketSource)[] = ["all", "customer", "operator", "engineering", "fleet", "support"];

export function Queue({ me, users, tickets, view }: { me: User; users: User[]; tickets: Ticket[]; view: ViewId; overdue: number }) {
  const q = useQuery();
  const source = (q.get("source") ?? "all") as "all" | TicketSource;
  const text = q.get("q") ?? "";
  const [contact, setContact] = useState(false);
  const [team, setTeam] = useState(false);
  const now = Date.now();
  const list = tickets
    .filter((t) => inView(t, view, me, now))
    .filter((t) => source === "all" || t.source === source || (source === "operator" && t.source === "system"))
    .filter((t) => !text || `${t.id} ${t.title} ${t.vehicleId ?? ""} ${t.requester?.name ?? ""} ${t.stop ?? ""}`.toLowerCase().includes(text.toLowerCase()))
    .sort((a, b) => (view === "resolved" ? (b.resolution?.at ?? b.updatedAt) - (a.resolution?.at ?? a.updatedAt) : sla(a, now).dueAt - sla(b, now).dueAt));
  const label = VIEWS.find((v) => v.id === view)?.label ?? "Tickets";
  const canWork = me.role !== "operator";

  return (
    <>
      <PageHead title={label} sub="Sorted by the next deadline: a first reply for riders, then resolution. Riders contact us through the app, by phone and by email."
        actions={<>
          {canWork && <Button onClick={() => setContact(true)}>Log a rider contact</Button>}
          <Button variant="primary" onClick={() => setTeam(true)}>Report an issue</Button>
        </>} />
      <div className="filters">
        <Seg label="Source" value={source} onChange={(v) => setQuery({ source: v === "all" ? null : v })}
          options={SOURCES.map((s) => ({ value: s, label: s === "all" ? "All sources" : SOURCE_LABEL[s] }))} />
        <input className="input sm" style={{ width: 260 }} placeholder="Search title, rider, vehicle or stop" value={text} onChange={(e) => setQuery({ q: e.target.value })} />
        <span className="muted" style={{ fontSize: 12 }}>{list.length} {list.length === 1 ? "ticket" : "tickets"}</span>
      </div>
      <Panel>
        {list.length === 0 ? <Empty>Nothing in {label.toLowerCase()}.</Empty> : (
          <div className="table-wrap">
            <table className="t queue">
              <thead><tr><th>Due</th><th>P</th><th>Ticket</th><th>From</th><th>Vehicle</th><th>Status</th><th>Owner</th><th className="num">Opened</th></tr></thead>
              <tbody>
                {list.map((t) => {
                  const st = sla(t, now);
                  return (
                    <tr key={t.id} className="click" onClick={() => navigate(`/support/tickets/${t.id}`)}>
                      <td><span className={`due${st.overdue ? " over" : ""}${st.kind === "met" ? " met" : ""}`}>{dueText(st, now)}</span></td>
                      <td><Prio p={t.priority} /></td>
                      <td>
                        <div style={{ fontWeight: 600 }}><span className="mono muted" style={{ fontSize: 12, marginRight: 8 }}>{t.id}</span>{t.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{CATEGORY_LABEL[t.category]} · {CHANNEL_LABEL[t.channel]}{t.escalation && !t.escalation.done ? ` · waiting on ${t.escalation.team}` : ""}</div>
                      </td>
                      <td><span className={`src src-${t.source}`}>{SOURCE_LABEL[t.source]}</span><div style={{ fontSize: 13, marginTop: 2 }}>{t.requester?.name ?? nameOf(users, t.reporter)}</div></td>
                      <td className="id">{t.vehicleId ?? ""}{t.stop && <div className="muted" style={{ fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 400 }}>{t.stop}</div>}</td>
                      <td><span className={`tag${t.status === "resolved" ? "" : " ink"}`}>{STATUS[t.status]}</span></td>
                      <td>{t.assignee ? nameOf(users, t.assignee) : <span className="muted">Unassigned</span>}</td>
                      <td className="num muted">{ago(t.createdAt, now)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <ContactDialog open={contact} users={users} onClose={() => setContact(false)} onCreated={(t) => navigate(`/support/tickets/${t.id}`)} />
      <TicketDialog open={team} users={users} onClose={() => setTeam(false)} onCreated={(t) => navigate(`/support/tickets/${t.id}`)} />
    </>
  );
}

export const STATUS: Record<Ticket["status"], string> = { open: "New", in_progress: "In progress", waiting: "Waiting", resolved: "Resolved" };
