/**
 * Gym 2's error-detection problems: parity, Hamming distance, the Internet
 * checksum, CRC and Hamming codes. Every answer comes from `lib/net/errors`,
 * and distractors are the classic slips: dividing without appending the
 * zeros, ordinary (carrying) arithmetic, forgetting to complement, odd parity
 * instead of even.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import {
  correctable,
  crc,
  crcOk,
  detectable,
  hammingCheckBits,
  hammingCoverage,
  hammingDistance,
  hammingEncode,
  hammingSyndrome,
  internetChecksum,
  mod2Divide,
  ones,
  onesComplementSum,
  parityBit,
} from "@/lib/net/errors";
import { randInt, rng, shuffled } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const randomBits = (r: () => number, n: number, leadingOne = false) =>
  Array.from({ length: n }, (_, i) => (leadingOne && i === 0 ? "1" : r() < 0.5 ? "0" : "1")).join("");

const flipAt = (bits: string, i: number) => bits.slice(0, i) + (bits[i] === "1" ? "0" : "1") + bits.slice(i + 1);
const invert = (bits: string) => [...bits].map((b) => (b === "1" ? "0" : "1")).join("");

/** A 16-bit word as 0x1F2E. */
export const hex16 = (w: number) => "0x" + w.toString(16).toUpperCase().padStart(4, "0");

/** CRC generators with an x⁰ term (so every single-bit and every burst up to r bits is caught). */
export const CRC_GENERATORS = ["1011", "1101", "1001", "10011", "11001", "10101"] as const;

/** Every r-bit string, for topping up distractors. */
const allBits = (r: number) => Array.from({ length: 2 ** r }, (_, i) => i.toString(2).padStart(r, "0"));

const xorLine = (gen: string, steps: ReturnType<typeof crc>["steps"]) =>
  steps.map((s) => `${s.before}⊕${gen}=${s.after}`).join(", ");

export const parityGen: Generator = {
  id: "gen-parity-bit",
  topic: "link",
  type: "PHYSICAL",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const data = randomBits(r, pick(r, [7, 8]));
    const even = r() < 0.6;
    const bit = parityBit(data, even);
    const n = ones(data);
    return {
      id: `gen-parity-bit:${data}:${even ? "even" : "odd"}`,
      kind: "numeric",
      topic: "link",
      type: "PHYSICAL",
      difficulty: 1,
      prompt: `A sender uses ${even ? "even" : "odd"} parity. What parity bit does it add to ${data}? (0 or 1)`,
      answer: bit,
      explain: `${data} has ${n} one${n === 1 ? "" : "s"}. ${even ? "Even" : "Odd"} parity makes the total ${even ? "even" : "odd"}, so the parity bit is ${bit} (${n + bit} ones in all). One parity bit catches any odd number of flipped bits, but two flips cancel out and slip through.`,
    };
  },
};

export const distanceGen: Generator = {
  id: "gen-hamming-distance",
  topic: "link",
  type: "LINK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const a = randomBits(r, 8);
    let b = a;
    const flips = randInt(r, 1, 5);
    const order = shuffled(r, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, flips);
    for (const i of order) b = flipAt(b, i);
    const d = hammingDistance(a, b);
    return {
      id: `gen-hamming-distance:${a}:${b}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 1,
      prompt: `What is the Hamming distance between ${a} and ${b}?`,
      answer: d,
      explain: `XOR them: ${a} ⊕ ${b} = ${[...a].map((c, i) => (c === b[i] ? "0" : "1")).join("")}, which has ${d} one${d === 1 ? "" : "s"}. The Hamming distance is the number of bit positions where two words differ.`,
    };
  },
};

export const capabilityGen: Generator = {
  id: "gen-code-capability",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const dmin = randInt(r, 2, 9);
    const fix = r() < 0.5;
    const answer = fix ? correctable(dmin) : detectable(dmin);
    return {
      id: `gen-code-capability:${dmin}:${fix ? "correct" : "detect"}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `A code's minimum Hamming distance is ${dmin}. How many bit errors per codeword can it always ${fix ? "correct" : "detect"}?`,
      answer,
      explain: `With dmin = ${dmin}, up to ${detectable(dmin)} flips can never turn one codeword into another, so it detects d − 1 = ${detectable(dmin)}. To correct, the damaged word must still be closer to the original than to any other codeword, so it corrects ⌊(d − 1)/2⌋ = ${correctable(dmin)}.`,
    };
  },
};

export const checksumGen: Generator = {
  id: "gen-internet-checksum",
  topic: "link",
  type: "TRANSPORT",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const words = Array.from({ length: 3 }, () => randInt(r, 0x1000, 0xffff));
    const sum = onesComplementSum(words);
    const cs = internetChecksum(words);
    const raw = words.reduce((a, b) => a + b, 0);
    const carries = raw >>> 16;
    const answer = hex16(cs);
    const mcq = mcqChoices(r, answer, [
      hex16(sum),
      hex16(~raw & 0xffff),
      hex16((0x10000 - sum) & 0xffff),
      hex16(cs ^ 0x0001),
      hex16(cs ^ 0x0100),
      hex16(cs ^ 0x1000),
    ]);
    const shown = words.map(hex16);
    return {
      id: `gen-internet-checksum:${shown.join("+")}`,
      kind: "mcq",
      topic: "link",
      type: "TRANSPORT",
      difficulty: 2,
      prompt: `A sender computes the Internet checksum (as UDP and TCP do) over the 16-bit words ${shown.join(", ")}. What is the checksum?`,
      ...mcq,
      explain: `Add the words: ${shown.join(" + ")} = 0x${raw.toString(16).toUpperCase()}. ${
        carries ? `Wrap the carry (${carries}) back into the low 16 bits: ${hex16(sum)}.` : `No carry out of 16 bits, so the sum is ${hex16(sum)}.`
      } The checksum is its ones' complement (flip every bit): ${answer}. The receiver adds the words and the checksum and expects 0xFFFF.`,
    };
  },
};

export const crcGen: Generator = {
  id: "gen-crc-remainder",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const gen = pick(r, CRC_GENERATORS);
    const data = randomBits(r, randInt(r, 5, 8), true);
    const rlen = gen.length - 1;
    const res = crc(data, gen);
    const padded = data + "0".repeat(rlen);
    // Ordinary integer division's remainder can need r + 1 bits; keep it only when it fits.
    const arith = (parseInt(padded, 2) % parseInt(gen, 2)).toString(2).padStart(rlen, "0");
    const mcq = mcqChoices(r, res.remainder, [
      mod2Divide(data, gen).remainder,
      arith,
      invert(res.remainder),
      [...res.remainder].reverse().join(""),
      ...allBits(rlen),
    ].filter((d) => d.length === rlen));
    return {
      id: `gen-crc-remainder:${data}:${gen}`,
      kind: "mcq",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `Data ${data} is sent with CRC generator ${gen}. Which ${rlen} check bits does the sender append?`,
      ...mcq,
      explain: `Append ${rlen} zeros (one fewer than the generator's ${gen.length} bits): ${padded}. Divide by ${gen} with XOR, no carries, lining it up under each leading 1: ${xorLine(gen, res.steps)}. The last ${rlen} bits left are the remainder ${res.remainder}, so ${res.codeword} goes on the wire, and it divides by ${gen} with nothing left over.`,
    };
  },
};

export const crcCheckGen: Generator = {
  id: "gen-crc-check",
  topic: "link",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const gen = pick(r, CRC_GENERATORS);
    const words = new Set<string>();
    const good = randInt(r, 1, 3);
    while (words.size < 4) {
      const code = crc(randomBits(r, randInt(r, 5, 7), true), gen).codeword;
      // A burst of 1 or 2 adjacent bits: always caught, since r ≥ 3.
      let sent = code;
      if (words.size >= good) {
        const i = randInt(r, 1, code.length - 2);
        sent = flipAt(code, i);
        if (r() < 0.4) sent = flipAt(sent, i + 1);
      }
      words.add(sent);
    }
    const choices = shuffled(r, [...words]);
    const answers = choices.flatMap((c, i) => (crcOk(c, gen) ? [i] : []));
    return {
      id: `gen-crc-check:${gen}:${choices.join("-")}`,
      kind: "multi",
      topic: "link",
      type: "LINK",
      difficulty: 3,
      prompt: `The receiver's CRC generator is ${gen}. Which of these received frames does it accept? Pick all that apply.`,
      choices,
      answers,
      explain: `Divide each frame by ${gen} (XOR long division): ${choices
        .map((c) => `${c} leaves ${mod2Divide(c, gen).remainder}`)
        .join("; ")}. Only a zero remainder passes. A generator with an x⁰ term catches every single flipped bit and every burst of up to ${gen.length - 1} bits.`,
    } satisfies Question;
  },
};

export const checkBitsGen: Generator = {
  id: "gen-hamming-check-bits",
  topic: "link",
  type: "LINK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const m = pick(r, [4, 5, 7, 8, 11, 12, 16, 20, 26, 32, 50, 57, 64]);
    const k = hammingCheckBits(m);
    return {
      id: `gen-hamming-check-bits:${m}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 1,
      prompt: `How many check bits does a single-error-correcting Hamming code need for ${m} data bits?`,
      answer: k,
      explain: `r check bits must name every one of the m + r positions, plus "no error": 2^r ≥ m + r + 1. With r = ${k}: 2^${k} = ${2 ** k} ≥ ${m} + ${k} + 1 = ${m + k + 1}, but r = ${k - 1} gives 2^${k - 1} = ${2 ** (k - 1)} < ${m} + ${k - 1} + 1 = ${m + k}. So a ${m + k}-bit codeword.`,
    };
  },
};

export const hammingEncodeGen: Generator = {
  id: "gen-hamming-encode",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const data = randomBits(r, 4);
    const code = hammingEncode(data);
    const [p1, p2, p4] = [code[0], code[1], code[3]];
    const oddParity = invert(p1) + invert(p2) + data[0] + invert(p4) + data.slice(1);
    const mcq = mcqChoices(r, code, [
      oddParity,
      data + p1 + p2 + p4,
      flipAt(code, 0),
      flipAt(code, 3),
      flipAt(code, 1),
    ]);
    const d = [...data];
    return {
      id: `gen-hamming-encode:${data}`,
      kind: "mcq",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `Encode the data ${data} with a Hamming(7,4) code: even parity, check bits at positions 1, 2 and 4 (position 1 is leftmost), data in 3, 5, 6, 7.`,
      ...mcq,
      explain: `Data fills positions 3, 5, 6, 7: ${d.join(", ")}. Bit 1 checks 1, 3, 5, 7: ${d[0]}⊕${d[1]}⊕${d[3]} = ${p1}. Bit 2 checks 2, 3, 6, 7: ${d[0]}⊕${d[2]}⊕${d[3]} = ${p2}. Bit 4 checks 4, 5, 6, 7: ${d[1]}⊕${d[2]}⊕${d[3]} = ${p4}. Codeword: ${code}.`,
    };
  },
};

export const syndromeGen: Generator = {
  id: "gen-hamming-syndrome",
  topic: "link",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const m = pick(r, [4, 4, 7]);
    const sent = hammingEncode(randomBits(r, m));
    const n = sent.length;
    const got = flipAt(sent, randInt(r, 0, n - 1));
    const pos = hammingSyndrome(got);
    const checks = [1, 2, 4, 8].filter((p) => p <= n);
    const failed = checks.filter((p) => hammingCoverage(p, n).filter((i) => got[i - 1] === "1").length % 2 === 1);
    return {
      id: `gen-hamming-syndrome:${got}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 3,
      prompt: `An even-parity Hamming code (check bits at positions ${checks.join(", ")}; position 1 is leftmost) arrives as ${got}. One bit was flipped. Which position?`,
      answer: pos,
      explain: `Recount each check: ${checks
        .map((p) => `bit ${p} covers ${hammingCoverage(p, n).join(",")} → ${failed.includes(p) ? "odd, fails" : "even, ok"}`)
        .join("; ")}. ${failed.length > 1 ? `The failed checks add up to ${failed.join(" + ")} = ${pos}` : `Only check ${pos} fails, giving syndrome ${pos}`}, so flip position ${pos} back: ${sent}.`,
    };
  },
};

export const ERROR_GENERATORS: readonly Generator[] = [
  parityGen,
  distanceGen,
  capabilityGen,
  checksumGen,
  crcGen,
  crcCheckGen,
  checkBitsGen,
  hammingEncodeGen,
  syndromeGen,
];
