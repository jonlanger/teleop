// The live connection: vehicle state, alerts, the command trail and logs, pushed from the engine.
import { useSyncExternalStore } from "react";
import { connect } from "../engine";
import type { Alert, ClientMsg, Command, CommandKind, LogEntry, ResourceName, ServerMsg, VehicleState } from "@shared/types";

type Channel = "fleet" | "alerts" | "commands" | "logs" | "conn";
const LOG_CAP = 3000, CMD_CAP = 800;

class Live {
  vehicles: VehicleState[] = [];
  byId = new Map<string, VehicleState>();
  alerts: Alert[] = [];
  commands: Command[] = [];
  logs: LogEntry[] = [];
  connected = false;
  clockSkew = 0;
  private link: ReturnType<typeof connect> | null = null;
  private versions: Record<Channel, number> = { fleet: 0, alerts: 0, commands: 0, logs: 0, conn: 0 };
  private subs: Record<Channel, Set<() => void>> = { fleet: new Set(), alerts: new Set(), commands: new Set(), logs: new Set(), conn: new Set() };
  private invalidators = new Set<(r: ResourceName) => void>();
  private alertListeners = new Set<(a: Alert, isNew: boolean) => void>();
  private hello: ClientMsg | null = null;

  connect(userId: string, station?: string) {
    this.hello = { t: "hello", userId, station };
    if (!this.link) this.link = connect((m) => this.receive(m));
    if (!this.connected) { this.connected = true; this.bump("conn"); }
    this.send(this.hello);
  }

  /** Watch the fleet without signing in (the public homepage). Nothing can be sent until connect(). */
  watch() {
    if (!this.link) this.link = connect((m) => this.receive(m));
  }

  send(m: ClientMsg) { this.link?.send(m); }

  /** Send a command and return its id; its lifecycle arrives as cmd updates. */
  cmd(vehicleId: string, kind: CommandKind, value?: unknown, source: Command["source"] = "console") {
    const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (!this.connected) {
      this.upsertCommand({ id, vehicleId, kind, value, by: "", source, status: "timeout", sentAt: Date.now(), doneAt: Date.now(), reason: "Console is offline. Nothing was sent." });
      return id;
    }
    this.send({ t: "cmd", id, vehicleId, kind, value, source });
    return id;
  }

  private receive(m: ServerMsg) {
    switch (m.t) {
      case "welcome":
        this.clockSkew = m.now - Date.now();
        this.setVehicles(m.vehicles); this.alerts = m.alerts; this.commands = m.commands; this.logs = m.logs;
        (["alerts", "commands", "logs"] as Channel[]).forEach((c) => this.bump(c));
        break;
      case "fleet": this.setVehicles(m.vehicles); break;
      case "cmd": this.upsertCommand(m.command); break;
      case "alert": {
        const i = this.alerts.findIndex((a) => a.id === m.alert.id);
        if (m.alert.closed) { if (i >= 0) this.alerts.splice(i, 1); }
        else if (i >= 0) this.alerts[i] = m.alert;
        else this.alerts.unshift(m.alert);
        this.alerts = [...this.alerts];
        for (const fn of this.alertListeners) fn(m.alert, i < 0 && !m.alert.closed);
        this.bump("alerts");
        break;
      }
      case "logs":
        this.logs = this.logs.concat(m.entries);
        if (this.logs.length > LOG_CAP) this.logs = this.logs.slice(-LOG_CAP);
        this.bump("logs");
        break;
      case "invalidate": for (const fn of this.invalidators) fn(m.resource); break;
    }
  }

  private setVehicles(vs: VehicleState[]) {
    this.vehicles = vs;
    this.byId = new Map(vs.map((v) => [v.id, v]));
    this.bump("fleet");
  }

  private upsertCommand(c: Command) {
    const i = this.commands.findIndex((x) => x.id === c.id);
    const next = i >= 0 ? this.commands.map((x, j) => (j === i ? c : x)) : [c, ...this.commands];
    this.commands = next.length > CMD_CAP ? next.slice(0, CMD_CAP) : next;
    this.bump("commands");
  }

  private bump(c: Channel) { this.versions[c]++; for (const fn of this.subs[c]) fn(); }
  subscribe(c: Channel, fn: () => void) { this.subs[c].add(fn); return () => { this.subs[c].delete(fn); }; }
  version(c: Channel) { return this.versions[c]; }
  onInvalidate(fn: (r: ResourceName) => void) { this.invalidators.add(fn); return () => { this.invalidators.delete(fn); }; }
  onAlert(fn: (a: Alert, isNew: boolean) => void) { this.alertListeners.add(fn); return () => { this.alertListeners.delete(fn); }; }
  ack(alertId: string) { this.send({ t: "ack", alertId }); }
}

export const live = new Live();

function useChannel(c: Channel) {
  return useSyncExternalStore((fn) => live.subscribe(c, fn), () => live.version(c));
}

export function useVehicles() { useChannel("fleet"); return live.vehicles; }
export function useVehicle(id: string | null | undefined) { useChannel("fleet"); return id ? live.byId.get(id) ?? null : null; }
export function useAlerts() { useChannel("alerts"); return live.alerts; }
export function useCommands() { useChannel("commands"); return live.commands; }
export function useLogs() { useChannel("logs"); return live.logs; }
export function useConnected() { useChannel("conn"); return live.connected; }

/** Latest command of a kind on a vehicle: drives every control's readback line. */
export function useLastCommand(vehicleId: string | null, kind: CommandKind) {
  const cmds = useCommands();
  return vehicleId ? cmds.find((c) => c.vehicleId === vehicleId && c.kind === kind) ?? null : null;
}

export const isPending = (c: Command | null | undefined) => !!c && (c.status === "sent" || c.status === "received");
