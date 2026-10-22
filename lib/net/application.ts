/**
 * Application-layer solvers: DNS resolution cost (iterative vs recursive,
 * with caches), HTTP page-load time (non-persistent, persistent, pipelined),
 * web-cache average delay and DHCP lease timers. Worked examples: Kurose &
 * Ross §2.2 (HTTP), §2.4 (DNS), RFC 2131 (DHCP).
 */

export type DnsCache = "none" | "tld" | "auth" | "answer";
export type DnsMode = "iterative" | "recursive";

export interface DnsCost {
  /** Servers that must be consulted (root, TLD, authoritative, extra delegations). */
  serversContacted: number;
  /** Queries the local DNS server itself sends. */
  localQueries: number;
  /** All DNS messages on the wire, queries and replies, including host ↔ local DNS server. */
  messages: number;
}

/**
 * A cold lookup walks root → TLD → authoritative (plus `extraLevels` more
 * delegations, e.g. dns.cs.nyu.edu below nyu.edu). A cached TLD server skips
 * the root; a cached authoritative server skips both; a cached answer needs
 * no server at all. The host always asks its local DNS server recursively.
 * Iterative: the local server sends one query per server contacted.
 * Recursive: it sends one query and the servers pass it along, so the message
 * count on the wire is the same: 2 × (servers + 1).
 */
export function dnsCost(mode: DnsMode, cache: DnsCache, extraLevels = 0): DnsCost {
  const cold = 3 + extraLevels;
  const serversContacted = cache === "none" ? cold : cache === "tld" ? cold - 1 : cache === "auth" ? 1 + extraLevels : 0;
  const localQueries = serversContacted === 0 ? 0 : mode === "iterative" ? serversContacted : 1;
  return { serversContacted, localQueries, messages: 2 * (serversContacted + 1) };
}

export type HttpMode = "non-persistent" | "persistent" | "pipelined";

/**
 * Time to fetch a base page plus `objects` embedded objects, in RTTs, ignoring
 * transmission times. Non-persistent: 2 RTT per object (handshake + request),
 * `parallel` connections fetching the embedded ones at once. Persistent
 * without pipelining: 2 RTT for the page, then 1 RTT per object. Pipelined:
 * 2 RTT for the page, then 1 RTT for all objects together.
 */
export function pageLoadRtts(mode: HttpMode, objects: number, parallel = 1): number {
  if (objects === 0) return 2;
  if (mode === "non-persistent") return 2 + 2 * Math.ceil(objects / parallel);
  if (mode === "persistent") return 2 + objects;
  return 3;
}

/** Average delay when a fraction `hit` of requests is served by the local cache. */
export const cacheAverageDelay = (hit: number, cacheMs: number, originMs: number): number => hit * cacheMs + (1 - hit) * originMs;

/** Traffic intensity on a link: requests per second × bits per request ÷ link rate. */
export const linkUtilization = (requestsPerSec: number, bitsPerRequest: number, linkBps: number): number => (requestsPerSec * bitsPerRequest) / linkBps;

/** Average access delay used by K&R §2.2.5: Δ / (1 − Δβ), with Δ = L/R and β the request rate. */
export function accessDelay(bitsPerRequest: number, linkBps: number, requestsPerSec: number): number {
  const delta = bitsPerRequest / linkBps;
  return delta / (1 - delta * requestsPerSec);
}

/** DHCP renew (T1) and rebind (T2) timers: 50% and 87.5% of the lease. */
export const dhcpTimers = (leaseSeconds: number): { t1: number; t2: number } => ({ t1: leaseSeconds * 0.5, t2: leaseSeconds * 0.875 });

/** The four DHCP messages in order (DORA). */
export const DHCP_DORA = ["Discover", "Offer", "Request", "Acknowledge"] as const;
