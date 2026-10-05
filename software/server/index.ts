// teleop server: one process, one port. HTTP API, WebSocket for live state, and the web app (Vite in dev).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMsg, ServerMsg } from "../shared/types.ts";
import { Fleet } from "./fleet.ts";
import { createApi } from "./api.ts";
import { loadDb, save } from "./store.ts";

const PORT = Number(process.env.PORT ?? 5180);
const prod = process.env.NODE_ENV === "production";

const db = loadDb();
const fleet = new Fleet(db);
const api = createApi(fleet);

let vite: import("vite").ViteDevServer | null = null;
if (!prod) {
  const { createServer: createVite } = await import("vite");
  vite = await createVite({ server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: "spa" });
}

const dist = new URL("../dist/", import.meta.url);
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const server = createServer(async (req, res) => {
  if (await api(req, res)) return;
  if (vite) return vite.middlewares(req, res);
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const file = path.includes(".") ? path.slice(1) : "index.html";
  try {
    const body = await readFile(new URL(file, dist));
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404); res.end("Not found"); }
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws: WebSocket) => {
  let userId = "", station: string | undefined;
  const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  const off = fleet.subscribe(send);

  ws.on("message", (raw) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return; }
    switch (m.t) {
      case "hello":
        userId = m.userId; station = m.station;
        send({ t: "welcome", now: Date.now(), vehicles: fleet.snapshot(), alerts: fleet.alerts.filter((a) => !a.closed), commands: fleet.commands.slice(0, 300), logs: fleet.logs.slice(-400) });
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
  });
  ws.on("close", () => {
    off();
    if (!userId) return;
    // A console that drops mid-drive leaves the vehicle to its watchdog, which brakes it to a stop.
    for (const v of fleet.vehicles.values()) if (v.s.controller === userId) fleet.log("warn", "console", `Console for ${fleet.user(userId)?.name} disconnected while holding the vehicle`, v.id);
    const st = db.stations.find((s) => s.userId === userId);
    if (st) { st.userId = null; st.halo = "off"; save(db); fleet.invalidate("stations"); }
  });
});

server.listen(PORT, () => console.log(`teleop on http://localhost:${PORT}${prod ? "" : " (dev)"}`));
