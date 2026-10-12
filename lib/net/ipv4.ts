/**
 * IPv4 and CIDR arithmetic on unsigned 32-bit numbers. Pure, so the world map
 * (towns are subnets, routes are point-to-point links) and later the
 * subnetting drills can share one solver that tests check against textbook
 * examples.
 */

export interface Cidr {
  /** The network address (host bits zeroed). */
  network: number;
  prefix: number;
}

/** "192.168.1.10" → 3232235786. Throws on anything that isn't a dotted quad. */
export function parseIp(s: string): number {
  const parts = s.trim().split(".");
  if (parts.length !== 4) throw new Error(`not an IPv4 address: ${s}`);
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) throw new Error(`not an IPv4 address: ${s}`);
    n = n * 256 + Number(p);
  }
  return n;
}

export function formatIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
}

/** The subnet mask for a prefix length, e.g. 26 → 255.255.255.192. */
export function maskOf(prefix: number): number {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`bad prefix /${prefix}`);
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** "10.0.2.77/24" → { network: 10.0.2.0, prefix: 24 } (host bits are dropped). */
export function parseCidr(s: string): Cidr {
  const [ip, len] = s.split("/");
  if (len === undefined || !/^\d{1,2}$/.test(len)) throw new Error(`not a CIDR block: ${s}`);
  const prefix = Number(len);
  return { network: (parseIp(ip) & maskOf(prefix)) >>> 0, prefix };
}

export function formatCidr(c: Cidr): string {
  return `${formatIp(c.network)}/${c.prefix}`;
}

export function broadcastOf(c: Cidr): number {
  return (c.network | (~maskOf(c.prefix) >>> 0)) >>> 0;
}

/** Addresses in the block, including network and broadcast. */
export function blockSize(prefix: number): number {
  return 2 ** (32 - prefix);
}

/**
 * Assignable host addresses: 2^(32−p) − 2, except /31 point-to-point links
 * (RFC 3021) which use both addresses and /32 host routes which have one.
 */
export function usableHosts(prefix: number): number {
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return blockSize(prefix) - 2;
}

/** First and last assignable host addresses. */
export function hostRange(c: Cidr): [number, number] {
  if (c.prefix >= 31) return [c.network, broadcastOf(c)];
  return [c.network + 1, broadcastOf(c) - 1];
}

export function contains(c: Cidr, ip: number): boolean {
  return ((ip & maskOf(c.prefix)) >>> 0) === c.network;
}

export function overlaps(a: Cidr, b: Cidr): boolean {
  return contains(a, b.network) || contains(b, a.network);
}

/** RFC 1918 private ranges. */
export const PRIVATE_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map(parseCidr);

export function isPrivate(ip: number): boolean {
  return PRIVATE_RANGES.some((r) => contains(r, ip));
}
