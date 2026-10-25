/**
 * CCNA network fundamentals II: cabling, PoE budgets, Ethernet frame sizes and
 * reading `ping` / `traceroute` output. Quiz answers that involve these are
 * computed here and checked against Odom's CCNA 200-301 Official Cert Guide
 * and IEEE 802.3 in tests.
 */

/** Longest legal copper run for 10/100/1000BASE-T Ethernet, in metres. */
export const UTP_MAX_METERS = 100;

/** Minimum and maximum Ethernet frame sizes in bytes (header + payload + FCS), without 802.1Q or jumbo frames. */
export const MIN_FRAME = 64;
export const MAX_FRAME = 1518;

export type FrameClass = "runt" | "normal" | "giant";

/** Runts are shorter than 64 bytes (collision fragments, duplex mismatch), giants longer than 1518 (no jumbo frames configured). */
export function frameClass(bytes: number): FrameClass {
  if (!Number.isInteger(bytes) || bytes < 1) throw new Error(`bad frame size ${bytes}`);
  return bytes < MIN_FRAME ? "runt" : bytes > MAX_FRAME ? "giant" : "normal";
}

export interface PoeStandard {
  id: "af" | "at" | "bt3" | "bt4";
  name: string;
  /** Power a switch port can source (PSE), in watts. */
  pse: number;
  /** Power guaranteed at the powered device (PD) after cable loss, in watts. */
  pd: number;
}

/** IEEE 802.3af / at / bt: power at the port vs at the device. */
export const POE_STANDARDS: readonly PoeStandard[] = [
  { id: "af", name: "802.3af (PoE, Type 1)", pse: 15.4, pd: 12.95 },
  { id: "at", name: "802.3at (PoE+, Type 2)", pse: 30, pd: 25.5 },
  { id: "bt3", name: "802.3bt Type 3 (PoE++)", pse: 60, pd: 51 },
  { id: "bt4", name: "802.3bt Type 4 (PoE++)", pse: 100, pd: 71.3 },
];

/** Devices a switch's PoE budget can power if every port draws the standard's full per-port maximum. */
export function poeDevices(budgetWatts: number, standard: PoeStandard["id"]): number {
  const s = POE_STANDARDS.find((x) => x.id === standard);
  if (!s) throw new Error(`unknown PoE standard ${standard}`);
  return Math.floor(budgetWatts / s.pse + 1e-9);
}

export type CableDevice = "PC" | "Server" | "Router" | "Wireless AP" | "Switch" | "Hub";
export type Cable = "straight-through" | "crossover";

/**
 * Pairs a wired Ethernet interface transmits on: PCs, servers, routers and
 * access points send on pins 1,2 (MDI); switches and hubs send on 3,6 (MDI-X).
 */
const SENDS_ON_12: ReadonlySet<CableDevice> = new Set(["PC", "Server", "Router", "Wireless AP"]);

/** The cable a link needs with auto-MDI/MDIX off: like devices need a crossover, unlike devices a straight-through. */
export function cableFor(a: CableDevice, b: CableDevice): Cable {
  return SENDS_ON_12.has(a) === SENDS_ON_12.has(b) ? "crossover" : "straight-through";
}

export type PingCode = "!" | "." | "U" | "N" | "M" | "Q" | "?";

export interface PingResult {
  sent: number;
  replies: number;
  timeouts: number;
  unreachables: number;
  /** Cisco's "Success rate is N percent", rounded down. */
  successPercent: number;
}

/** Reads the symbol line of an IOS ping (`!!.!!`): `!` reply, `.` timeout, `U`/`N` unreachable. */
export function parsePing(symbols: string): PingResult {
  const s = symbols.trim();
  if (!/^[!.UNMQ?]+$/.test(s)) throw new Error(`bad ping line ${symbols}`);
  const count = (re: RegExp) => (s.match(re) ?? []).length;
  const replies = count(/!/g);
  return {
    sent: s.length,
    replies,
    timeouts: count(/\./g),
    unreachables: count(/[UN]/g),
    successPercent: Math.floor((replies * 100) / s.length),
  };
}

/** A realistic IOS ping transcript for a symbol line (round-trip times only when something answered). */
export function pingTranscript(target: string, symbols: string, rtt = { min: 1, avg: 2, max: 4 }): string {
  const r = parsePing(symbols);
  const tail = r.replies > 0 ? `, round-trip min/avg/max = ${rtt.min}/${rtt.avg}/${rtt.max} ms` : "";
  return [
    `R1# ping ${target}`,
    "Type escape sequence to abort.",
    `Sending ${r.sent}, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`,
    symbols,
    `Success rate is ${r.successPercent} percent (${r.replies}/${r.sent})${tail}`,
  ].join("\n");
}

export interface TraceHop {
  hop: number;
  /** The router's address, or null for `* * *` (no reply). */
  address: string | null;
}

export interface TraceResult {
  hops: TraceHop[];
  /** The highest hop number that answered (0 if none did). */
  lastResponding: number;
  /** True if the final hop is the destination. */
  reached: boolean;
}

/** Reads an IOS traceroute: lines like `  2 10.2.2.2 8 msec 8 msec 8 msec` or `  3  *  *  *`. */
export function parseTraceroute(text: string, destination: string): TraceResult {
  const hops: TraceHop[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const addr = /^(\d+\.\d+\.\d+\.\d+)\b/.exec(m[2].trim());
    hops.push({ hop: Number(m[1]), address: addr ? addr[1] : null });
  }
  const answered = hops.filter((h) => h.address !== null);
  const last = answered.length ? answered[answered.length - 1] : null;
  return { hops, lastResponding: last ? last.hop : 0, reached: last !== null && last.address === destination };
}

/** A realistic IOS traceroute transcript: `path` answers in order, then `silent` hops of `* * *`. */
export function tracerouteTranscript(destination: string, path: readonly string[], silent: number): string {
  const lines = [`R1# traceroute ${destination}`, "Type escape sequence to abort.", `Tracing the route to ${destination}`, ""];
  path.forEach((ip, i) => lines.push(`  ${i + 1} ${ip} ${(i + 1) * 4} msec ${(i + 1) * 4} msec ${(i + 1) * 4} msec`));
  for (let i = 0; i < silent; i++) lines.push(`  ${path.length + i + 1}  *  *  *`);
  return lines.join("\n");
}

/** Largest ICMP payload that fits a link `mtu` in one unfragmented packet: MTU − 20 (IPv4) − 8 (ICMP). */
export function maxPingPayload(mtu: number): number {
  return mtu - 20 - 8;
}
