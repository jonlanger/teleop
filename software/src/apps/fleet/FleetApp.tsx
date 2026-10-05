// Fleet management: what the fleet is doing now, who is on shift, vehicles and people. Tickets live in Support.
import type { User } from "@shared/types";
import { AppFrame } from "../../ui/AppFrame";
import { Overview } from "./Overview";
import { Shifts } from "./Shifts";
import { Vehicles } from "./Vehicles";
import { People } from "./People";
import "./fleet.css";

export function FleetApp({ me, users, path }: { me: User; users: User[]; path: string }) {
  return (
    <AppFrame section="Fleet" path={path} nav={[
      { href: "/fleet", label: "Overview", exact: true },
      { href: "/fleet/shifts", label: "Shifts" },
      { href: "/fleet/vehicles", label: "Vehicles" },
      { href: "/fleet/people", label: "People" },
    ]}>
      {path === "/fleet" || path === "/fleet/" ? <Overview users={users} />
        : path.startsWith("/fleet/shifts") ? <Shifts me={me} users={users} />
        : path.startsWith("/fleet/vehicles") ? <Vehicles me={me} users={users} />
        : <People me={me} users={users} />}
    </AppFrame>
  );
}
