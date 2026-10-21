import { describe, expect, it } from "vitest";
import {
  checksumOk,
  correctable,
  crc,
  crcOk,
  detectable,
  hammingCheckBits,
  hammingData,
  hammingDistance,
  hammingEncode,
  hammingSyndrome,
  internetChecksum,
  mod2Divide,
  onesComplementSum,
  parityBit,
} from "@/lib/net/errors";
import {
  CRC_GENERATORS,
  ERROR_GENERATORS,
  capabilityGen,
  checkBitsGen,
  checksumGen,
  crcCheckGen,
  crcGen,
  distanceGen,
  hammingEncodeGen,
  hex16,
  parityGen,
  syndromeGen,
} from "@/content/questions/errorGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, type McqQuestion, type MultiQuestion, type NumericQuestion } from "@/game/engine/questions";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const field = (id: string, i: number) => id.split(":")[i];

/** Polynomial remainder by plain bit arithmetic on integers (an independent CRC). */
function crcByInts(data: string, gen: string): string {
  const r = gen.length - 1;
  let x = BigInt("0b" + data) << BigInt(r);
  const g = BigInt("0b" + gen);
  for (let bit = data.length + r - 1; bit >= r; bit--) if ((x >> BigInt(bit)) & BigInt(1)) x ^= g << BigInt(bit - r);
  return x.toString(2).padStart(r, "0");
}

describe("error detection solvers", () => {
  it("match Kurose & Ross's CRC example (D = 101110, G = 1001 → R = 011)", () => {
    const res = crc("101110", "1001");
    expect(res.remainder).toBe("011");
    expect(res.codeword).toBe("101110011");
    expect(crcOk(res.codeword, "1001")).toBe(true);
    expect(res.steps.map((s) => s.after)).toEqual(["0010", "0011", "0101", "0011"]);
  });

  it("match Forouzan's CRC example (dataword 1001, divisor 1011 → codeword 1001110)", () => {
    expect(crc("1001", "1011").codeword).toBe("1001110");
    expect(crcOk("1001110", "1011")).toBe(true);
    // Forouzan's corrupted case: 1000110 leaves syndrome 011.
    expect(mod2Divide("1000110", "1011").remainder).toBe("011");
  });

  it("agree with an integer polynomial division and catch every single-bit and short burst error", () => {
    for (const gen of CRC_GENERATORS) {
      for (let d = 16; d < 256; d += 3) {
        const data = d.toString(2);
        const { remainder, codeword } = crc(data, gen);
        expect(remainder).toBe(crcByInts(data, gen));
        expect(crcOk(codeword, gen)).toBe(true);
        for (let i = 0; i < codeword.length; i++) {
          for (let len = 1; len <= gen.length - 1 && i + len <= codeword.length; len++) {
            // A burst: first and last bits of the window flipped, and everything between too.
            const bad = [...codeword].map((b, j) => (j >= i && j < i + len ? (b === "1" ? "0" : "1") : b)).join("");
            expect(crcOk(bad, gen), `${codeword} burst ${i}+${len}`).toBe(false);
          }
        }
      }
    }
  });

  it("match Kurose & Ross's Internet checksum example", () => {
    const words = [0b0110011001100000, 0b0101010101010101, 0b1000111100001100];
    expect(onesComplementSum(words)).toBe(0b0100101011000010);
    expect(internetChecksum(words)).toBe(0b1011010100111101);
    expect(checksumOk(words, 0b1011010100111101)).toBe(true);
    expect(checksumOk(words, 0b1011010100111100)).toBe(false);
  });

  it("match RFC 1071's checksum example", () => {
    // RFC 1071 §3: 0001 f203 f4f5 f6f7 sums to ddf2 (ones' complement), checksum 220d.
    expect(onesComplementSum([0x0001, 0xf203, 0xf4f5, 0xf6f7])).toBe(0xddf2);
    expect(internetChecksum([0x0001, 0xf203, 0xf4f5, 0xf6f7])).toBe(0x220d);
  });

  it("match Tanenbaum's Hamming codes and the classic 1011 → 0110011", () => {
    expect(hammingEncode("1011")).toBe("0110011");
    // Tanenbaum Fig. 3-7: 7-bit ASCII with check bits at 1, 2, 4, 8.
    expect(hammingEncode("1001000")).toBe("00110010000");
    expect(hammingEncode("1100001")).toBe("10111001001");
    expect(hammingEncode("1101101")).toBe("11101010101");
    expect(hammingCheckBits(4)).toBe(3);
    expect(hammingCheckBits(7)).toBe(4);
    expect(hammingCheckBits(11)).toBe(4);
    expect(hammingCheckBits(12)).toBe(5);
    expect(hammingCheckBits(64)).toBe(7);
  });

  it("locate and undo any single flipped bit in a Hamming codeword", () => {
    for (const m of [4, 7, 11]) {
      for (let d = 0; d < 2 ** m; d += m === 4 ? 1 : 37) {
        const data = d.toString(2).padStart(m, "0");
        const code = hammingEncode(data);
        expect(hammingSyndrome(code)).toBe(0);
        expect(hammingData(code)).toBe(data);
        for (let i = 0; i < code.length; i++) {
          const bad = code.slice(0, i) + (code[i] === "1" ? "0" : "1") + code.slice(i + 1);
          expect(hammingSyndrome(bad)).toBe(i + 1);
        }
      }
    }
  });

  it("count parity and distance", () => {
    expect(parityBit("1011001")).toBe(0);
    expect(parityBit("1011001", false)).toBe(1);
    expect(parityBit("0000001")).toBe(1);
    // Tanenbaum: 10001001 and 10110001 differ in 3 bits.
    expect(hammingDistance("10001001", "10110001")).toBe(3);
    // Hamming(7,4) has dmin 3: it detects 2 and corrects 1.
    expect([detectable(3), correctable(3)]).toEqual([2, 1]);
    expect([detectable(5), correctable(5)]).toEqual([4, 2]);
    expect(correctable(2)).toBe(0);
    expect(hex16(0x220d)).toBe("0x220D");
  });
});

describe("error detection generators", () => {
  it("are all in the main generator list, on gym 2's chapter", () => {
    for (const g of ERROR_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("link");
    }
  });

  it("solve parity, distance and code capability", () => {
    for (const seed of SEEDS) {
      const p = parityGen.generate(seed) as NumericQuestion;
      const data = field(p.id, 1);
      const ones = [...data].filter((b) => b === "1").length;
      expect((ones + p.answer) % 2).toBe(field(p.id, 2) === "even" ? 0 : 1);

      const d = distanceGen.generate(seed) as NumericQuestion;
      const [a, b] = [field(d.id, 1), field(d.id, 2)];
      expect(d.answer).toBe([...a].filter((c, i) => c !== b[i]).length);
      expect(d.answer).toBeGreaterThanOrEqual(1);

      const c = capabilityGen.generate(seed) as NumericQuestion;
      const dmin = Number(field(c.id, 1));
      // Spheres of radius t around codewords stay disjoint iff 2t + 1 ≤ dmin.
      if (field(c.id, 2) === "correct") expect(2 * c.answer + 1 <= dmin && 2 * (c.answer + 1) + 1 > dmin).toBe(true);
      else expect(c.answer).toBe(dmin - 1);
    }
  });

  it("solve the Internet checksum so the receiver's sum is 0xFFFF", () => {
    for (const seed of SEEDS) {
      const q = checksumGen.generate(seed) as McqQuestion;
      const words = field(q.id, 1).split("+").map((w) => parseInt(w, 16));
      const cs = parseInt(answerText(q), 16);
      expect(checksumOk(words, cs)).toBe(true);
      // Independent: the plain modular sum, end-around carry folded.
      let s = words.reduce((x, y) => x + y, 0);
      while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
      expect(cs).toBe(0xffff - s);
      for (const [i, ch] of q.choices.entries()) if (i !== q.answer) expect(checksumOk(words, parseInt(ch, 16))).toBe(false);
    }
  });

  it("solve CRC remainders and checks", () => {
    for (const seed of SEEDS) {
      const q = crcGen.generate(seed) as McqQuestion;
      const [data, gen] = [field(q.id, 1), field(q.id, 2)];
      expect(answerText(q)).toBe(crcByInts(data, gen));
      for (const ch of q.choices) expect(ch.length).toBe(gen.length - 1);
      expect(q.choices.filter((ch) => crcOk(data + ch, gen))).toEqual([answerText(q)]);

      const m = crcCheckGen.generate(seed) as MultiQuestion;
      const g = field(m.id, 1);
      expect(m.answers).toEqual(m.choices.flatMap((ch, i) => (crcByInts(ch.slice(0, -(g.length - 1)), g) === ch.slice(-(g.length - 1)) ? [i] : [])));
    }
  });

  it("solve Hamming check-bit counts, encodings and syndromes", () => {
    for (const seed of SEEDS) {
      const k = checkBitsGen.generate(seed) as NumericQuestion;
      const m = Number(field(k.id, 1));
      expect(2 ** k.answer >= m + k.answer + 1 && 2 ** (k.answer - 1) < m + k.answer).toBe(true);

      const e = hammingEncodeGen.generate(seed) as McqQuestion;
      const code = answerText(e);
      expect(hammingSyndrome(code)).toBe(0);
      expect(hammingData(code)).toBe(field(e.id, 1));
      for (const [i, ch] of e.choices.entries()) if (i !== e.answer) expect(hammingSyndrome(ch) !== 0 || hammingData(ch) !== field(e.id, 1)).toBe(true);

      const s = syndromeGen.generate(seed) as NumericQuestion;
      const got = field(s.id, 1);
      const fixed = got.slice(0, s.answer - 1) + (got[s.answer - 1] === "1" ? "0" : "1") + got.slice(s.answer);
      expect(hammingSyndrome(fixed)).toBe(0);
      expect(s.explain).toContain(fixed);
    }
  });
});
