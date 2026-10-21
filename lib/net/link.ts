/**
 * Link-layer solvers: line encoding, framing (byte and bit stuffing), CSMA/CD
 * with binary exponential backoff, ALOHA throughput and Ethernet frame sizes.
 * The question generators in `content/questions/linkGenerators.ts` are
 * answered by these, and tests check them against Kurose & Ross, Tanenbaum
 * and the IEEE 802.3 numbers.
 */

/**
 * Manchester, one bit = two half-bit levels. Convention (G. E. Thomas): a 1
 * is low then high ("01"), a 0 is high then low ("10"). IEEE 802.3 uses the
 * opposite, so questions always state the convention.
 */
export function manchester(bits: string): string {
  return [...bits].map((b) => (b === "1" ? "01" : "10")).join("");
}

/** Differential Manchester: always a mid-bit transition; a 0 also flips at the start of the bit, a 1 does not. */
export function differentialManchester(bits: string, startLevel: "0" | "1" = "0"): string {
  let level = startLevel;
  let out = "";
  for (const b of bits) {
    if (b === "0") level = level === "0" ? "1" : "0";
    out += level;
    level = level === "0" ? "1" : "0";
    out += level;
  }
  return out;
}

/** NRZ-I: a 1 toggles the level, a 0 holds it. */
export function nrzi(bits: string, startLevel: "0" | "1" = "0"): string {
  let level = startLevel;
  let out = "";
  for (const b of bits) {
    if (b === "1") level = level === "0" ? "1" : "0";
    out += level;
  }
  return out;
}

/** Signal changes in a level string (adjacent half-bits that differ). */
export function transitions(levels: string): number {
  let n = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] !== levels[i - 1]) n++;
  return n;
}

/** Bit stuffing (HDLC): after five consecutive 1s the sender inserts a 0. */
export function bitStuff(bits: string): string {
  let out = "";
  let run = 0;
  for (const b of bits) {
    out += b;
    run = b === "1" ? run + 1 : 0;
    if (run === 5) {
      out += "0";
      run = 0;
    }
  }
  return out;
}

export function bitUnstuff(bits: string): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < bits.length; i++) {
    out += bits[i];
    run = bits[i] === "1" ? run + 1 : 0;
    if (run === 5) {
      i++; // the stuffed 0
      run = 0;
    }
  }
  return out;
}

export const FLAG = 0x7e;
export const ESC = 0x7d;

/** Byte stuffing (Tanenbaum's scheme): an ESC goes in front of every FLAG and ESC byte in the payload. */
export function byteStuff(bytes: readonly number[]): number[] {
  return bytes.flatMap((b) => (b === FLAG || b === ESC ? [ESC, b] : [b]));
}

export function byteUnstuff(bytes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === ESC) i++;
    out.push(bytes[i]);
  }
  return out;
}

/** CSMA/CD: after the n-th collision a station picks K uniformly from 0 … 2^min(n, 10) − 1 slots (gives up after 16 attempts). */
export function backoffChoices(collisions: number): number {
  return 2 ** Math.min(collisions, 10);
}

/** The longest backoff in slots after the n-th collision. */
export function maxBackoffSlots(collisions: number): number {
  return backoffChoices(collisions) - 1;
}

/**
 * The smallest frame (bits) that lets a sender still be transmitting when a
 * collision comes back from the far end of the cable: L ≥ 2 · tprop · R.
 */
export function minFrameBits(rateBps: number, lengthM: number, speedMps: number): number {
  return (2 * lengthM * rateBps) / speedMps;
}

/** Slotted ALOHA throughput S = G·e^−G (frames per slot at offered load G). */
export function slottedAloha(g: number): number {
  return g * Math.exp(-g);
}

/** Pure ALOHA throughput S = G·e^−2G. */
export function pureAloha(g: number): number {
  return g * Math.exp(-2 * g);
}

/** Probability a station's frame gets through a slotted-ALOHA slot when N stations each send with probability p. */
export function slottedSuccess(n: number, p: number): number {
  return n * p * (1 - p) ** (n - 1);
}

export const ETHERNET = {
  preamble: 8,
  header: 14,
  fcs: 4,
  ifg: 12,
  minPayload: 46,
  maxPayload: 1500,
} as const;

/** On-the-wire frame size in bytes (header + padded payload + FCS), without preamble or gap. */
export function ethernetFrameBytes(payload: number): number {
  return ETHERNET.header + Math.max(payload, ETHERNET.minPayload) + ETHERNET.fcs;
}

/** Fraction of line time that carries payload: payload / (preamble + frame + inter-frame gap). */
export function ethernetEfficiency(payload: number): number {
  return payload / (ETHERNET.preamble + ethernetFrameBytes(payload) + ETHERNET.ifg);
}
