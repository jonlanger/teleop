// The teleop engine, running in the page: the vehicle simulator, the fleet service and the operations API.
// It stands in for a server, so everything crossing the boundary is copied as JSON, the way a network would.
import type { ClientMsg, ServerMsg } from "@shared/types";
import { Fleet } from "./fleet";
import { createApi } from "./api";
import { loadDb, resetDb, save } from "./store";

// Open any page with ?reset to throw away this browser's saved data and start again from the seed.
if (new URLSearchParams(location.search).has("reset")) { resetDb(); history.replaceState(null, "", location.pathname + location.hash); }
const db = loadDb();
// Station connections belong to the page that made them; none survive a reload.
for (const st of db.stations) { st.userId = null; st.halo = "off"; }
const fleet = new Fleet(db);
const handle = createApi(fleet);

const copy = <T,>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

export async function request(method: string, path: string, body: unknown, userId: string) {
  await Promise.resolve();
  const res = handle(method, path, copy(body), userId);
  return { status: res.status, data: copy(res.data) };
}

/** Open a connection: messages from the fleet go to onMessage; send() carries console messages in. */
export function connect(onMessage: (m: ServerMsg) => void) {
  let userId = "", station: string | undefined;
  const push = (m: ServerMsg) => onMessage(copy(m));
  fleet.subscribe(push);

  const receive = (m: ClientMsg) => {
    switch (m.t) {
      case "hello":
        userId = m.userId; station = m.station;
        push({ t: "welcome", now: Date.now(), vehicles: fleet.snapshot(), alerts: fleet.alerts.filter((a) => !a.closed), commands: fleet.commands.slice(0, 300), logs: fleet.logs.slice(-400) });
        fleet.log("info", "console", `${fleet.user(userId)?.name ?? userId} connected${station ? ` at ${station}` : ""}`);
        break;
      case "cmd": if (userId) fleet.submit(m, userId); break;
      case "drive": if (userId) fleet.drive(m, userId); break;
      case "guide": if (userId) fleet.guide(m, userId); break;
      case "ack": if (userId) fleet.ack(m.alertId, userId); break;
      case "wheel": {
        const st = db.stations.find((s) => s.id === m.station);
        if (!st) break;
        const changed = st.wheelSerial !== m.serial || st.wheelFw !== m.fw || st.userId !== (m.connected ? userId : null) || st.halo !== m.halo;
        if (m.connected !== (st.userId != null)) fleet.log("info", "wheel", `Wheel ${m.serial} ${m.connected ? "connected" : "disconnected"} at ${st.id}`, undefined, { fw: m.fw });
        Object.assign(st, { wheelSerial: m.serial, wheelFw: m.fw, lastSeen: Date.now(), userId: m.connected ? userId : null, halo: m.halo });
        if (changed) { save(db); fleet.invalidate("stations"); }
        break;
      }
    }
  };

  return { send: (m: ClientMsg) => { const c = copy(m); queueMicrotask(() => receive(c)); } };
}
