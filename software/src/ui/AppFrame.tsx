import type { ReactNode } from "react";
import { Link } from "../lib/router";

export interface NavItem { href: string; label: string; count?: number | string; exact?: boolean; active?: boolean }

export function AppFrame({ section, nav, path, children }: { section: string; nav: NavItem[]; path: string; children: ReactNode }) {
  return (
    <div className="app">
      <nav className="sidenav" aria-label={section}>
        <span className="label">{section}</span>
        {nav.map((n) => {
          const on = n.active ?? (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));
          return <Link key={n.href} href={n.href} className={on ? "on" : ""}>{n.label}{n.count != null && <span className="count">{n.count}</span>}</Link>;
        })}
      </nav>
      <div className="page">{children}</div>
    </div>
  );
}
