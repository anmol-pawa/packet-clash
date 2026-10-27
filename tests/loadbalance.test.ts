import { describe, expect, it } from "vitest";
import { LOADBALANCE_BANK } from "@/content/questions/loadBalanceBank";
import { LOADBALANCE_GENERATORS, ipHashGen, leastConnGen, modMovedGen, ringMovedGen, wrrGen } from "@/content/questions/loadBalanceGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { buildRing, fnv1a, ipHash, leastConnections, modMoved, powerOfTwo, ringLoad, ringLookup, ringMoved, roundRobin, weightedLeastConnections, weightedRoundRobin } from "@/lib/net/loadbalance";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

describe("load-balancing solver", () => {
  it("round robin cycles", () => {
    expect(roundRobin(3, 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });
  it("smooth weighted round robin matches the nginx example (5,1,1 -> a a b a c a a)", () => {
    expect(weightedRoundRobin([5, 1, 1], 7)).toEqual([0, 0, 1, 0, 2, 0, 0]);
  });
  it("gives each backend its weight per cycle", () => {
    const seq = weightedRoundRobin([3, 1], 8);
    expect(seq.filter((x) => x === 0).length).toBe(6);
  });
  it("least connections, weighted and power of two", () => {
    expect(leastConnections([5, 2, 9])).toBe(1);
    expect(leastConnections([3, 3, 4])).toBe(0);
    expect(weightedLeastConnections([10, 12], [1, 3])).toBe(1);
    expect(powerOfTwo([5, 2, 9], 0, 2)).toBe(0);
    expect(powerOfTwo([5, 2, 9], 2, 1)).toBe(1);
  });
  it("hashes IPs by octet sum", () => {
    expect(ipHash("10.0.0.7", 4)).toBe(1);
    expect(ipHash("192.168.1.10", 5)).toBe(((192 + 168 + 1 + 10) % 5));
  });
  it("modulo hashing remaps most keys when N grows", () => {
    expect(modMoved(12, 3, 4)).toBe(9);
    expect(modMoved(1200, 9, 10) / 1200).toBeGreaterThan(0.85);
  });
  it("FNV-1a known vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });
  it("ring: every moved key goes to the new node and roughly 1/(N+1) move", () => {
    const keys = Array.from({ length: 2000 }, (_, i) => `k${i}`);
    const nodes = ["s1", "s2", "s3", "s4"];
    const before = buildRing(nodes, 100);
    const after = buildRing([...nodes, "s5"], 100);
    let moved = 0;
    for (const k of keys) {
      const a = ringLookup(before, k);
      const b = ringLookup(after, k);
      if (a !== b) {
        moved++;
        expect(b).toBe("s5");
      }
    }
    expect(moved).toBe(ringMoved(keys, nodes, [...nodes, "s5"], 100));
    expect(moved / keys.length).toBeGreaterThan(0.1);
    expect(moved / keys.length).toBeLessThan(0.3);
  });
  it("more virtual nodes balance load better", () => {
    const keys = Array.from({ length: 4000 }, (_, i) => `u${i}`);
    const spread = (v: number) => {
      const load = Object.values(ringLoad(keys, ["a", "b", "c", "d"], v));
      return Math.max(...load) - Math.min(...load);
    };
    expect(spread(200)).toBeLessThan(spread(1));
  });
  it("wraps around the ring", () => {
    const ring = [{ pos: 10, node: "x" }, { pos: 20, node: "y" }];
    expect(ringLookup(ring, "zzz-no-match")).toMatch(/x|y/);
  });
});

describe("load-balancing cards", () => {
  it("are unique interview-topic MCQs with four choices", () => {
    expect(LOADBALANCE_BANK.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LOADBALANCE_BANK.map((q) => q.id)).size).toBe(LOADBALANCE_BANK.length);
    for (const q of LOADBALANCE_BANK) {
      expect(q.topic).toBe("interview");
      expect((q as McqQuestion).choices).toHaveLength(4);
      expect(new Set((q as McqQuestion).choices).size).toBe(4);
      expect(grade(q, correctResponse(q))).toBe(true);
    }
  });
  it("pins the computed card answer", () => {
    const q = LOADBALANCE_BANK.find((x) => x.id === "lb-weighted")!;
    expect(answerText(q)).toBe(String(weightedRoundRobin([3, 1], 8).filter((x) => x === 0).length));
  });
});

describe("load-balancing generators", () => {
  it("are registered", () => {
    for (const g of LOADBALANCE_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const seed of seeds) {
      const w = wrrGen.generate(seed) as NumericQuestion;
      const m = w.prompt.match(/weights (.*)\. Over one full cycle of (\d+) requests, how many go to backend (\w)/)!;
      const weights = m[1].split(", ").map((p) => Number(p.split("=")[1]));
      const j = "ABC".indexOf(m[3]);
      expect(w.answer).toBe(weightedRoundRobin(weights, Number(m[2])).filter((x) => x === j).length);
      expect(w.answer).toBe(weights[j]);

      const l = leastConnGen.generate(seed) as McqQuestion;
      const active = l.prompt.match(/connections: (.*)\. Where/)![1].split(", ").map((p) => Number(p.split("=")[1]));
      expect(l.choices[l.answer]).toBe(`Backend ${"ABCD"[leastConnections(active)]}`);

      const h = ipHashGen.generate(seed) as NumericQuestion;
      const hm = h.prompt.match(/with (\d+) backends.*client at ([\d.]+)\?/)!;
      expect(h.answer).toBe(ipHash(hm[2], Number(hm[1])));

      const d = modMovedGen.generate(seed) as NumericQuestion;
      const dm = d.prompt.match(/Keys 0 to (\d+) .*from (\d+) to/)!;
      expect(d.answer).toBe(modMoved(Number(dm[1]) + 1, Number(dm[2]), Number(dm[2]) + 1));

      const r = ringMovedGen.generate(seed) as McqQuestion;
      expect(r.choices[r.answer]).toBe("The ring");
      expect(new Set(r.choices).size).toBe(4);
    }
  });
});
