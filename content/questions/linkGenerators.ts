/**
 * Gym 2's link-layer problems: Manchester encoding, bit and byte stuffing,
 * CSMA/CD backoff and minimum frame size, ALOHA throughput and Ethernet
 * efficiency. Every answer comes from `lib/net/link`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import {
  ESC,
  FLAG,
  backoffChoices,
  bitStuff,
  byteStuff,
  differentialManchester,
  ethernetEfficiency,
  ethernetFrameBytes,
  manchester,
  maxBackoffSlots,
  minFrameBits,
  pureAloha,
  slottedAloha,
} from "@/lib/net/link";
import { randInt, rng } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const invert = (bits: string) => [...bits].map((b) => (b === "1" ? "0" : "1")).join("");
const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");

export const manchesterGen: Generator = {
  id: "gen-manchester",
  topic: "link",
  type: "PHYSICAL",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    // Mix of 0s and 1s with at least one of each, so every distractor really differs.
    let bits = "";
    do bits = Array.from({ length: 6 }, () => (r() < 0.5 ? "0" : "1")).join("");
    while (!bits.includes("0") || !bits.includes("1"));
    const answer = manchester(bits);
    const mcq = mcqChoices(r, answer, [
      invert(answer),
      [...bits].map((b) => b + b).join(""),
      differentialManchester(bits),
      [...answer].reverse().join(""),
    ]);
    return {
      id: `gen-manchester:${bits}`,
      kind: "mcq",
      topic: "link",
      type: "PHYSICAL",
      difficulty: 2,
      prompt: `A sender uses Manchester encoding where a 1 is low-then-high (written 01) and a 0 is high-then-low (10). Which half-bit levels does it send for ${bits}?`,
      ...mcq,
      explain: `Each bit becomes two half-bit levels with a transition in the middle: ${[...bits].map((b) => `${b} → ${b === "1" ? "01" : "10"}`).join(", ")}. That gives ${answer}. The guaranteed mid-bit edge lets the receiver recover the clock, at the cost of doubling the signalling rate. (IEEE 802.3 uses the opposite polarity, so exam questions always state the convention.)`,
    };
  },
};

export const bitStuffGen: Generator = {
  id: "gen-bit-stuffing",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    // Build the payload from runs so that long runs of 1s (the case that needs stuffing) are common.
    let bits = "";
    while (bits.length < 14) bits += (r() < 0.6 ? "1" : "0").repeat(randInt(r, 1, 7));
    bits = bits.slice(0, 16);
    const stuffed = bitStuff(bits);
    const extra = stuffed.length - bits.length;
    return {
      id: `gen-bit-stuffing:${bits}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `HDLC frames start and end with the flag 01111110, so the sender bit-stuffs the payload: it inserts a 0 after every five consecutive 1s. How many bits is the payload ${bits} after stuffing?`,
      answer: stuffed.length,
      unit: "bits",
      explain: `Scan left to right and add a 0 after each run of five 1s: ${bits} → ${stuffed}. That is ${extra} stuffed bit${extra === 1 ? "" : "s"}, ${bits.length} + ${extra} = ${stuffed.length}. The receiver deletes the 0 that follows five 1s, so six 1s in a row can only be a flag.`,
    };
  },
};

export const byteStuffGen: Generator = {
  id: "gen-byte-stuffing",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 6, 10);
    const bytes = Array.from({ length: n }, () => pick(r, [FLAG, ESC, 0x41, 0x5a, 0x10, 0xc3, 0x00, 0x7e, 0x7d, 0x2f, 0x99]));
    const stuffed = byteStuff(bytes);
    const specials = stuffed.length - n;
    return {
      id: `gen-byte-stuffing:${bytes.map(hex).join("")}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `A byte-oriented link marks frames with FLAG = 0x7E and escapes with ESC = 0x7D. The sender puts an ESC in front of every FLAG or ESC byte in the payload. How many bytes does the payload ${bytes.map(hex).join(" ")} take after stuffing (not counting the frame's own flags)?`,
      answer: stuffed.length,
      unit: "bytes",
      explain: `${specials} byte${specials === 1 ? " is" : "s are"} 7E or 7D, and each gets an ESC before it: ${stuffed.map(hex).join(" ")}. That is ${n} + ${specials} = ${stuffed.length} bytes. The receiver drops each ESC and keeps the byte after it as data.`,
    };
  },
};

export const backoffGen: Generator = {
  id: "gen-csma-backoff",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 1, 12);
    const choices = backoffChoices(n);
    const asWait = r() < 0.5;
    const answer = asWait ? maxBackoffSlots(n) * 512 : choices;
    return {
      id: `gen-csma-backoff:${n}:${asWait ? "wait" : "values"}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: asWait
        ? `Ethernet's CSMA/CD has just had collision number ${n} for the same frame. After a collision a station waits K × 512 bit times with K chosen at random from 0 … 2^min(n, 10) − 1. What is the longest it can possibly wait, in bit times?`
        : `Ethernet's CSMA/CD has just had collision number ${n} for the same frame. After the n-th collision a station picks K at random from 0 … 2^min(n, 10) − 1. How many different values can K take?`,
      answer,
      ...(asWait ? { unit: "bit times" } : {}),
      explain: `Binary exponential backoff doubles the range with each collision, but stops doubling at n = 10 (the range is capped at 2^10 = 1024 values), and the station gives up after 16 attempts. After collision ${n} there are 2^min(${n}, 10) = ${choices} values for K, 0 … ${choices - 1}.${asWait ? ` The longest wait is ${choices - 1} × 512 = ${answer} bit times.` : ""}`,
    };
  },
};

export const minFrameGen: Generator = {
  id: "gen-min-frame",
  topic: "link",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const rateMbps = pick(r, [5, 10, 10, 100, 100, 1000]);
    const lengthM = pick(r, [500, 1000, 1500, 2000, 2500, 3000]);
    const bits = minFrameBits(rateMbps * 1e6, lengthM, 2e8);
    return {
      id: `gen-min-frame:${rateMbps}:${lengthM}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 3,
      prompt: `A shared CSMA/CD bus is ${lengthM} m long and runs at ${rateMbps} Mbps. Signals travel at 2 × 10⁸ m/s. What is the smallest frame that lets a sender still be transmitting when a collision from the far end of the cable reaches it?`,
      answer: bits,
      unit: "bits",
      explain: `A sender must still be sending after a round trip: L/R ≥ 2 · tprop. tprop = ${lengthM} / (2×10⁸) = ${(lengthM / 2e8) * 1e6} µs, so the round trip is ${(lengthM / 1e8) * 1e6} µs. L ≥ 2 · tprop · R = ${(lengthM / 1e8) * 1e6} µs × ${rateMbps} Mbps = ${bits} bits. (Real Ethernet fixes the minimum at 512 bits, 64 bytes, to cover a 2.5 km maximum with repeaters.)`,
    };
  },
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export const alohaGen: Generator = {
  id: "gen-aloha",
  topic: "link",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const slotted = r() < 0.5;
    const g = slotted ? pick(r, [0.5, 1, 1.5, 2, 3]) : pick(r, [0.25, 0.5, 1, 1.5]);
    const s = round3(slotted ? slottedAloha(g) : pureAloha(g));
    return {
      id: `gen-aloha:${slotted ? "slotted" : "pure"}:${g}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 3,
      prompt: `In ${slotted ? "slotted" : "pure"} ALOHA the stations together offer an average of G = ${g} frames per frame time. The throughput is S = G·e${slotted ? "^−G" : "^−2G"}. What is S, in frames per frame time (3 decimal places)?`,
      answer: s,
      tolerance: 0.0015,
      explain: slotted
        ? `Slotted ALOHA: a frame succeeds if nobody else sends in its slot, e^−G. S = ${g} × e^−${g} = ${s.toFixed(3)}. The maximum is at G = 1: 1/e ≈ 0.368. Pure ALOHA, with its vulnerable period of two frame times, tops out at 1/(2e) ≈ 0.184 at G = 0.5.`
        : `Pure ALOHA: a frame collides with any send in the previous or next frame time, so success has probability e^−2G. S = ${g} × e^−${2 * g} = ${s.toFixed(3)}. The maximum is at G = 0.5: 1/(2e) ≈ 0.184, half of slotted ALOHA's 1/e ≈ 0.368.`,
    };
  },
};

export const ethernetEfficiencyGen: Generator = {
  id: "gen-ethernet-efficiency",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const payload = pick(r, [20, 46, 100, 200, 512, 576, 1000, 1200, 1400, 1500]);
    const frame = ethernetFrameBytes(payload);
    const wire = 8 + frame + 12;
    const pct = Math.round(ethernetEfficiency(payload) * 1000) / 10;
    return {
      id: `gen-ethernet-efficiency:${payload}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `An Ethernet II host sends ${payload} bytes of payload in one frame. Each frame also costs an 8-byte preamble, a 14-byte header, a 4-byte FCS and a 12-byte inter-frame gap, and payloads under 46 bytes are padded. What percentage of the line time carries payload? (1 decimal place)`,
      answer: pct,
      tolerance: 0.06,
      unit: "%",
      explain: `${payload < 46 ? `The payload is padded up to the 46-byte minimum. ` : ""}Bytes on the wire per frame: 8 + 14 + ${Math.max(payload, 46)} + 4 + 12 = ${wire}. Efficiency = ${payload} / ${wire} = ${pct}%. A full 1500-byte payload gives 1500 / 1538 ≈ 97.5%.`,
    } satisfies Question;
  },
};

export const LINK_GENERATORS: readonly Generator[] = [
  manchesterGen,
  bitStuffGen,
  byteStuffGen,
  backoffGen,
  minFrameGen,
  alohaGen,
  ethernetEfficiencyGen,
];
