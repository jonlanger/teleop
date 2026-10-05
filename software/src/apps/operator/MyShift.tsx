// The operator's own shift, with clock in and out, at the top of the console.
import { useState } from "react";
import type { Shift, User } from "@shared/types";
import { Button } from "../../ds";
import { api, useResource } from "../../lib/api";
import { clock, day } from "../../lib/format";
import { shiftStatus } from "../fleet/Shifts";

export function MyShift({ me }: { me: User }) {
  const [now] = useState(() => Date.now());
  const shifts = useResource<Shift[]>(`/api/shifts?from=${now - 12 * 3600e3}&to=${now + 36 * 3600e3}`, ["shifts"]).data ?? [];
  const [err, setErr] = useState<string | null>(null);
  const mine = shifts.filter((s) => s.userId === me.id && !s.clockOut);
  const s = mine.find((x) => x.start <= Date.now() && x.end > Date.now()) ?? mine.find((x) => x.start > Date.now()) ?? mine.find((x) => x.clockIn);
  if (!s) return <div className="myshift muted">No shift scheduled in the next day.</div>;
  const st = shiftStatus(s);
  const clockAct = (action: "in" | "out") => api("POST", `/api/shifts/${s.id}/clock`, { action }).then(() => setErr(null), (e: Error) => setErr(e.message));
  return (
    <div className="myshift">
      <div>
        <span className="label">{st === "on" ? "On shift" : st === "late" ? "Shift started" : "Next shift"}</span>
        <div className="mono" style={{ fontSize: 13 }}>{st === "scheduled" ? `${day(s.start)} ` : ""}{clock(s.start)}–{clock(s.end)} · {s.station}</div>
      </div>
      {st === "on" ? <Button variant="ghost" onClick={() => clockAct("out")}>Clock out</Button>
        : st === "late" || (st === "scheduled" && s.start - Date.now() < 30 * 60e3) ? <Button onClick={() => clockAct("in")}>Clock in</Button> : null}
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
