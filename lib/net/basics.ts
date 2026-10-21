/**
 * Small, exact networking calculators. Quiz answers that involve numbers are
 * computed here (never typed in by hand) and checked against textbook values
 * in tests.
 */

/** Usable host addresses in an IPv4 subnet with this prefix length (RFC 3021 /31 and /32 are special cases). */
export function usableHosts(prefix: number): number {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`bad prefix /${prefix}`);
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return 2 ** (32 - prefix) - 2;
}

/** Transmission delay L/R in seconds, for a packet of `bytes` on a link of `bitsPerSecond`. */
export function transmissionDelay(bytes: number, bitsPerSecond: number): number {
  return (bytes * 8) / bitsPerSecond;
}

/** Propagation delay d/s in seconds. */
export function propagationDelay(meters: number, metersPerSecond: number): number {
  return meters / metersPerSecond;
}

/** Traffic intensity La/R: packets of `bytes` arriving at `packetsPerSecond` on a `bitsPerSecond` link. Above 1 the queue grows without bound. */
export function trafficIntensity(bytes: number, packetsPerSecond: number, bitsPerSecond: number): number {
  return (bytes * 8 * packetsPerSecond) / bitsPerSecond;
}

/**
 * Time in seconds to send `packets` packets of `bytes` each over `links`
 * store-and-forward links of equal rate, ignoring propagation and queuing:
 * the first packet takes N·L/R and each later one arrives L/R behind it,
 * so (N + P − 1)·L/R (Kurose & Ross §1.3).
 */
export function storeAndForwardTime(bytes: number, bitsPerSecond: number, links: number, packets = 1): number {
  if (!Number.isInteger(links) || links < 1 || !Number.isInteger(packets) || packets < 1) throw new Error("need ≥1 link and ≥1 packet");
  return (links + packets - 1) * transmissionDelay(bytes, bitsPerSecond);
}

/** Time in seconds to send a file of `bits` over a TDM circuit: setup, then the file at R / slots. */
export function circuitFileTime(bits: number, linkBitsPerSecond: number, slots: number, setupSeconds: number): number {
  return setupSeconds + bits / (linkBitsPerSecond / slots);
}

/** Users a circuit-switched link can carry at once, each reserving `userBitsPerSecond`. */
export function circuitUsers(linkBitsPerSecond: number, userBitsPerSecond: number): number {
  return Math.floor(linkBitsPerSecond / userBitsPerSecond);
}

/** P(more than `k` of `n` independent users are active at once), each active with probability `p` (binomial tail). */
export function probMoreThanActive(n: number, p: number, k: number): number {
  let total = 0;
  let choose = 1; // C(n, i)
  for (let i = 0; i <= n; i++) {
    if (i > 0) choose = (choose * (n - i + 1)) / i;
    if (i > k) total += choose * p ** i * (1 - p) ** (n - i);
  }
  return total;
}

/** End-to-end throughput of a path: the bottleneck (slowest) link's rate. */
export function bottleneck(rates: readonly number[]): number {
  if (rates.length === 0) throw new Error("empty path");
  return Math.min(...rates);
}

/** Bandwidth-delay product R·d_prop: the bits in flight on a link when the sender transmits nonstop. */
export function bandwidthDelayProduct(bitsPerSecond: number, propSeconds: number): number {
  return bitsPerSecond * propSeconds;
}
