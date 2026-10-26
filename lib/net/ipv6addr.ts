/**
 * CCNA 4.5 IPv6 addressing: address-type classification, EUI-64 interface IDs,
 * solicited-node multicast and /48 → /64 subnet IDs. Builds on `lib/net/ipv6`.
 */
import { compressIpv6, parseIpv6 } from "./ipv6";

export type Ipv6Type = "unspecified" | "loopback" | "link-local" | "unique-local" | "multicast" | "global-unicast" | "other";

/** Classify by prefix: ::/128, ::1/128, fe80::/10, fc00::/7, ff00::/8, 2000::/3. */
export function ipv6Type(addr: string): Ipv6Type {
  const g = parseIpv6(addr);
  if (g.every((x) => x === 0)) return "unspecified";
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return "loopback";
  if ((g[0] & 0xffc0) === 0xfe80) return "link-local";
  if ((g[0] & 0xfe00) === 0xfc00) return "unique-local";
  if ((g[0] & 0xff00) === 0xff00) return "multicast";
  if ((g[0] & 0xe000) === 0x2000) return "global-unicast";
  return "other";
}

/** "00:1A:2B:3C:4D:5E" (or "-" separated) → six bytes. Throws when malformed. */
export function parseMac(mac: string): number[] {
  const parts = mac.trim().split(/[:-]/);
  if (parts.length !== 6 || !parts.every((p) => /^[0-9a-fA-F]{2}$/.test(p))) throw new Error(`not a MAC address: ${mac}`);
  return parts.map((p) => parseInt(p, 16));
}

/** Modified EUI-64 interface ID: insert FF:FE in the middle and flip the universal/local bit. */
export function eui64InterfaceId(mac: string): number[] {
  const b = parseMac(mac);
  const id = [b[0] ^ 0x02, b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
  return [(id[0] << 8) | id[1], (id[2] << 8) | id[3], (id[4] << 8) | id[5], (id[6] << 8) | id[7]];
}

/** The EUI-64 interface ID written as four groups, e.g. "21a:2bff:fe3c:4d5e". */
export function eui64Text(mac: string): string {
  return eui64InterfaceId(mac)
    .map((x) => x.toString(16))
    .join(":");
}

/** Link-local address SLAAC/EUI-64 builds on an interface: fe80::/64 + EUI-64. */
export function linkLocalFromMac(mac: string): string {
  return compressIpv6(`fe80:0:0:0:${eui64Text(mac)}`);
}

/** Global address from a /64 prefix (first four groups, e.g. "2001:db8:acad:1") and a MAC. */
export function slaacAddress(prefix64: string, mac: string): string {
  return compressIpv6(`${prefix64}:${eui64Text(mac)}`);
}

/** Solicited-node multicast: ff02::1:ff00:0/104 plus the low 24 bits of the unicast address. */
export function solicitedNode(addr: string): string {
  const g = parseIpv6(addr);
  const hex = (n: number) => n.toString(16);
  return compressIpv6(`ff02:0:0:0:0:1:ff${(g[6] & 0xff).toString(16).padStart(2, "0")}:${hex(g[7])}`);
}

/**
 * The /64 subnet number `n` (decimal, 0–65535) carved from a /48 whose first
 * three groups are `prefix48` (e.g. "2001:db8:acad"): the subnet ID is group 4.
 */
export function subnet64(prefix48: string, n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(`subnet ID out of range: ${n}`);
  return `${compressIpv6(`${prefix48}:${n.toString(16)}:0:0:0:0`)}/64`;
}

/** Number of /64 subnets available inside a /len prefix (len ≤ 64). */
export function subnetCount64(len: number): number {
  if (!Number.isInteger(len) || len < 0 || len > 64) throw new Error(`prefix length out of range: ${len}`);
  return 2 ** (64 - len);
}
