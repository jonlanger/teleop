// Live log stream with filters, pause, and export.
import { useMemo, useState } from "react";
import type { LogEntry, LogLevel, LogSource } from "@shared/types";
import { Button } from "../../ds";
import { useLogs } from "../../lib/live";
import { setQuery, useQuery } from "../../lib/router";
import { clockMs } from "../../lib/format";
import { PageHead, Panel, Seg } from "../../ui";
import { VehiclePicker, useVehicleParam } from "./VehiclePicker";

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SOURCES: LogSource[] = ["vehicle", "dbw", "autonomy", "network", "console", "wheel", "server", "ops"];

export function Logs() {
  const live = useLogs();
  const q = useQuery();
  const vehicle = useVehicleParam(false);
  const level = (q.get("level") ?? "info") as LogLevel;
  const source = q.get("source") ?? "";
  const text = q.get("q") ?? "";
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const src = frozen ?? live;
  const rows = useMemo(() => src.filter((e) => RANK[e.level] >= RANK[level] && (!vehicle || e.vehicleId === vehicle) && (!source || e.source === source)
    && (!text || e.msg.toLowerCase().includes(text.toLowerCase()))).slice(-600).reverse(), [src, level, vehicle, source, text]);

  const exportFile = () => {
    const blob = new Blob([rows.slice().reverse().map((e) => JSON.stringify(e)).join("\n")], { type: "application/x-ndjson" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `teleop-logs-${new Date().toISOString().slice(0, 19)}.ndjson`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHead title="Logs" sub={frozen ? `Paused with ${frozen.length} lines. New lines are still being collected.` : "Streaming. The console keeps the last 3,000 lines; the server keeps 6,000."}
        actions={<><Button onClick={() => setFrozen(frozen ? null : live.slice())}>{frozen ? "Resume" : "Pause"}</Button><Button variant="ghost" onClick={exportFile}>Export NDJSON</Button></>} />
      <div className="filters">
        <Seg label="Level" value={level} onChange={(v) => setQuery({ level: v })} options={(["debug", "info", "warn", "error"] as LogLevel[]).map((l) => ({ value: l, label: l === "debug" ? "All" : `${l[0].toUpperCase() + l.slice(1)}+` }))} />
        <VehiclePicker allowAll />
        <select className="select sm" style={{ width: 150 }} value={source} onChange={(e) => setQuery({ source: e.target.value })} aria-label="Source">
          <option value="">All sources</option>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input sm" style={{ width: 260 }} placeholder="Search messages" value={text} onChange={(e) => setQuery({ q: e.target.value })} />
        <span className="muted" style={{ fontSize: 12 }}>{rows.length} lines</span>
      </div>
      <Panel bodyClass="logbody">
        <div className="logs" role="log" aria-live="off">
          {rows.map((e) => (
            <div key={e.seq} className={`log log-${e.level}${open === e.seq ? " open" : ""}`} onClick={() => setOpen(open === e.seq ? null : e.seq)}>
              <span className="data muted">{clockMs(e.t)}</span>
              <span className="lvl">{e.level}</span>
              <span className="data">{e.source}</span>
              <span className="data">{e.vehicleId ?? ""}</span>
              <span className="msg">{e.msg}</span>
              {open === e.seq && e.data && <pre className="data logdata">{JSON.stringify(e.data, null, 2)}</pre>}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
