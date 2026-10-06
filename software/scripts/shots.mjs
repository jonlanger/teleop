// Screenshots of the running app for the homepage and the hardware renders.
// Needs the dev server (default http://localhost:5181) and Google Chrome. Run with: node --experimental-websocket scripts/shots.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:5181";
const OUT = process.argv[2] ?? "shots";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // name, user, path, width, height, scale, themes
  ["console", "u_sam", "/operate", 1600, 1000, 2, ["dark", "light"]],
  ["fleet", "u_dana", "/fleet", 1600, 1000, 2, ["dark", "light"]],
  ["eng", "u_kenji", "/eng/telemetry", 1600, 1000, 2, ["dark", "light"]],
  ["support", "u_ruth", "/support", 1600, 1000, 2, ["dark", "light"]],
  ["monitor", "u_sam", "/operate", 2560, 1080, 1.5, ["dark"]],
  ["wall", "u_dana", "/fleet", 2400, 900, 1.6, ["dark"]],
];

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "teleop-shots-"))}`,
  "--hide-scrollbars", "--no-first-run", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) { await sleep(200); try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch {} }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true });

await send("Page.enable");
await send("Page.navigate", { url: BASE + "/?reset" });
await sleep(1500);
// Let the simulator run so vehicles are spread out and some ask for help.
await sleep(Number(process.env.WARM ?? 20000));

for (const [name, user, path, w, h, scale, themes] of SHOTS) {
  for (const theme of themes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    await evaluate(`localStorage.setItem("teleop.session", JSON.stringify({ userId: "${user}", station: "ST-01", theme: "${theme}", keyboardDrive: true, vehiclesOpen: true, alertsOpen: true }))`);
    await send("Page.navigate", { url: BASE + path });
    await sleep(name === "console" || name === "monitor" ? 7000 : 3500);
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    const file = join(OUT, `${name}${themes.length > 1 ? `-${theme}` : ""}.png`);
    writeFileSync(file, Buffer.from(result.data, "base64"));
    console.log("wrote", file);
  }
}
ws.close(); chrome.kill();
