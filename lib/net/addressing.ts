/**
 * Subnetting beyond one block: splitting, VLSM allocation, route aggregation,
 * longest-prefix match and IPv4 fragmentation. Built on `ipv4.ts`, pure, and
 * checked by tests against Kurose & Ross and Forouzan worked examples.
 */
import { blockSize, broadcastOf, contains, maskOf, usableHosts, type Cidr } from "./ipv4";

/** Split a block into 2^(newPrefix − prefix) equal subnets, in address order. */
export function splitSubnets(block: Cidr, newPrefix: number): Cidr[] {
  if (newPrefix < block.prefix || newPrefix > 32) throw new Error(`cannot split /${block.prefix} into /${newPrefix}`);
  const step = blockSize(newPrefix);
  return Array.from({ length: 2 ** (newPrefix - block.prefix) }, (_, i) => ({ network: (block.network + i * step) >>> 0, prefix: newPrefix }));
}

/** The longest prefix (smallest block) with at least `hosts` assignable addresses. */
export function prefixForHosts(hosts: number): number {
  let p = 30;
  while (p > 0 && usableHosts(p) < hosts) p--;
  return p;
}

export interface VlsmAllocation {
  hosts: number;
  subnet: Cidr;
}

/**
 * VLSM: allocate the biggest requirement first at the next aligned address, so
 * blocks never overlap and waste stays small. Returns null if it doesn't fit.
 * Results are in the same order as `requirements`.
 */
export function vlsmAllocate(block: Cidr, requirements: readonly number[]): VlsmAllocation[] | null {
  const order = requirements.map((hosts, i) => ({ hosts, i })).sort((a, b) => b.hosts - a.hosts || a.i - b.i);
  const out: VlsmAllocation[] = new Array(requirements.length);
  let next = block.network;
  const end = broadcastOf(block);
  for (const { hosts, i } of order) {
    const prefix = prefixForHosts(hosts);
    const subnet = { network: next, prefix };
    if (prefix < block.prefix || broadcastOf(subnet) > end) return null;
    out[i] = { hosts, subnet };
    next = (broadcastOf(subnet) + 1) >>> 0;
  }
  return out;
}

/** The smallest single block that covers every given block (the aggregate route). */
export function aggregate(blocks: readonly Cidr[]): Cidr {
  const lo = Math.min(...blocks.map((b) => b.network));
  const hi = Math.max(...blocks.map((b) => broadcastOf(b)));
  let prefix = 32;
  while (prefix > 0 && ((lo & maskOf(prefix)) >>> 0) !== ((hi & maskOf(prefix)) >>> 0)) prefix--;
  return { network: (lo & maskOf(prefix)) >>> 0, prefix };
}

/** Does the aggregate cover exactly these blocks, with no address outside them? */
export function aggregateIsExact(blocks: readonly Cidr[]): boolean {
  const total = blocks.reduce((n, b) => n + blockSize(b.prefix), 0);
  return total === blockSize(aggregate(blocks).prefix);
}

export interface Route {
  prefix: Cidr;
  nextHop: string;
}

/** Longest-prefix match: the matching route with the greatest prefix length (or undefined). */
export function longestPrefixMatch(table: readonly Route[], ip: number): Route | undefined {
  let best: Route | undefined;
  for (const r of table) if (contains(r.prefix, ip) && (!best || r.prefix.prefix > best.prefix.prefix)) best = r;
  return best;
}

export interface Fragment {
  /** Total length field (header + data) in bytes. */
  totalLength: number;
  /** Fragment offset field, in 8-byte units. */
  offset: number;
  /** More-fragments flag. */
  more: boolean;
}

/**
 * Fragment a datagram of `totalLength` bytes (20-byte header, no options) for a
 * link whose MTU is `mtu`. Each fragment's data is a multiple of 8 bytes except
 * the last, because the offset field counts 8-byte units.
 */
export function fragment(totalLength: number, mtu: number, header = 20): Fragment[] {
  const data = totalLength - header;
  const per = Math.floor((mtu - header) / 8) * 8;
  if (per <= 0) throw new Error("MTU too small");
  const out: Fragment[] = [];
  for (let sent = 0; sent < data; sent += per) {
    const len = Math.min(per, data - sent);
    out.push({ totalLength: len + header, offset: sent / 8, more: sent + len < data });
  }
  return out;
}
