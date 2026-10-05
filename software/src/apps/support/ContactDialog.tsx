// Log a rider's call, email or app report as a customer ticket.
import { useEffect, useState } from "react";
import type { Ticket, TicketCategory, TicketChannel, User } from "@shared/types";
import { CATEGORY_LABEL, CHANNEL_LABEL } from "@shared/support";
import { ROUTES } from "@shared/site";
import { Button } from "../../ds";
import { api } from "../../lib/api";
import { useVehicles } from "../../lib/live";
import { Dialog, Field } from "../../ui";

interface Draft { name: string; contact: string; channel: TicketChannel; category: TicketCategory; priority: Ticket["priority"]; vehicleId: string; stop: string; title: string; body: string }
const EMPTY: Draft = { name: "", contact: "", channel: "phone", category: "service", priority: 3, vehicleId: "", stop: "", title: "", body: "" };
const STOPS = [...new Set(ROUTES.flatMap((r) => r.stops.map((s) => s.name)))].sort();

export function ContactDialog({ open, onClose, onCreated }: { open: boolean; users: User[]; onClose: () => void; onCreated?: (t: Ticket) => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const vehicles = useVehicles();
  useEffect(() => { if (open) { setD(EMPTY); setErr(null); } }, [open]);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const submit = () => {
    if (!d.name.trim()) return setErr("Add the rider's name");
    api<Ticket>("POST", "/api/tickets", { title: d.title, body: d.body, priority: d.priority, category: d.category, channel: d.channel, vehicleId: d.vehicleId || undefined, stop: d.stop || undefined,
      requester: { name: d.name, contact: d.contact } }).then((t) => { onCreated?.(t); onClose(); }, (e: Error) => setErr(e.message));
  };
  return (
    <Dialog open={open} title="Log a rider contact" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Open ticket</Button></>}>
      <div className="grid-2">
        <Field label="Rider"><input className="input" autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" /></Field>
        <Field label="Phone or email"><input className="input" value={d.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
      </div>
      <div className="grid-3">
        <Field label="Channel">
          <select className="select" value={d.channel} onChange={(e) => set({ channel: e.target.value as TicketChannel })}>
            {(["phone", "email", "app"] as TicketChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className="select" value={d.category} onChange={(e) => set({ category: e.target.value as TicketCategory })}>
            {(["lost_item", "service", "accessibility", "safety", "rider_app", "other"] as TicketCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="select" value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) as Ticket["priority"] })}>
            <option value={1}>P1 · Urgent</option><option value={2}>P2 · High</option><option value={3}>P3 · Normal</option><option value={4}>P4 · Low</option>
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Vehicle, if known">
          <select className="select" value={d.vehicleId} onChange={(e) => set({ vehicleId: e.target.value })}>
            <option value="">Unknown</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.routeName}</option>)}
          </select>
        </Field>
        <Field label="Stop">
          <select className="select" value={d.stop} onChange={(e) => set({ stop: e.target.value })}>
            <option value="">Unknown</option>{STOPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Summary"><input className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ramp didn't deploy at Market Square" /></Field>
      <Field label="What the rider said"><textarea className="textarea" value={d.body} onChange={(e) => set({ body: e.target.value })} /></Field>
      {err && <div className="form-error">{err}</div>}
    </Dialog>
  );
}
