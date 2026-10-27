/**
 * System-design networking arithmetic (ROADMAP 5.9): QPS, bandwidth, fleet size, Little's law,
 * CDN offload, egress cost and the latency-numbers ladder.
 */

export const SECONDS_PER_DAY = 86_400;

/** Average queries per second for a daily request count. */
export function avgQps(requestsPerDay: number): number {
  return requestsPerDay / SECONDS_PER_DAY;
}

/** Peak QPS: the average times a peak-to-average factor. */
export function peakQps(avg: number, factor: number): number {
  return avg * factor;
}

/** Bandwidth in Mbit/s (decimal: 1 Mbit = 10^6 bits) for `qps` responses of `bytes` each. */
export function bandwidthMbps(qps: number, bytes: number): number {
  return (qps * bytes * 8) / 1e6;
}

/** Servers needed to carry `qps` when each handles `perServer`, rounded up (before any N+1 spare). */
export function serversNeeded(qps: number, perServer: number): number {
  return Math.ceil(qps / perServer);
}

/** Little's law: average concurrent requests (or open connections) = arrival rate x time in system. */
export function concurrency(qps: number, seconds: number): number {
  return qps * seconds;
}

/** Requests per second that still reach the origin behind a CDN with this hit ratio (0..1). */
export function originQps(qps: number, hitRatio: number): number {
  return qps * (1 - hitRatio);
}

/** Monthly egress bill (30-day month) for `tbPerDay` terabytes (1 TB = 1000 GB) at `usdPerGb`. */
export function monthlyEgressUsd(tbPerDay: number, usdPerGb: number): number {
  return tbPerDay * 1000 * 30 * usdPerGb;
}

/** Storage in TB after `days` of `perDay` objects of `bytes` each, times `replicas` copies (decimal TB). */
export function storageTb(perDay: number, bytes: number, days: number, replicas: number): number {
  return (perDay * bytes * days * replicas) / 1e12;
}

/** Round-number latency ladder, fastest first, with typical values in nanoseconds. */
export const LATENCY_LADDER = [
  { label: "L1 cache reference", ns: 1 },
  { label: "Main memory reference", ns: 100 },
  { label: "Read 4 KB randomly from an SSD", ns: 100_000 },
  { label: "Round trip within one datacenter", ns: 500_000 },
  { label: "Disk seek", ns: 10_000_000 },
  { label: "Round trip California to the Netherlands", ns: 150_000_000 },
] as const;
