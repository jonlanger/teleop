import { useEffect } from "react";
import type { Role, Station, Ticket, User } from "@shared/types";
import { ROLE_LABEL } from "@shared/controls";
import wordWhite from "@brand/teleop-wordmark-white.svg?url";
import wordCarbon from "@brand/teleop-wordmark-carbon.svg?url";
import { Button } from "./ds";
import { useResource } from "./lib/api";
import { live, useAlerts, useConnected } from "./lib/live";
import { Link, navigate, usePath } from "./lib/router";
import { session, useSession } from "./lib/session";
import { Avatar } from "./ui";
import { OperatorConsole } from "./apps/operator/Console";
import { FleetApp } from "./apps/fleet/FleetApp";
import { EngApp } from "./apps/eng/EngApp";
import { SupportApp } from "./apps/support/SupportApp";
import { Home } from "./apps/home/Home";

const HOME: Record<Role, string> = { operator: "/operate", manager: "/fleet", engineer: "/eng", support: "/support" };

/** The four workspaces, always in this order. A tab you can't use stays visible but disabled. */
export const WORKSPACES: { href: string; label: string; roles: Role[]; deny: string }[] = [
  { href: "/operate", label: "Operator", roles: ["operator", "manager"], deny: "The console is for operators and fleet managers." },
  { href: "/fleet", label: "Fleet", roles: ["operator", "manager", "engineer", "support"], deny: "" },
  { href: "/eng", label: "Engineer", roles: ["manager", "engineer", "support"], deny: "Engineering is for vehicle engineers, support and fleet managers." },
  { href: "/support", label: "Support", roles: ["operator", "manager", "engineer", "support"], deny: "" },
];

export function App() {
  const s = useSession();
  const path = usePath();
  const users = useResource<User[]>("/api/users", ["users"]);
  const me = users.data?.find((u) => u.id === s.userId) ?? null;

  useEffect(() => { if (me) live.connect(me.id, s.station); }, [me, s.station]);
  useEffect(() => { if (me && (path === "/" || path === "/signin" || path === "/signup")) navigate(HOME[me.role], true); }, [me, path]);

  // The homepage is public; /about shows it to signed-in people too.
  if (path === "/about" || (!me && path === "/")) return <Home />;
  if (!users.data) return <div className="empty">{users.error ? `Server unreachable: ${users.error}` : "Loading"}</div>;
  if (!me) return <SignIn users={users.data} mode={path === "/signup" ? "signup" : "signin"} />;

  return (
    <div className="shell">
      <TopBar me={me} path={path} theme={s.theme} />
      {(() => {
        const ws = WORKSPACES.find((w) => path.startsWith(w.href));
        if (ws && !ws.roles.includes(me.role)) return <div className="empty">{ws.deny} <Link href={HOME[me.role]}>Go to your workspace</Link></div>;
        return null;
      })() ?? (path.startsWith("/operate") ? <OperatorConsole me={me} users={users.data} />
        : path.startsWith("/fleet") ? <FleetApp me={me} users={users.data} path={path} />
        : path.startsWith("/eng") ? <EngApp me={me} users={users.data} path={path} />
        : path.startsWith("/support") ? <SupportApp me={me} users={users.data} path={path} />
        : <div className="empty">Nothing here. <Link href={HOME[me.role]}>Go to your workspace</Link></div>)}
    </div>
  );
}

function TopBar({ me, path, theme }: { me: User; path: string; theme: "dark" | "light" }) {
  const connected = useConnected();
  const alerts = useAlerts();
  const crit = alerts.filter((a) => a.severity === "critical" && !a.acknowledgedBy).length;
  const tickets = useResource<Ticket[]>("/api/tickets", ["tickets"]).data ?? [];
  const needsReply = tickets.filter((t) => t.source === "customer" && !t.firstResponseAt && t.status !== "resolved").length;
  return (
    <header className="topbar">
      <Link href="/" aria-label="teleop home"><img className="wordmark" src={theme === "dark" ? wordWhite : wordCarbon} alt="teleop" /></Link>
      <nav className="topnav" aria-label="Workspaces">
        {WORKSPACES.map((n) => n.roles.includes(me.role)
          ? <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "on" : ""}>{n.label}{n.href === "/support" && needsReply > 0 && me.role !== "operator" && <span className="nav-count" title="Rider tickets waiting for a first reply">{needsReply}</span>}</Link>
          : <span key={n.href} className="off" aria-disabled="true" title={n.deny}>{n.label}</span>)}
      </nav>
      <div className="right">
        {crit > 0 && <span className="tag crit">{crit} critical</span>}
        <span className={`conn${connected ? "" : " off"}`} title={connected ? "Live" : "Offline"}><i /><span className="conn-t">{connected ? "Live" : "Offline"}</span></span>
        <Button variant="ghost" className="theme-btn" onClick={() => session.set({ theme: theme === "dark" ? "light" : "dark" })}>{theme === "dark" ? "Daylight" : "Ops dark"}</Button>
        <span className="who" title={me.name}><Avatar name={me.name} /><span className="who-name"><div style={{ fontWeight: 650 }}>{me.name}</div><div className="muted" style={{ fontSize: 12, lineHeight: "14px" }}>{ROLE_LABEL[me.role]}</div></span></span>
        <Button variant="ghost" onClick={() => { session.set({ userId: null }); navigate("/"); }}>Sign out</Button>
      </div>
    </header>
  );
}

function SignIn({ users, mode }: { users: User[]; mode: "signin" | "signup" }) {
  const s = useSession();
  const stations = useResource<Station[]>("/api/stations", ["stations"]);
  const groups: [Role[], string][] = [[["operator"], "Operators"], [["manager"], "Fleet management"], [["engineer", "support"], "Engineering and support"]];
  return (
    <div className="signin">
      <div className="signin-card">
        <div className="signin-top">
          <Link href="/" aria-label="teleop home"><img src={s.theme === "dark" ? wordWhite : wordCarbon} alt="teleop" style={{ height: 36, display: "block" }} /></Link>
          <Link href="/" className="signin-switch">Back to the homepage</Link>
        </div>
        <div>
          <h1 className="title">{mode === "signup" ? "Get started" : "Sign in"}</h1>
          <p className="muted">{mode === "signup"
            ? "Pick the role you want to try. Each person opens their own workspace with the live fleet. This prototype has no passwords; production uses the company SSO."
            : "Choose who you are. This prototype has no passwords; production uses the company SSO."}</p>
          <p className="signin-switch" style={{ marginTop: 4 }}>{mode === "signup"
            ? <>Already have an account? <Link href="/signin">Sign in</Link></>
            : <>New to teleop? <Link href="/signup">Get started</Link></>}</p>
        </div>
        <label className="field" style={{ maxWidth: 320 }}>
          <span className="label">Station</span>
          <select className="select" value={s.station} onChange={(e) => session.set({ station: e.target.value })}>
            {(stations.data ?? []).map((st) => <option key={st.id} value={st.id}>{st.id} · {st.name}</option>)}
          </select>
        </label>
        {groups.map(([roles, label]) => (
          <div key={label} className="stack">
            <span className="label">{label}</span>
            <div className="people">
              {users.filter((u) => roles.includes(u.role)).map((u) => (
                <button key={u.id} className="person" onClick={() => { session.set({ userId: u.id }); navigate(HOME[u.role]); }}>
                  <Avatar name={u.name} />
                  <span><div style={{ fontWeight: 650 }}>{u.name}</div><div className="muted" style={{ fontSize: 12 }}>{u.title}</div></span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
