/**
 * Switching II (CCNA 4.4): spanning-tree root election and port roles,
 * EtherChannel mode compatibility and port-security violation modes.
 * Pure, so the generators and tests share one solver.
 */
import { compareBridgeIds, type BridgeId } from "./switching";

/** IEEE 802.1D-1998 short path costs by link speed (Mbps). */
const STP_COSTS: Readonly<Record<number, number>> = { 4: 250, 10: 100, 16: 62, 100: 19, 1000: 4, 10000: 2 };

export function stpPortCost(mbps: number): number {
  const c = STP_COSTS[mbps];
  if (c === undefined) throw new Error(`no STP cost for ${mbps} Mbps`);
  return c;
}

/** With the extended system ID, the bridge priority sent is the configured value plus the VLAN number. */
export function effectivePriority(configured: number, vlan: number): number {
  if (configured % 4096 !== 0 || configured < 0 || configured > 61440) throw new Error("priority must be a multiple of 4096");
  return configured + vlan;
}

export interface StpBridge extends BridgeId {
  name: string;
}

export interface StpLink {
  a: string;
  b: string;
  cost: number;
}

export type PortRole = "root" | "designated" | "blocked";

export interface StpPort {
  bridge: string;
  /** The bridge at the other end of the link. */
  peer: string;
  role: PortRole;
}

export interface StpResult {
  root: string;
  /** Root path cost of every bridge (0 for the root). */
  pathCost: Record<string, number>;
  ports: StpPort[];
}

/**
 * Run 802.1D on point-to-point links. The lowest bridge ID is the root; every
 * other bridge's root port is its lowest-cost path, ties broken by the lower
 * neighbour bridge ID. On each link the end advertising the lower root path
 * cost (then lower bridge ID) is designated; a non-root end that is not a
 * root port is blocked.
 */
export function computeStp(bridges: readonly StpBridge[], links: readonly StpLink[]): StpResult {
  const byName = new Map(bridges.map((b) => [b.name, b]));
  const rootBridge = [...bridges].sort(compareBridgeIds)[0];
  const dist: Record<string, number> = Object.fromEntries(bridges.map((b) => [b.name, Infinity]));
  dist[rootBridge.name] = 0;
  const done = new Set<string>();
  while (done.size < bridges.length) {
    let u: string | null = null;
    for (const b of bridges) if (!done.has(b.name) && (u === null || dist[b.name] < dist[u])) u = b.name;
    if (u === null || dist[u] === Infinity) throw new Error("topology is not connected");
    done.add(u);
    for (const l of links) {
      const v = l.a === u ? l.b : l.b === u ? l.a : null;
      if (v && dist[u] + l.cost < dist[v]) dist[v] = dist[u] + l.cost;
    }
  }
  const rootPort: Record<string, string> = {};
  for (const b of bridges) {
    if (b.name === rootBridge.name) continue;
    const cands = links
      .filter((l) => l.a === b.name || l.b === b.name)
      .map((l) => ({ peer: l.a === b.name ? l.b : l.a, total: dist[l.a === b.name ? l.b : l.a] + l.cost }))
      .filter((c) => c.total === dist[b.name])
      .sort((x, y) => compareBridgeIds(byName.get(x.peer)!, byName.get(y.peer)!));
    rootPort[b.name] = cands[0].peer;
  }
  const ports: StpPort[] = [];
  for (const l of links) {
    // The root path cost a bridge advertises on a link is its own cost to the root.
    const ends = [l.a, l.b].sort((x, y) => dist[x] - dist[y] || compareBridgeIds(byName.get(x)!, byName.get(y)!));
    const [des, other] = ends;
    ports.push({ bridge: des, peer: other, role: "designated" });
    ports.push({ bridge: other, peer: des, role: rootPort[other] === des ? "root" : "blocked" });
  }
  return { root: rootBridge.name, pathCost: dist, ports };
}

export type EtherChannelMode = "active" | "passive" | "desirable" | "auto" | "on";

/** A channel forms with matching protocols and at least one side actively negotiating (or both `on`). */
export function etherChannelForms(a: EtherChannelMode, b: EtherChannelMode): boolean {
  if (a === "on" || b === "on") return a === b;
  const lacp = (m: EtherChannelMode) => m === "active" || m === "passive";
  if (lacp(a) !== lacp(b)) return false;
  const initiates = (m: EtherChannelMode) => m === "active" || m === "desirable";
  return initiates(a) || initiates(b);
}

export type ViolationMode = "protect" | "restrict" | "shutdown";

export interface ViolationOutcome {
  dropsViolatingFrames: boolean;
  logsAndCounts: boolean;
  errDisabled: boolean;
}

export function violationOutcome(mode: ViolationMode): ViolationOutcome {
  return {
    dropsViolatingFrames: true,
    logsAndCounts: mode !== "protect",
    errDisabled: mode === "shutdown",
  };
}
