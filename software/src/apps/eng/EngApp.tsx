// Engineering and support: telemetry, logs, the command audit, maintenance, diagnostics and stations.
import type { Ticket, User, WorkOrder } from "@shared/types";
import { useResource } from "../../lib/api";
import { useVehicles } from "../../lib/live";
import { AppFrame } from "../../ui/AppFrame";
import { Telemetry } from "./Telemetry";
import { Logs } from "./Logs";
import { Commands } from "./Commands";
import { Maintenance } from "./Maintenance";
import { Diagnostics } from "./Diagnostics";
import { Stations } from "./Stations";
import "./eng.css";

export function EngApp({ me, users, path }: { me: User; users: User[]; path: string }) {
  const wos = useResource<WorkOrder[]>("/api/workorders", ["workorders"]);
  const faults = useVehicles().reduce((n, v) => n + v.faults.length, 0);
  const asks = (useResource<Ticket[]>("/api/tickets", ["tickets"]).data ?? []).filter((t) => t.status !== "resolved" && t.escalation?.team === "engineering" && !t.escalation.done).length;
  const sub = path.split("/")[2] ?? "telemetry";
  return (
    <AppFrame section="Engineering" path={path === "/eng" ? "/eng/telemetry" : path} nav={[
      { href: "/eng/telemetry", label: "Telemetry" },
      { href: "/eng/logs", label: "Logs" },
      { href: "/eng/commands", label: "Command audit" },
      { href: "/eng/maintenance", label: "Maintenance", count: faults ? `${faults} ${faults === 1 ? "fault" : "faults"}` : wos.data?.filter((w) => w.status !== "done").length },
      { href: "/eng/diagnostics", label: "Diagnostics" },
      { href: "/eng/stations", label: "Stations and wheels" },
      { href: "/support?view=waiting_eng", label: "Support requests", count: asks || undefined, active: false },
    ]}>
      {sub === "logs" ? <Logs />
        : sub === "commands" ? <Commands users={users} />
        : sub === "maintenance" ? <Maintenance me={me} users={users} workorders={wos.data ?? []} />
        : sub === "diagnostics" ? <Diagnostics me={me} />
        : sub === "stations" ? <Stations users={users} />
        : <Telemetry />}
    </AppFrame>
  );
}
