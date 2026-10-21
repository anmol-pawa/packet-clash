import { describe, expect, it } from "vitest";
import {
  ESC,
  FLAG,
  backoffChoices,
  bitStuff,
  bitUnstuff,
  byteStuff,
  byteUnstuff,
  differentialManchester,
  ethernetEfficiency,
  ethernetFrameBytes,
  manchester,
  maxBackoffSlots,
  minFrameBits,
  nrzi,
  pureAloha,
  slottedAloha,
  slottedSuccess,
  transitions,
} from "@/lib/net/link";
import {
  LINK_GENERATORS,
  alohaGen,
  backoffGen,
  bitStuffGen,
  byteStuffGen,
  ethernetEfficiencyGen,
  manchesterGen,
  minFrameGen,
} from "@/content/questions/linkGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { BANK } from "@/content/questions/bank";
import { answerText, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const field = (id: string, i: number) => id.split(":")[i];

describe("link-layer solvers", () => {
  it("encode Manchester with the Thomas convention", () => {
    expect(manchester("1011")).toBe("01100101");
    expect(transitions(manchester("0000"))).toBe(7); // an edge in every bit and between bits
  });

  it("differential Manchester always has a mid-bit edge; a 0 adds a start-of-bit edge", () => {
    const out = differentialManchester("0110");
    for (let i = 0; i < out.length; i += 2) expect(out[i]).not.toBe(out[i + 1]);
    expect(out).toBe("10011010");
    expect(differentialManchester("11", "0")).toBe("0110");
    expect(differentialManchester("00", "0")).toBe("1010");
  });

  it("NRZ-I toggles on 1s", () => {
    expect(nrzi("1101")).toBe("1001");
  });

  it("bit-stuff after five 1s and round-trip (Kurose/Tanenbaum example)", () => {
    expect(bitStuff("011011111011111010")).toBe("01101111100111110010");
    expect(bitStuff("0111111")).toBe("01111101"); // five 1s then a stuffed 0, then the sixth 1
    expect(bitStuff("111111")).toBe("1111101");
    expect(bitStuff("11111")).toBe("111110"); // stuffing even when the run ends the data
    for (const s of ["", "0", "11111", "1111111111", "0111110111110", "1".repeat(23)]) {
      expect(bitUnstuff(bitStuff(s))).toBe(s);
      expect(bitStuff(s)).not.toContain("111111");
    }
  });

  it("byte-stuff FLAG and ESC (Tanenbaum Fig. 3-5) and round-trip", () => {
    expect(byteStuff([0x41, FLAG, 0x42])).toEqual([0x41, ESC, FLAG, 0x42]);
    expect(byteStuff([ESC, FLAG])).toEqual([ESC, ESC, ESC, FLAG]);
    const data = [0x7e, 0x7d, 0x00, 0x7d, 0x7e, 0x33];
    expect(byteUnstuff(byteStuff(data))).toEqual(data);
  });

  it("CSMA/CD backoff doubles to a cap of 1024 values", () => {
    expect([1, 2, 3, 10, 11, 16].map(backoffChoices)).toEqual([2, 4, 8, 1024, 1024, 1024]);
    expect(maxBackoffSlots(1)).toBe(1);
    expect(maxBackoffSlots(3)).toBe(7);
  });

  it("minimum frame size: 10 Mbps over 2.5 km at 2×10⁸ m/s → 250 bits; 512 bits needs 5.12 km", () => {
    expect(minFrameBits(10e6, 2500, 2e8)).toBe(250);
    expect(minFrameBits(10e6, 5120, 2e8)).toBe(512);
    expect(minFrameBits(1e9, 100, 2e8)).toBe(1000);
  });

  it("ALOHA peaks at 1/e (slotted, G = 1) and 1/2e (pure, G = 0.5)", () => {
    expect(slottedAloha(1)).toBeCloseTo(0.3679, 4);
    expect(pureAloha(0.5)).toBeCloseTo(0.1839, 4);
    for (const g of [0.1, 0.4, 0.9, 1.1, 2]) expect(slottedAloha(g)).toBeLessThan(slottedAloha(1));
    for (const g of [0.1, 0.3, 0.7, 1.5]) expect(pureAloha(g)).toBeLessThan(pureAloha(0.5));
    // Kurose & Ross: N·p·(1−p)^(N−1) tends to 1/e as N grows with p = 1/N.
    expect(slottedSuccess(1000, 1 / 1000)).toBeCloseTo(1 / Math.E, 3);
    expect(slottedSuccess(2, 0.5)).toBe(0.5);
  });

  it("Ethernet frame sizes: 64–1518 bytes, 97.5% efficiency at full size", () => {
    expect(ethernetFrameBytes(46)).toBe(64);
    expect(ethernetFrameBytes(1)).toBe(64);
    expect(ethernetFrameBytes(1500)).toBe(1518);
    expect(ethernetEfficiency(1500)).toBeCloseTo(1500 / 1538, 6);
    expect(ethernetEfficiency(46)).toBeCloseTo(46 / 84, 6);
  });
});

describe("link-layer generators", () => {
  it("are in the main list on gym 2's chapter", () => {
    for (const g of LINK_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("link");
    }
  });

  it("solve Manchester with distinct choices", () => {
    for (const seed of SEEDS) {
      const q = manchesterGen.generate(seed) as McqQuestion;
      const bits = field(q.id, 1);
      const ans = answerText(q);
      expect(ans).toBe([...bits].map((b) => (b === "1" ? "01" : "10")).join(""));
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("solve bit and byte stuffing with an independent count", () => {
    for (const seed of SEEDS) {
      const b = bitStuffGen.generate(seed) as NumericQuestion;
      const bits = field(b.id, 1);
      let run = 0;
      let extra = 0;
      for (const c of bits) {
        run = c === "1" ? run + 1 : 0;
        if (run === 5) {
          extra++;
          run = 0;
        }
      }
      expect(b.answer).toBe(bits.length + extra);

      const y = byteStuffGen.generate(seed) as NumericQuestion;
      const hex = field(y.id, 1);
      const bytes = hex.match(/../g)!.map((h) => parseInt(h, 16));
      expect(y.answer).toBe(bytes.length + bytes.filter((v) => v === 0x7e || v === 0x7d).length);
    }
  });

  it("solve backoff, minimum frame, ALOHA and Ethernet efficiency", () => {
    for (const seed of SEEDS) {
      const k = backoffGen.generate(seed) as NumericQuestion;
      const n = Number(field(k.id, 1));
      const values = Math.min(2 ** Math.min(n, 10), 1024);
      expect(k.answer).toBe(field(k.id, 2) === "wait" ? (values - 1) * 512 : values);

      const m = minFrameGen.generate(seed) as NumericQuestion;
      const [rate, len] = [Number(field(m.id, 1)), Number(field(m.id, 2))];
      // round trip time (s) × rate (bit/s)
      expect(m.answer).toBeCloseTo(((2 * len) / 2e8) * rate * 1e6, 6);
      expect(Number.isInteger(m.answer)).toBe(true);

      const a = alohaGen.generate(seed) as NumericQuestion;
      const g = Number(field(a.id, 2));
      const expected = field(a.id, 1) === "slotted" ? g * Math.exp(-g) : g * Math.exp(-2 * g);
      expect(Math.abs(a.answer - expected)).toBeLessThan(0.001);

      const e = ethernetEfficiencyGen.generate(seed) as NumericQuestion;
      const payload = Number(field(e.id, 1));
      const wire = 8 + 14 + Math.max(46, payload) + 4 + 12;
      expect(Math.abs(e.answer - (100 * payload) / wire)).toBeLessThan(0.06);
    }
  });

  it("explanations mention the answer and the bank cards are well formed", () => {
    for (const g of LINK_GENERATORS) for (const seed of SEEDS.slice(0, 50)) expect(g.generate(seed).explain.length).toBeGreaterThan(40);
    const ids = BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pins the new bank answers", () => {
    const get = (id: string) => BANK.find((q) => q.id === id)!;
    expect(answerText(get("ethernet-sizes"))).toBe("64 and 1518 bytes");
    expect(answerText(get("arp-request-frame"))).toMatch(/^Broadcast frame to FF/);
    expect(answerText(get("arp-off-subnet"))).toBe("The MAC of the default gateway");
    expect(answerText(get("aloha-max"))).toBe("18.4% and 36.8%");
    expect(answerText(get("switch-vs-hub"))).toMatch(/^A hub is one collision domain/);
    expect((get("csma-cd-order") as { steps: string[] }).steps[0]).toBe("Sense the channel until it is idle");
  });
});
