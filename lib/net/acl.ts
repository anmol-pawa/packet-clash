/**
 * Cisco IOS access lists (CCNA 4.2): wildcard masks, standard and extended
 * entries, first-match evaluation with the implicit deny at the end, and the
 * placement rule. Pure, so the generators and tests share one solver.
 */
import { formatIp, maskOf, parseIp } from "./ipv4";

export type AclAction = "permit" | "deny";
export type AclProtocol = "ip" | "tcp" | "udp" | "icmp";

/** An address matcher: the bits where `wildcard` is 0 must equal `addr`. */
export interface AddrMatch {
  addr: number;
  wildcard: number;
}

export type PortMatch =
  | { op: "eq" | "gt" | "lt"; port: number }
  | { op: "range"; from: number; to: number };

export interface AclEntry {
  action: AclAction;
  protocol: AclProtocol;
  src: AddrMatch;
  dst: AddrMatch;
  /** Only tcp/udp entries can match on the destination port. */
  dstPort?: PortMatch;
  /** True for a standard ACL line, which looks at the source address only. */
  standard: boolean;
}

export interface AclPacket {
  protocol: Exclude<AclProtocol, "ip">;
  src: number;
  dst: number;
  dstPort?: number;
}

/** The wildcard mask for a prefix: the inverse of the subnet mask (/26 → 0.0.0.63). */
export function wildcardOf(prefix: number): number {
  return (~maskOf(prefix)) >>> 0;
}

/** The wildcard for a subnet mask given as a number. */
export function wildcardFromMask(mask: number): number {
  return (~mask) >>> 0;
}

/** True iff a wildcard is the inverse of a real subnet mask (ones only at the right). */
export function isContiguousWildcard(w: number): boolean {
  return ((w + 1) & w) >>> 0 === 0;
}

/** The prefix a contiguous wildcard stands for, or null for a pattern like 0.0.254.255. */
export function prefixOfWildcard(w: number): number | null {
  if (!isContiguousWildcard(w)) return null;
  let bits = 0;
  for (let x = w; x > 0; x = Math.floor(x / 2)) bits++;
  return 32 - bits;
}

/** How many addresses a wildcard matches: 2 to the number of "don't care" bits. */
export function wildcardMatchCount(w: number): number {
  let ones = 0;
  for (let i = 0; i < 32; i++) if (((w >>> i) & 1) === 1) ones++;
  return 2 ** ones;
}

export function matchesAddr(m: AddrMatch, ip: number): boolean {
  return ((ip ^ m.addr) & ~m.wildcard) >>> 0 === 0;
}

const ANY: AddrMatch = { addr: 0, wildcard: 0xffffffff };

/** Well-known service names IOS accepts after `eq`. */
export const PORT_NAMES: Readonly<Record<string, number>> = {
  ftp: 21,
  ssh: 22,
  telnet: 23,
  smtp: 25,
  domain: 53,
  www: 80,
  pop3: 110,
  ntp: 123,
  snmp: 161,
  https: 443,
};

function parsePort(tok: string): number {
  if (tok in PORT_NAMES) return PORT_NAMES[tok];
  if (!/^\d+$/.test(tok) || Number(tok) > 65535) throw new Error(`bad port: ${tok}`);
  return Number(tok);
}

/** Reads one address matcher (`any`, `host a.b.c.d` or `a.b.c.d w.x.y.z`) and returns it with the tokens used. */
function readAddr(t: string[], i: number): [AddrMatch, number] {
  if (t[i] === "any") return [ANY, i + 1];
  if (t[i] === "host") return [{ addr: parseIp(t[i + 1]), wildcard: 0 }, i + 2];
  const addr = parseIp(t[i]);
  const wildcard = parseIp(t[i + 1]);
  return [{ addr: (addr & ~wildcard) >>> 0, wildcard }, i + 2];
}

function readPort(t: string[], i: number): [PortMatch | undefined, number] {
  const op = t[i];
  if (op === "eq" || op === "gt" || op === "lt") return [{ op, port: parsePort(t[i + 1]) }, i + 2];
  if (op === "range") return [{ op: "range", from: parsePort(t[i + 1]), to: parsePort(t[i + 2]) }, i + 3];
  return [undefined, i];
}

/**
 * Parses one ACL line as typed under `ip access-list`:
 * `permit 10.1.1.0 0.0.0.255` (standard) or
 * `deny tcp any host 10.2.2.2 eq www` (extended).
 */
export function parseAclLine(line: string): AclEntry {
  const t = line.trim().toLowerCase().split(/\s+/);
  if (t[0] !== "permit" && t[0] !== "deny") throw new Error(`not an ACL line: ${line}`);
  const action = t[0];
  const protocols: readonly string[] = ["ip", "tcp", "udp", "icmp"];
  if (!protocols.includes(t[1])) {
    const [src, end] = readAddr(t, 1);
    if (end !== t.length) throw new Error(`trailing text in standard ACL line: ${line}`);
    return { action, protocol: "ip", src, dst: ANY, standard: true };
  }
  const protocol = t[1] as AclProtocol;
  const [src, afterSrc] = readAddr(t, 2);
  const [dst, afterDst] = readAddr(t, afterSrc);
  const [dstPort, end] = readPort(t, afterDst);
  if (end !== t.length) throw new Error(`trailing text in ACL line: ${line}`);
  if (dstPort && protocol !== "tcp" && protocol !== "udp") throw new Error(`ports need tcp or udp: ${line}`);
  return { action, protocol, src, dst, dstPort, standard: false };
}

function portMatches(m: PortMatch, port: number): boolean {
  switch (m.op) {
    case "eq":
      return port === m.port;
    case "gt":
      return port > m.port;
    case "lt":
      return port < m.port;
    case "range":
      return port >= m.from && port <= m.to;
  }
}

/** Does one line match the packet? Standard lines look at the source address alone. */
export function entryMatches(e: AclEntry, p: AclPacket): boolean {
  if (!matchesAddr(e.src, p.src)) return false;
  if (e.standard) return true;
  if (e.protocol !== "ip" && e.protocol !== p.protocol) return false;
  if (!matchesAddr(e.dst, p.dst)) return false;
  if (e.dstPort) return p.dstPort !== undefined && portMatches(e.dstPort, p.dstPort);
  return true;
}

export interface AclVerdict {
  action: AclAction;
  /** Zero-based index of the first matching line, or null for the implicit deny. */
  line: number | null;
}

/** First match wins; a packet that matches nothing hits the implicit `deny ip any any`. */
export function evaluateAcl(acl: readonly AclEntry[], p: AclPacket): AclVerdict {
  for (let i = 0; i < acl.length; i++) if (entryMatches(acl[i], p)) return { action: acl[i].action, line: i };
  return { action: "deny", line: null };
}

/** Where to apply an ACL: extended near the source, standard near the destination. */
export function placement(kind: "standard" | "extended"): "source" | "destination" {
  return kind === "standard" ? "destination" : "source";
}

/** The ACL number ranges IOS uses to tell the two kinds apart. */
export function aclKindOfNumber(n: number): "standard" | "extended" | null {
  if ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999)) return "standard";
  if ((n >= 100 && n <= 199) || (n >= 2000 && n <= 2699)) return "extended";
  return null;
}

/** Writes an address matcher the way IOS shows it. */
export function formatAddr(m: AddrMatch): string {
  if (m.wildcard === 0xffffffff) return "any";
  if (m.wildcard === 0) return `host ${formatIp(m.addr)}`;
  return `${formatIp(m.addr)} ${formatIp(m.wildcard)}`;
}

const portText = (m: PortMatch): string => {
  const name = (n: number) => Object.entries(PORT_NAMES).find(([, v]) => v === n)?.[0] ?? String(n);
  return m.op === "range" ? `range ${name(m.from)} ${name(m.to)}` : `${m.op} ${name(m.port)}`;
};

/** An entry as one line of configuration (round-trips through `parseAclLine`). */
export function formatAclLine(e: AclEntry): string {
  if (e.standard) return `${e.action} ${formatAddr(e.src)}`;
  const port = e.dstPort ? ` ${portText(e.dstPort)}` : "";
  return `${e.action} ${e.protocol} ${formatAddr(e.src)} ${formatAddr(e.dst)}${port}`;
}
