// One command's life on the vehicle: sent, received, then confirmed or refused, with timings and the readback.
import type { Command } from "@shared/types";
import { COMMAND_LABEL } from "@shared/controls";
import { clockMs } from "../lib/format";

const STEP: Record<Command["status"], number> = { sent: 1, received: 2, confirmed: 3, rejected: 3, failed: 3, timeout: 3 };

export function CommandRow({ c, who, onTicket }: { c: Command; who: string; onTicket?: () => void }) {
  const step = STEP[c.status];
  const bad = c.status === "rejected" || c.status === "failed" || c.status === "timeout";
  const endLabel = { confirmed: "Confirmed", rejected: c.rejectedBy === "server" ? "Not sent" : "Refused", failed: "Failed", timeout: "No reply", sent: "Confirmed", received: "Confirmed" }[c.status];
  const value = c.value === undefined ? "" : typeof c.value === "boolean" ? (c.value ? "on" : "off") : typeof c.value === "object" ? "" : String(c.value);
  return (
    <li className={`cmd${bad ? " bad" : ""}`}>
      <div className="cmd-top">
        <span className="data muted">{clockMs(c.sentAt)}</span>
        <span className="heading" style={{ fontSize: 14 }}>{COMMAND_LABEL[c.kind]}{value && <span className="mono"> → {value}</span>}</span>
        <span className="tag">{c.source}</span>
        <span className="muted" style={{ fontSize: 12 }}>{who}</span>
        {bad && onTicket && <button className="linkbtn" onClick={onTicket}>Open ticket</button>}
      </div>
      <div className="steps" aria-label={`Status ${c.status}`}>
        <span className="step done">Sent</span>
        <i className={step >= 2 || c.receivedAt ? "done" : ""} />
        <span className={`step${c.receivedAt ? " done" : c.status === "sent" ? " now" : ""}`}>Received{c.receivedAt ? <em> +{c.receivedAt - c.sentAt} ms</em> : ""}</span>
        <i className={step >= 3 ? "done" : ""} />
        <span className={`step${step >= 3 ? (bad ? " bad" : " done") : c.status === "received" ? " now" : ""}`}>{endLabel}{c.doneAt ? <em> +{c.doneAt - c.sentAt} ms</em> : ""}</span>
      </div>
      {(c.readback || c.reason) && <div className={`cmd-rb${bad ? " warn" : ""}`}>{c.status === "confirmed" ? "Vehicle reports: " : ""}{c.readback ?? c.reason}</div>}
    </li>
  );
}
