// Report an issue from anywhere: the console, a failed command, an operator's Log mark, or the Support queue.
import { useEffect, useState } from "react";
import type { Ticket, TicketCategory, TicketType, User } from "@shared/types";
import { CATEGORY_LABEL } from "@shared/support";
import { Button } from "../ds";
import { api } from "../lib/api";
import { useVehicles } from "../lib/live";
import { Dialog, Field } from ".";

export interface TicketDraft { title?: string; body?: string; type?: TicketType; category?: TicketCategory; priority?: Ticket["priority"]; vehicleId?: string; links?: Ticket["links"] }
const TYPE_CATEGORY: Record<TicketType, TicketCategory> = { incident: "safety", vehicle: "vehicle_fault", software: "software", station: "station", rider: "service" };

export function TicketDialog(p: { open: boolean; draft?: TicketDraft; users: User[]; onClose: () => void; onCreated?: (t: Ticket) => void }) {
  const [d, setD] = useState<TicketDraft & { assignee?: string }>({});
  const [err, setErr] = useState<string | null>(null);
  const vehicles = useVehicles();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p.open) { setD({ type: "incident", priority: 3, ...p.draft }); setErr(null); } }, [p.open, p.draft]);
  const set = (patch: Partial<typeof d>) => setD({ ...d, ...patch });
  const submit = async () => {
    setBusy(true);
    try { const t = await api<Ticket>("POST", "/api/tickets", d); p.onCreated?.(t); p.onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={p.open} title="Report an issue" onClose={p.onClose}
      footer={<><Button variant="ghost" onClick={p.onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={submit}>Send to support</Button></>}>
      <Field label="Title"><input className="input" autoFocus value={d.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Pedestrian stepped out at Pier 3" /></Field>
      <div className="grid-3">
        <Field label="Category">
          <select className="select" value={d.category ?? TYPE_CATEGORY[d.type ?? "incident"]} onChange={(e) => {
            const category = e.target.value as TicketCategory;
            const type = (Object.keys(TYPE_CATEGORY) as TicketType[]).find((k) => TYPE_CATEGORY[k] === category) ?? "incident";
            set({ category, type });
          }}>
            {(["safety", "vehicle_fault", "software", "station", "service", "other"] as TicketCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="select" value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) as Ticket["priority"] })}>
            <option value={1}>P1 · Urgent</option><option value={2}>P2 · High</option><option value={3}>P3 · Normal</option><option value={4}>P4 · Low</option>
          </select>
        </Field>
        <Field label="Vehicle">
          <select className="select" value={d.vehicleId ?? ""} onChange={(e) => set({ vehicleId: e.target.value || undefined })}>
            <option value="">None</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Assignee">
        <select className="select" value={d.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value || undefined })}>
          <option value="">Unassigned</option>
          {p.users.filter((u) => u.role !== "operator").map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}
        </select>
      </Field>
      <Field label="What happened"><textarea className="textarea" value={d.body ?? ""} onChange={(e) => set({ body: e.target.value })} /></Field>
      {err && <div className="form-error">{err}</div>}
    </Dialog>
  );
}
