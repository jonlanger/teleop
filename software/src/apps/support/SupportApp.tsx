// Support: every ticket from riders, operators, engineering and fleet managers, and the tools to resolve them.
import type { Ticket, User } from "@shared/types";
import { sla } from "@shared/support";
import { useResource } from "../../lib/api";
import { match, useQuery } from "../../lib/router";
import { AppFrame } from "../../ui/AppFrame";
import { Queue, VIEWS, inView, type ViewId } from "./Queue";
import { Workspace } from "./Workspace";
import { Insights } from "./Insights";
import "./support.css";

export function SupportApp({ me, users, path }: { me: User; users: User[]; path: string }) {
  const tickets = useResource<Ticket[]>("/api/tickets", ["tickets"]).data ?? [];
  const q = useQuery();
  const t = match("/support/tickets/:id", path);
  const defaultView: ViewId = me.role === "operator" ? "reported" : me.role === "engineer" ? "waiting_eng" : "inbox";
  const view = (q.get("view") as ViewId) ?? defaultView;
  const now = Date.now();
  const count = (v: ViewId) => tickets.filter((x) => inView(x, v, me, now)).length;
  const onQueue = path === "/support" || path === "/support/";
  const nav = VIEWS.filter((v) => !v.roles || v.roles.includes(me.role)).map((v) => ({
    href: `/support?view=${v.id}`, label: v.label, count: v.id === "resolved" ? undefined : count(v.id) || undefined, active: onQueue && view === v.id,
  }));
  return (
    <AppFrame section="Support" path={path} nav={[
      ...nav,
      { href: "/support/insights", label: "Insights", active: path.startsWith("/support/insights") },
    ]}>
      {t ? <Workspace id={t.id} me={me} users={users} tickets={tickets} />
        : path.startsWith("/support/insights") ? <Insights tickets={tickets} users={users} />
        : <Queue me={me} users={users} tickets={tickets} view={view} overdue={tickets.filter((x) => sla(x, now).overdue).length} />}
    </AppFrame>
  );
}
