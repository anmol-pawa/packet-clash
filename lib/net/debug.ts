/**
 * Debugging with captures and tools (ROADMAP 5.8): curl timing phases, traceroute/mtr hop reading,
 * MSS and PMTUD black holes, and ss queue diagnosis.
 */

export interface RequestPhases {
  /** DNS lookup, ms. */
  dns: number;
  /** TCP connect (one RTT), ms. */
  connect: number;
  /** TLS handshake, ms. */
  tls: number;
  /** Server think time until the first byte, ms (curl's starttransfer minus pretransfer). */
  server: number;
  /** Time to download the body, ms. */
  download: number;
}

export const PHASE_NAMES = ["dns", "connect", "tls", "server", "download"] as const;
export type PhaseName = (typeof PHASE_NAMES)[number];

/** curl's `time_starttransfer`: everything up to the first response byte (excludes the download). */
export function timeToFirstByteMs(p: RequestPhases): number {
  return p.dns + p.connect + p.tls + p.server;
}

/** curl's `time_total`. */
export function totalMs(p: RequestPhases): number {
  return timeToFirstByteMs(p) + p.download;
}

/** The phase that contributes most to the total (first one wins a tie). */
export function slowestPhase(p: RequestPhases): PhaseName {
  return PHASE_NAMES.reduce((best, n) => (p[n] > p[best] ? n : best), PHASE_NAMES[0]);
}

/** Index (0-based) of the hop whose RTT rises most over the previous hop; hop 0 compares against 0. */
export function biggestJumpHop(rtts: readonly number[]): number {
  let best = 0;
  let bestJump = -Infinity;
  rtts.forEach((r, i) => {
    const jump = r - (i === 0 ? 0 : rtts[i - 1]);
    if (jump > bestJump) {
      bestJump = jump;
      best = i;
    }
  });
  return best;
}

/**
 * mtr loss reading: loss that shows at one hop but not at later hops is ICMP rate limiting by that
 * router (the data plane is fine); loss that persists to the final hop is real.
 */
export function lossIsReal(hopLoss: readonly number[], hop: number): boolean {
  return hopLoss.slice(hop).every((l) => l > 0);
}

/** TCP MSS for a link MTU over IPv4 (20 B IP + 20 B TCP, no options). */
export function mssForMtu(mtu: number): number {
  return mtu - 40;
}

/** Largest IPv4 packet that fits a path: the smallest link MTU. */
export function pathMtu(mtus: readonly number[]): number {
  return Math.min(...mtus);
}

/**
 * PMTUD black hole: with DF set, a full-size segment bigger than the path MTU is dropped and the
 * router's ICMP "fragmentation needed" is the only signal. If ICMP is filtered the sender never
 * shrinks, so small packets (handshake, ACKs) work while full-size transfers hang.
 */
export function pmtudOutcome(senderMtu: number, pathMtuBytes: number, icmpAllowed: boolean): "fits" | "adapts" | "blackhole" {
  if (senderMtu <= pathMtuBytes) return "fits";
  return icmpAllowed ? "adapts" : "blackhole";
}

/** Which side is slow, from `ss -tn` Recv-Q / Send-Q on one endpoint. */
export function ssDiagnosis(recvQ: number, sendQ: number): "app-not-reading" | "peer-or-network-slow" | "healthy" {
  if (recvQ > 0 && recvQ >= sendQ) return "app-not-reading";
  if (sendQ > 0) return "peer-or-network-slow";
  return "healthy";
}

/** Retransmission rate (%) from a capture: retransmitted segments over all data segments sent. */
export function retransmitPercent(retransmits: number, dataSegments: number): number {
  return (retransmits / dataSegments) * 100;
}

/** TCP fast retransmit fires on this many duplicate ACKs (RFC 5681). */
export const FAST_RETRANSMIT_DUPACKS = 3;
