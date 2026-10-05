// One ticket, and everything support needs to resolve it: the playbook, the conversation with the requester,
// what the vehicle was doing at the time, escalation to engineering or fleet, and a recorded resolution.
import { useEffect, useRef, useState } from "react";
import type { Command, LogEntry, Ticket, TicketCategory, TicketStatus, User, VehicleState, WorkOrder } from "@shared/types";
import { COMMAND_LABEL, ROLE_LABEL, kmh } from "@shared/controls";
import { CATEGORY_LABEL, CHANNEL_LABEL, MACROS, PLAYBOOKS, RESOLUTION_CODES, SOURCE_LABEL, dueText, fillMacro, sla, type Step } from "@shared/support";
import { ROUTES } from "@shared/site";
import { Button, ControlState } from "../../ds";
import { api, useResource } from "../../lib/api";
import { useVehicle, useVehicles } from "../../lib/live";
import { Link } from "../../lib/router";
import { ago, clock, clockMs, day, nameOf } from "../../lib/format";
import { Avatar, Empty, Field, Health, Panel, Prio, Seg } from "../../ui";
import { STATUS } from "./Queue";

interface Context { vehicle: VehicleState | null; events: LogEntry[]; commands: Command[]; related: Ticket[]; workorders: WorkOrder[]; window: { from: number; to: number } }
const STOPS = [...new Set(ROUTES.flatMap((r) => r.stops.map((s) => s.name)))].sort();

export function Workspace({ id, me, users, tickets }: { id: string; me: User; users: User[]; tickets: Ticket[] }) {
  const t = tickets.find((x) => x.id === id);
  const ctx = useResource<Context>(`/api/tickets/${id}/context`, ["tickets", "workorders"]);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [esc, setEsc] = useState<{ team: "engineering" | "fleet"; note: string; wo: boolean; component: string; oos: boolean } | null>(null);
  const [res, setRes] = useState({ code: "", summary: "", duplicateOf: "" });
  const [backNote, setBackNote] = useState("");
  const [fromStep, setFromStep] = useState<Step | null>(null);   // the playbook step that opened the composer or escalation
  const composer = useRef<HTMLTextAreaElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const resolveRef = useRef<HTMLDivElement>(null);
  const escRef = useRef<HTMLDivElement>(null);
  const canWork = me.role !== "operator";
  const vehicles = useVehicles();
  useEffect(() => { setKind(canWork ? "reply" : "note"); setText(""); setEsc(null); setErr(null); setRes({ code: "", summary: "", duplicateOf: "" }); }, [id, canWork]);

  if (!t) return <Empty>No ticket {id}. <Link href="/support">Back to the queue</Link></Empty>;
  const run = (p: Promise<unknown>, after?: () => void) => p.then(() => { setErr(null); after?.(); }, (e: Error) => setErr(e.message));
  const patch = (body: Partial<Ticket>) => run(api("PATCH", `/api/tickets/${t.id}`, body));
  const st = sla(t);
  const replyTo = t.requester?.name ?? nameOf(users, t.reporter);
  const steps = PLAYBOOKS[t.category] ?? PLAYBOOKS.other;
  const scroll = (r: React.RefObject<HTMLElement>) => r.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const doStep = (s: Step) => {
    setFromStep(s);
    switch (s.action) {
      case "context": scroll(timeline); if (!t.playbook?.[s.id]) toggleStep(s, true); break;
      case "reply": { setKind("reply"); const m = MACROS.find((x) => x.id === s.macro); if (m) setText(fillMacro(m.text, t)); setTimeout(() => { composer.current?.focus(); scroll(composer); }, 0); break; }
      case "escalate_engineering": case "escalate_fleet": {
        const team = s.action === "escalate_fleet" ? "fleet" : "engineering";
        setEsc({ team, note: s.text, wo: team === "engineering" && !!t.vehicleId, component: team === "engineering" ? CATEGORY_LABEL[t.category] : "", oos: false });
        setTimeout(() => scroll(escRef), 0); break;
      }
      case "resolve": scroll(resolveRef); break;
    }
  };
  const toggleStep = (s: Step, done: boolean) => run(api("POST", `/api/tickets/${t.id}/steps`, { step: s.id, done, text: s.text }));
  /** A step is done when its action actually happened: the reply went out, the escalation was sent. */
  const finishStep = (kindDone: "reply" | "escalate") => {
    if (fromStep && !t.playbook?.[fromStep.id] && (kindDone === "reply" ? fromStep.action === "reply" : fromStep.action?.startsWith("escalate"))) toggleStep(fromStep, true);
    setFromStep(null);
  };
  const resolved = t.status === "resolved";

  return (
    <div className="ws">
      <div className="ws-main">
        <div className="ws-head">
          <div className="row wrap" style={{ gap: 8 }}>
            <Link href="/support" className="muted">Queue</Link><span className="muted">/</span>
            <span className="mono" style={{ fontWeight: 700 }}>{t.id}</span><Prio p={t.priority} />
            <span className={`src src-${t.source}`}>{SOURCE_LABEL[t.source]}</span>
            <span className="tag">{CATEGORY_LABEL[t.category]}</span><span className="tag">{CHANNEL_LABEL[t.channel]}</span>
            <span className={`tag${t.status === "resolved" ? "" : " ink"}`}>{STATUS[t.status]}</span>
          </div>
          <h1 className="ws-title">{t.title}</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            {t.requester ? <>From <b className="ink-text">{t.requester.name}</b> · {t.requester.contact}{t.requester.rides ? ` · ${t.requester.rides} rides` : ""} · logged by {nameOf(users, t.reporter)}</>
              : <>Reported by <b className="ink-text">{nameOf(users, t.reporter)}</b> · {ROLE_LABEL[users.find((u) => u.id === t.reporter)?.role ?? "support"]}</>}
            {" · "}{day(t.createdAt)} {clock(t.createdAt)}
          </div>
          <div className={`sla-strip${st.overdue ? " over" : ""}`}>
            <span><span className="label">Next deadline</span> <b>{dueText(st)}</b></span>
            <span><span className="label">First reply</span> {t.firstResponseAt ? `${Math.round((t.firstResponseAt - t.createdAt) / 60e3)} min after opening` : t.source === "customer" ? "Not yet" : "Not needed"}</span>
            {t.escalation && <span><span className="label">Waiting on</span> {t.escalation.done ? `${t.escalation.team}, handed back ${ago(t.escalation.done)}` : `${t.escalation.team} for ${ago(t.escalation.at).replace(" ago", "")}`}</span>}
          </div>
        </div>

        {t.body && <Panel tight><p className="ws-body">{t.body}</p></Panel>}

        <Panel title={`How to resolve: ${CATEGORY_LABEL[t.category]}`} tight>
          <ol className="steps-list">
            {steps.map((s, i) => {
              const done = t.playbook?.[s.id];
              return (
                <li key={s.id} className={done ? "done" : ""}>
                  <label className="row" style={{ alignItems: "flex-start" }}>
                    <input type="checkbox" checked={!!done} disabled={!canWork} onChange={(e) => toggleStep(s, e.target.checked)} />
                    <span><span className="mono muted">{i + 1}.</span> {s.text}{done && <span className="muted" style={{ fontSize: 12 }}> · done {ago(done)}</span>}</span>
                  </label>
                  {s.action && canWork && !done && !resolved && (s.action === "diagnostics"
                    ? <Link href={t.category === "station" ? "/eng/stations" : `/eng/diagnostics?v=${t.vehicleId ?? ""}`}>Open diagnostics</Link>
                    : <button className="linkbtn" onClick={() => doStep(s)}>{ACTION_LABEL[s.action]}</button>)}
                </li>
              );
            })}
          </ol>
        </Panel>

        <Panel title="Conversation" tight>
          <ol className="convo">
            {t.activity.map((a, i) => <ActivityItem key={i} a={a} users={users} replyTo={replyTo} channel={t.channel} />)}
          </ol>
          <div className="composer">
            <div className="spread">
              <Seg label="Message type" value={kind} onChange={(k) => setKind(k)} options={[
                ...(canWork ? [{ value: "reply" as const, label: `Reply to ${replyTo.split(" ")[0]}` }] : []),
                { value: "note" as const, label: "Internal note" },
              ]} />
              {kind === "reply" && (
                <select className="select sm" style={{ width: 210 }} value="" onChange={(e) => { const m = MACROS.find((x) => x.id === e.target.value); if (m) setText(fillMacro(m.text, t)); }} aria-label="Canned reply">
                  <option value="">Canned replies</option>{MACROS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              )}
            </div>
            <textarea ref={composer} className={`textarea${kind === "note" ? " note" : ""}`} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={kind === "reply" ? `Goes to ${replyTo} by ${t.source === "customer" ? CHANNEL_LABEL[t.channel === "phone" ? "email" : t.channel].toLowerCase() : "the console"}` : "Only the team sees notes"} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Button disabled={!text.trim()} onClick={() => run(api("POST", `/api/tickets/${t.id}/messages`, { kind, text }), () => { setText(""); if (kind === "reply") finishStep("reply"); })}>{kind === "reply" ? "Send reply" : "Add note"}</Button>
            </div>
          </div>
        </Panel>

        {canWork && (
          <div ref={resolveRef}>
            <Panel title={t.status === "resolved" ? "Resolution" : "Resolve"} tight>
              {t.status === "resolved" ? (
                <div className="spread">
                  <div>
                    <div className="heading">{RESOLUTION_CODES.find((r) => r.id === t.resolution?.code)?.label ?? "Resolved"}{t.duplicateOf && <> of <Link href={`/support/tickets/${t.duplicateOf}`}>{t.duplicateOf}</Link></>}</div>
                    <div className="muted">{t.resolution?.summary ?? "No summary recorded."}{t.resolution && ` · ${nameOf(users, t.resolution.by)}, ${ago(t.resolution.at)}`}</div>
                  </div>
                  <Button variant="ghost" onClick={() => patch({ status: "in_progress" })}>Reopen</Button>
                </div>
              ) : (
                <div className="resolve-form">
                  <Field label="Outcome">
                    <select className="select" value={res.code} onChange={(e) => setRes({ ...res, code: e.target.value })}>
                      <option value="">Choose</option>{RESOLUTION_CODES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </Field>
                  {res.code === "duplicate" && <Field label="Duplicate of"><input className="input" value={res.duplicateOf} onChange={(e) => setRes({ ...res, duplicateOf: e.target.value.toUpperCase() })} placeholder="TCK-1041" /></Field>}
                  <Field label="Summary"><input className="input" value={res.summary} onChange={(e) => setRes({ ...res, summary: e.target.value })} placeholder="What was done, in one line" /></Field>
                  <Button variant="primary" onClick={() => run(api("POST", `/api/tickets/${t.id}/resolve`, res))}>Resolve ticket</Button>
                </div>
              )}
            </Panel>
          </div>
        )}
        {err && <div className="form-error">{err}</div>}
      </div>

      <aside className="ws-side">
        <Panel title="Details" tight>
          <div className="props">
            <Field label="Status">
              <select className="select sm" disabled={!canWork || t.status === "resolved"} value={t.status} onChange={(e) => patch({ status: e.target.value as TicketStatus })}>
                {(["open", "in_progress", "waiting"] as TicketStatus[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
                {t.status === "resolved" && <option value="resolved">Resolved</option>}
              </select>
            </Field>
            <Field label="Priority">
              <select className="select sm" disabled={!canWork} value={t.priority} onChange={(e) => patch({ priority: Number(e.target.value) as Ticket["priority"] })}>
                {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <div className="row">
                <select className="select sm grow" disabled={!canWork} value={t.assignee ?? ""} onChange={(e) => patch({ assignee: e.target.value || undefined } as Partial<Ticket>)}>
                  <option value="">Unassigned</option>{users.filter((u) => u.role !== "operator").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                {canWork && t.assignee !== me.id && <Button variant="ghost" onClick={() => patch({ assignee: me.id })}>Take it</Button>}
              </div>
            </Field>
            <Field label="Category">
              <select className="select sm" disabled={!canWork} value={t.category} onChange={(e) => patch({ category: e.target.value as TicketCategory })}>
                {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Vehicle">
              <select className="select sm" disabled={!canWork} value={t.vehicleId ?? ""} onChange={(e) => patch({ vehicleId: e.target.value || undefined } as Partial<Ticket>)}>
                <option value="">None</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
              </select>
            </Field>
            <Field label="Stop">
              <select className="select sm" disabled={!canWork} value={t.stop ?? ""} onChange={(e) => patch({ stop: e.target.value || undefined } as Partial<Ticket>)}>
                <option value="">None</option>{STOPS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </Panel>

        <div ref={escRef}>
          <Panel title="Other teams" tight>
            {t.escalation && !t.escalation.done ? (
              <div className="stack">
                <div><b>Waiting on {t.escalation.team}</b> <span className="muted">since {ago(t.escalation.at)}, sent by {nameOf(users, t.escalation.by)}</span></div>
                <div className="muted">{t.escalation.note}</div>
                {t.escalation.workOrderId && <div>Work order <Link href={`/eng/maintenance?v=${t.vehicleId}`} className="mono">{t.escalation.workOrderId}</Link> · it hands back automatically when marked done</div>}
                {canWork && <>
                  <input className="input sm" placeholder={`What ${t.escalation.team} did (optional)`} value={backNote} onChange={(e) => setBackNote(e.target.value)} />
                  <Button onClick={() => run(api("POST", `/api/tickets/${t.id}/escalation/done`, { note: backNote }), () => setBackNote(""))}>Hand back to support</Button>
                </>}
              </div>
            ) : esc ? (
              <div className="stack">
                <Seg label="Team" value={esc.team} onChange={(team) => setEsc({ ...esc, team, wo: team === "engineering" && !!t.vehicleId })} options={[{ value: "engineering", label: "Engineering" }, { value: "fleet", label: "Fleet" }]} />
                <textarea className="textarea" value={esc.note} onChange={(e) => setEsc({ ...esc, note: e.target.value })} placeholder="What you need from them" />
                {esc.team === "engineering" && t.vehicleId && <>
                  <label className="row"><input type="checkbox" checked={esc.wo} onChange={(e) => setEsc({ ...esc, wo: e.target.checked })} /> Open a work order on {t.vehicleId}</label>
                  {esc.wo && <>
                    <input className="input sm" value={esc.component} onChange={(e) => setEsc({ ...esc, component: e.target.value })} placeholder="Component, e.g. Ramp actuator" />
                    <label className="row"><input type="checkbox" checked={esc.oos} onChange={(e) => setEsc({ ...esc, oos: e.target.checked })} /> Needs the vehicle out of service</label>
                  </>}
                </>}
                <div className="row">
                  <Button onClick={() => run(api("POST", `/api/tickets/${t.id}/escalate`, { team: esc.team, note: esc.note, workOrder: esc.wo ? { component: esc.component, takesOutOfService: esc.oos } : undefined }), () => { setEsc(null); finishStep("escalate"); })}>Send to {esc.team}</Button>
                  <Button variant="ghost" onClick={() => setEsc(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="stack">
                {t.escalation?.done && <div className="muted">{t.escalation.team === "fleet" ? "Fleet" : "Engineering"} handed this back {ago(t.escalation.done)}.</div>}
                {resolved ? <span className="muted">Resolved. Reopen the ticket to involve another team.</span> : canWork ? <div className="row wrap">
                  <Button onClick={() => setEsc({ team: "engineering", note: "", wo: !!t.vehicleId, component: "", oos: false })}>Send to engineering</Button>
                  <Button onClick={() => setEsc({ team: "fleet", note: "", wo: false, component: "", oos: false })}>Ask fleet</Button>
                </div> : <span className="muted">Support routes this to other teams.</span>}
              </div>
            )}
          </Panel>
        </div>

        {t.vehicleId && <VehicleNow id={t.vehicleId} me={me} />}

        <div ref={timeline}>
          <Panel title="What the vehicle did" tight>
            {!t.vehicleId ? <span className="muted">Link a vehicle to see its events.</span>
              : !ctx.data ? <span className="muted">Loading</span>
              : <Timeline ctx={ctx.data} ticket={t} />}
          </Panel>
        </div>

        {ctx.data && (ctx.data.related.length > 0 || ctx.data.workorders.length > 0) && (
          <Panel title="Related" tight>
            <div className="stack">
              {ctx.data.related.map((r) => (
                <Link key={r.id} href={`/support/tickets/${r.id}`} className="rel">
                  <span className="mono">{r.id}</span> <span>{r.title}</span> <span className="muted">· {STATUS[r.status]}</span>
                </Link>
              ))}
              {ctx.data.workorders.map((w) => (
                <Link key={w.id} href={`/eng/maintenance?v=${w.vehicleId}`} className="rel"><span className="mono">{w.id}</span> <span>{w.component}</span> <span className="muted">· {w.status.replace("_", " ")}</span></Link>
              ))}
            </div>
          </Panel>
        )}
      </aside>
    </div>
  );
}

const ACTION_LABEL: Record<NonNullable<Step["action"]>, string> = {
  context: "Show the vehicle timeline", reply: "Draft the reply", escalate_engineering: "Send to engineering", escalate_fleet: "Ask fleet", diagnostics: "Open diagnostics", resolve: "Resolve",
};

function ActivityItem({ a, users, replyTo, channel }: { a: Ticket["activity"][number]; users: User[]; replyTo: string; channel: Ticket["channel"] }) {
  const who = nameOf(users, a.by);
  if (a.kind === "reply" || a.kind === "note" || a.kind === "comment") {
    return (
      <li className={`msg ${a.kind === "reply" ? "reply" : "note"}`}>
        <Avatar name={who} />
        <div className="grow">
          <div className="msg-head"><b>{who}</b> <span className="muted">{a.kind === "reply" ? `replied to ${replyTo}${channel !== "console" && channel !== "auto" ? ` by ${CHANNEL_LABEL[channel === "phone" ? "email" : channel].toLowerCase()}` : ""}` : "internal note"} · {ago(a.at)}</span></div>
          <div className="msg-body">{a.text}</div>
        </div>
      </li>
    );
  }
  return <li className="evt"><span className="muted">{a.kind === "created" ? `${who} opened this` : `${who}: ${a.text}`} · {ago(a.at)}</span></li>;
}

function VehicleNow({ id, me }: { id: string; me: User }) {
  const v = useVehicle(id);
  if (!v) return null;
  const eng = me.role !== "operator";
  return (
    <Panel title={`${v.id} now`} tight>
      <div className="stack">
        <div className="row wrap"><ControlState state={v.control} />{v.service === "out_of_service" && <span className="tag">Out of service</span>}</div>
        <div className="muted" style={{ fontSize: 13 }}>{v.routeName} · {kmh(v.speed)} km/h · {v.stop ? `at ${v.stop.name}` : v.assist ? v.assist.title : "on route"} · {v.comms.passengers} riders</div>
        {v.faults.map((f) => <div key={f.code} className="row"><Health h={f.severity === "critical" ? "fault" : "degraded"} label={`${f.code} ${f.text}`} /></div>)}
        <div className="row wrap" style={{ fontSize: 13 }}>
          {(me.role === "operator" || me.role === "manager") && <Link href={`/operate?v=${v.id}`}>Console</Link>}
          {eng && me.role !== "operator" && <><Link href={`/eng/telemetry?v=${v.id}`}>Telemetry</Link><Link href={`/eng/logs?v=${v.id}`}>Logs</Link><Link href={`/eng/commands?v=${v.id}`}>Commands</Link></>}
        </div>
      </div>
    </Panel>
  );
}

function Timeline({ ctx, ticket }: { ctx: Context; ticket: Ticket }) {
  const rows = [
    ...ctx.events.map((e) => ({ t: e.t, text: e.msg, level: e.level })),
    ...ctx.commands.map((c) => ({ t: c.sentAt, text: `${COMMAND_LABEL[c.kind]} · ${c.status}${c.readback ? `: ${c.readback}` : c.reason ? `: ${c.reason}` : ""}`, level: c.status === "confirmed" ? "info" : "warn" })),
    { t: ticket.createdAt, text: "Ticket opened", level: "mark" },
  ].sort((a, b) => a.t - b.t);
  if (rows.length === 1) return <span className="muted">No vehicle events from 20 minutes before this ticket to 5 after. Events are kept for the current server session only, so older tickets have none.</span>;
  return (
    <ol className="vtl">
      {rows.map((r, i) => <li key={i} className={`vtl-${r.level}`}><span className="data muted">{clockMs(r.t).slice(0, 8)}</span><span>{r.text}</span></li>)}
    </ol>
  );
}
