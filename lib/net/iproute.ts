/**
 * Cisco IP routing basics (CCNA 4.3a): administrative distance, route
 * selection (longest prefix, then AD, then metric) and `show ip route` codes.
 * Pure, so the generators and tests share one solver.
 */
import { contains, formatCidr, parseCidr, parseIp, type Cidr } from "./ipv4";

export type RouteSource = "connected" | "static" | "eigrp-summary" | "ebgp" | "eigrp" | "ospf" | "isis" | "rip" | "eigrp-external" | "ibgp";

/** Default administrative distances on Cisco IOS. */
export const ADMIN_DISTANCE: Readonly<Record<RouteSource, number>> = {
  connected: 0,
  static: 1,
  "eigrp-summary": 5,
  ebgp: 20,
  eigrp: 90,
  ospf: 110,
  isis: 115,
  rip: 120,
  "eigrp-external": 170,
  ibgp: 200,
};

/** The code letter `show ip route` prints for each source. */
export const ROUTE_CODE: Readonly<Record<string, string>> = {
  connected: "C",
  local: "L",
  static: "S",
  rip: "R",
  eigrp: "D",
  "eigrp-external": "EX",
  ospf: "O",
  ebgp: "B",
  ibgp: "B",
  isis: "i",
};

export interface Route {
  prefix: Cidr;
  source: RouteSource;
  /** Administrative distance; defaults to the source's table value. */
  ad: number;
  metric: number;
  nextHop?: string;
}

export function route(prefix: string, source: RouteSource, metric: number, o: { ad?: number; nextHop?: string } = {}): Route {
  return { prefix: parseCidr(prefix), source, ad: o.ad ?? ADMIN_DISTANCE[source], metric, nextHop: o.nextHop };
}

/**
 * Pick the route IOS installs for a destination. Longest prefix wins across
 * all routes; among equal prefixes the lowest AD wins; among equal AD (same
 * protocol) the lowest metric wins. Returns null when nothing matches.
 */
export function selectRoute(routes: readonly Route[], dest: number | string): Route | null {
  const d = typeof dest === "string" ? parseIp(dest) : dest;
  let best: Route | null = null;
  for (const r of routes) {
    if (!contains(r.prefix, d)) continue;
    if (
      best === null ||
      r.prefix.prefix > best.prefix.prefix ||
      (r.prefix.prefix === best.prefix.prefix && (r.ad < best.ad || (r.ad === best.ad && r.metric < best.metric)))
    ) {
      best = r;
    }
  }
  return best;
}

/**
 * Among routes to the same prefix, the one installed in the table. Others
 * are backups: a static route with a higher AD than the dynamic protocol is a
 * floating static route and only appears when the dynamic route disappears.
 */
export function installedFor(routes: readonly Route[], prefix: string): Route | null {
  const p = parseCidr(prefix);
  const same = routes.filter((r) => r.prefix.network === p.network && r.prefix.prefix === p.prefix);
  return same.reduce<Route | null>((b, r) => (b === null || r.ad < b.ad || (r.ad === b.ad && r.metric < b.metric) ? r : b), null);
}

/** The AD a floating static route needs so it only backs up the given protocol. */
export const floatingAd = (source: RouteSource): number => ADMIN_DISTANCE[source] + 1;

/** `ip route 0.0.0.0 0.0.0.0 <next-hop>` is the default route; its code is S*. */
export function showRouteLine(r: Route): string {
  const code = r.prefix.prefix === 0 && r.source === "static" ? "S*" : ROUTE_CODE[r.source];
  const via = r.nextHop ? ` via ${r.nextHop}` : "";
  return `${code.padEnd(3)} ${formatCidr(r.prefix)} [${r.ad}/${r.metric}]${via}`;
}

/** Parse the `[AD/metric]` part of a route line. */
export function parseAdMetric(line: string): { ad: number; metric: number } | null {
  const m = /\[(\d+)\/(\d+)\]/.exec(line);
  return m ? { ad: Number(m[1]), metric: Number(m[2]) } : null;
}
