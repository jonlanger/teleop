// Support: where tickets come from, how fast they need an answer, and the playbook for resolving each kind.
import type { Role, Ticket, TicketCategory, TicketChannel, TicketSource } from "./types";

export const SOURCE_LABEL: Record<TicketSource, string> = { customer: "Customer", operator: "Operator", engineering: "Engineering", fleet: "Fleet manager", support: "Support", system: "System" };
export const CHANNEL_LABEL: Record<TicketChannel, string> = { app: "Rider app", phone: "Phone", email: "Email", console: "Console", auto: "Automatic" };
export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  lost_item: "Lost item", service: "Service and stops", accessibility: "Accessibility", safety: "Safety", vehicle_fault: "Vehicle fault",
  rider_app: "Rider app", station: "Operator station", software: "Autonomy software", other: "Other",
};
/** The source of a ticket a team member raised themselves. Rider tickets carry a requester and are always "customer". */
export const sourceForRole = (r: Role): TicketSource => (r === "operator" ? "operator" : r === "manager" ? "fleet" : r === "engineer" ? "engineering" : "support");

/** Response and resolution targets by priority, in minutes. */
export const SLA: Record<1 | 2 | 3 | 4, { respond: number; resolve: number }> = {
  1: { respond: 15, resolve: 4 * 60 }, 2: { respond: 60, resolve: 24 * 60 }, 3: { respond: 4 * 60, resolve: 72 * 60 }, 4: { respond: 24 * 60, resolve: 7 * 24 * 60 },
};

export type SlaState = { kind: "respond" | "resolve" | "met"; dueAt: number; overdue: boolean };
/** The next deadline this ticket faces: a first response, then resolution. */
export function sla(t: Pick<Ticket, "priority" | "createdAt" | "firstResponseAt" | "status" | "source" | "resolution">, now = Date.now()): SlaState {
  if (t.status === "resolved") return { kind: "met", dueAt: t.resolution?.at ?? now, overdue: false };
  const s = SLA[t.priority];
  // Team-raised tickets have no outside requester to answer; their clock is resolution only.
  const needsReply = t.source === "customer" && !t.firstResponseAt;
  const dueAt = t.createdAt + (needsReply ? s.respond : s.resolve) * 60e3;
  return { kind: needsReply ? "respond" : "resolve", dueAt, overdue: now > dueAt };
}

export function dueText(st: SlaState, now = Date.now()) {
  if (st.kind === "met") return "Resolved";
  const m = Math.round(Math.abs(st.dueAt - now) / 60e3);
  const span = m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  const what = st.kind === "respond" ? "Reply" : "Resolve";
  return st.overdue ? `${what} overdue ${span}` : `${what} in ${span}`;
}

export const RESOLUTION_CODES = [
  { id: "fixed", label: "Fixed" }, { id: "answered", label: "Answered the question" }, { id: "returned", label: "Item returned" },
  { id: "escalated_fixed", label: "Fixed by engineering" }, { id: "fleet_action", label: "Fleet took action" }, { id: "no_fault", label: "Worked as intended" },
  { id: "not_reproducible", label: "Couldn't reproduce" }, { id: "duplicate", label: "Duplicate" }, { id: "wont_fix", label: "Won't fix" },
];

export type StepAction = "context" | "reply" | "escalate_engineering" | "escalate_fleet" | "diagnostics" | "resolve";
export interface Step { id: string; text: string; action?: StepAction; macro?: string }
/** How to resolve each kind of ticket. Steps with an action open the tool that does it. */
export const PLAYBOOKS: Record<TicketCategory, Step[]> = {
  lost_item: [
    { id: "ride", text: "Find the ride: vehicle, stop and time", action: "context" },
    { id: "hold", text: "Ask fleet to hold the item at the depot", action: "escalate_fleet" },
    { id: "tell", text: "Tell the rider where and when to collect it", action: "reply", macro: "lost_found" },
    { id: "close", text: "Resolve as Item returned once collected", action: "resolve" },
  ],
  service: [
    { id: "events", text: "Check what the vehicle did at that stop and time", action: "context" },
    { id: "cause", text: "Decide the cause: assist hold, stop skipped, or delay" },
    { id: "eng", text: "If autonomy skipped a stop, send it to engineering", action: "escalate_engineering" },
    { id: "reply", text: "Tell the rider what happened", action: "reply", macro: "service_apology" },
  ],
  accessibility: [
    { id: "events", text: "Confirm the vehicle, stop and door events", action: "context" },
    { id: "fleet", text: "Ask fleet to check the ramp on the next depot visit", action: "escalate_fleet" },
    { id: "reply", text: "Reply within the hour with what changes", action: "reply", macro: "accessibility" },
  ],
  safety: [
    { id: "timeline", text: "Review the timeline: stops, alerts and commands", action: "context" },
    { id: "fleet", text: "Notify the fleet manager", action: "escalate_fleet" },
    { id: "footage", text: "Save camera footage to the incident folder" },
    { id: "rider", text: "Contact the rider if one was involved", action: "reply", macro: "safety_followup" },
    { id: "close", text: "Resolve with a written summary", action: "resolve" },
  ],
  vehicle_fault: [
    { id: "faults", text: "Check active faults and run diagnostics", action: "diagnostics" },
    { id: "eng", text: "Send it to engineering with a work order", action: "escalate_engineering" },
    { id: "fleet", text: "If it is unsafe, ask fleet to take it out of service", action: "escalate_fleet" },
    { id: "confirm", text: "Confirm the fix with whoever reported it", action: "reply", macro: "fixed" },
  ],
  rider_app: [
    { id: "repro", text: "Reproduce it in the rider app" },
    { id: "eng", text: "Send it to engineering", action: "escalate_engineering" },
    { id: "reply", text: "Reply with a workaround", action: "reply", macro: "ack" },
  ],
  station: [
    { id: "wheel", text: "Check the desk's wheel firmware and link", action: "diagnostics" },
    { id: "eng", text: "Send it to engineering", action: "escalate_engineering" },
    { id: "tell", text: "Tell the operator when it is fixed", action: "reply", macro: "fixed" },
  ],
  software: [
    { id: "events", text: "Pull the vehicle's events and commands", action: "context" },
    { id: "eng", text: "Send it to engineering with the timeline", action: "escalate_engineering" },
    { id: "close", text: "Resolve when engineering confirms", action: "resolve" },
  ],
  other: [
    { id: "triage", text: "Set the category and priority" },
    { id: "reply", text: "Acknowledge the requester", action: "reply", macro: "ack" },
  ],
};

/** Canned replies. {name}, {vehicle} and {stop} are filled from the ticket. */
export const MACROS: { id: string; label: string; text: string }[] = [
  { id: "ack", label: "Acknowledge", text: "Hi {name}, thanks for letting us know. We're looking into it and will update you today." },
  { id: "lost_found", label: "Lost item found", text: "Hi {name}, we found it on {vehicle}. It's held at the Depot front desk (Elm Ave and 6th St), open 7:00–19:00. Bring an ID to collect it." },
  { id: "service_apology", label: "Missed or late stop", text: "Hi {name}, sorry about your trip at {stop}. The shuttle was holding for a hazard ahead and lost time. We've shared this with the operations team." },
  { id: "accessibility", label: "Accessibility follow-up", text: "Hi {name}, thank you for telling us about the ramp at {stop}. We've pulled {vehicle} for a ramp check and will confirm once it's fixed." },
  { id: "safety_followup", label: "Safety follow-up", text: "Hi {name}, we're sorry for the hard stop. The vehicle braked for a hazard, and an operator reviewed it. Are you all right? Reply here if you need anything." },
  { id: "fixed", label: "Fixed", text: "Hi {name}, this is fixed. Thanks for reporting it. Reply here if you see it again." },
];

export function fillMacro(text: string, t: Pick<Ticket, "requester" | "vehicleId" | "stop">) {
  return text.replace(/\{name\}/g, t.requester?.name.split(" ")[0] ?? "there").replace(/\{vehicle\}/g, t.vehicleId ?? "the shuttle").replace(/\{stop\}/g, t.stop ?? "your stop");
}

/** Category defaults for the team's ticket types, so older tickets land in a playbook. */
export const CATEGORY_FOR_TYPE = { incident: "safety", vehicle: "vehicle_fault", software: "software", station: "station", rider: "lost_item" } as const;
