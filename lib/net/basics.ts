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
