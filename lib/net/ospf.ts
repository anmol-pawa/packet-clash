/**
 * OSPF and EIGRP basics (CCNA 4.3b): interface cost from the reference
 * bandwidth, DR/BDR election, neighbour states and the classic EIGRP metric.
 * Pure, so the generators and tests share one solver.
 */
import { formatIp, parseIp } from "./ipv4";

/** Default `auto-cost reference-bandwidth` on IOS, in Mbps. */
export const OSPF_DEFAULT_REFERENCE_MBPS = 100;

/** OSPF cost = reference bandwidth / interface bandwidth, truncated, never below 1. */
export function ospfCost(bandwidthMbps: number, referenceMbps: number = OSPF_DEFAULT_REFERENCE_MBPS): number {
  if (!(bandwidthMbps > 0) || !(referenceMbps > 0)) throw new Error("bandwidths must be positive");
  return Math.max(1, Math.floor(referenceMbps / bandwidthMbps));
}

/** The cost of a path is the sum of the costs of the outgoing interfaces along it. */
export const pathCost = (costs: readonly number[]): number => costs.reduce((a, b) => a + b, 0);

export interface OspfRouter {
  name: string;
  routerId: string;
  priority: number;
}

/** Highest priority wins, then highest router ID. Priority 0 is never eligible. */
function ranked(routers: readonly OspfRouter[]): OspfRouter[] {
  return routers
    .filter((r) => r.priority > 0)
    .sort((a, b) => b.priority - a.priority || parseIp(b.routerId) - parseIp(a.routerId));
}

/** DR is the best-ranked eligible router, BDR the second. Either is null if no one qualifies. */
export function electDr(routers: readonly OspfRouter[]): { dr: OspfRouter | null; bdr: OspfRouter | null } {
  const [dr = null, bdr = null] = ranked(routers);
  return { dr, bdr };
}

/**
 * Router ID selection: the manual `router-id`, else the highest loopback IP,
 * else the highest IP of an active physical interface.
 */
export function pickRouterId(o: { manual?: string; loopbacks?: readonly string[]; interfaces?: readonly string[] }): string | null {
  if (o.manual) return o.manual;
  const best = (xs: readonly string[] = []) => (xs.length ? formatIp(Math.max(...xs.map(parseIp))) : null);
  return best(o.loopbacks) ?? best(o.interfaces);
}

export const OSPF_STATES = ["Down", "Init", "2-Way", "ExStart", "Exchange", "Loading", "Full"] as const;

/** On a broadcast segment, two non-DR/BDR routers stop at 2-Way; with the DR or BDR they reach Full. */
export function adjacencyState(aIsDrOrBdr: boolean, bIsDrOrBdr: boolean): "2-Way" | "Full" {
  return aIsDrOrBdr || bIsDrOrBdr ? "Full" : "2-Way";
}

/**
 * Classic EIGRP metric with the default K values (K1 = K3 = 1):
 * 256 * (10^7 / lowest bandwidth in kbps + total delay in tens of microseconds),
 * each term truncated to an integer.
 */
export function eigrpMetric(bandwidthsKbps: readonly number[], delaysUs: readonly number[]): number {
  const bw = Math.floor(1e7 / Math.min(...bandwidthsKbps));
  const delay = Math.floor(delaysUs.reduce((a, b) => a + b, 0) / 10);
  return 256 * (bw + delay);
}

/** Default interface bandwidth (kbps) and delay (microseconds) on IOS. */
export const EIGRP_INTERFACES = {
  Ethernet: { bandwidthKbps: 10_000, delayUs: 1000 },
  FastEthernet: { bandwidthKbps: 100_000, delayUs: 100 },
  GigabitEthernet: { bandwidthKbps: 1_000_000, delayUs: 10 },
  Serial: { bandwidthKbps: 1544, delayUs: 20_000 },
} as const;
