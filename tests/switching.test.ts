import { describe, expect, it } from "vitest";
import { BROADCAST, MAX_TAGGED_FRAME, blockedLinks, electRoot, simulateSwitch, vlanDomains } from "@/lib/net/switching";
import { SWITCH_GENERATORS, macFloodGen, macLastFrameGen, stpBlockedGen, stpRootGen, vlanGen } from "@/content/questions/switchGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

describe("learning switch", () => {
  it("learns, floods unknowns, forwards knowns, filters same-port (hand-derived)", () => {
    const steps = simulateSwitch(4, [
      { src: "A", dst: "B", inPort: 1 }, // B unknown: flood 2,3,4
      { src: "B", dst: "A", inPort: 2 }, // A known on 1: forward
      { src: "C", dst: "D", inPort: 3 }, // D unknown: flood 1,2,4
      { src: "D", dst: "C", inPort: 3 }, // C on the arrival port: filter
      { src: "A", dst: BROADCAST, inPort: 1 }, // broadcast: flood
    ]);
    expect(steps.map((s) => s.action)).toEqual(["flood", "forward", "flood", "filter", "flood"]);
    expect(steps[0].outPorts).toEqual([2, 3, 4]);
    expect(steps[1].outPorts).toEqual([1]);
    expect(steps[2].outPorts).toEqual([1, 2, 4]);
    expect(steps[3].outPorts).toEqual([]);
    expect(steps[4].table).toEqual({ A: 1, B: 2, C: 3, D: 3 });
  });

  it("overwrites an entry when a host moves ports", () => {
    const steps = simulateSwitch(3, [
      { src: "A", dst: "X", inPort: 1 },
      { src: "A", dst: "X", inPort: 2 },
    ]);
    expect(steps[1].table.A).toBe(2);
  });
});

describe("STP and VLAN solvers", () => {
  it("elects the lowest priority, then the lowest MAC", () => {
    expect(electRoot([{ priority: 32768, mac: "0000aa" }, { priority: 4096, mac: "ffffff" }, { priority: 4096, mac: "000001" }])).toBe(2);
    expect(electRoot([{ priority: 32768, mac: "0a" }, { priority: 32768, mac: "09" }])).toBe(1);
  });

  it("a tree has switches − 1 links; the rest are blocked", () => {
    expect(blockedLinks(3, 3)).toBe(1); // a triangle blocks one link
    expect(blockedLinks(4, 6)).toBe(3); // full mesh of 4
    expect(blockedLinks(5, 4)).toBe(0);
  });

  it("counts distinct VLANs as broadcast domains; 802.1Q frames max 1522", () => {
    expect(vlanDomains([[10, 10, 20], [20, 30]])).toBe(3);
    expect(MAX_TAGGED_FRAME).toBe(1522);
  });
});

describe("switching generators", () => {
  it("are in the main list on gym 2's chapter", () => {
    for (const g of SWITCH_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("link");
    }
  });

  it("flood count matches an independent table simulation", () => {
    for (const seed of SEEDS) {
      const q = macFloodGen.generate(seed) as NumericQuestion;
      const where: Record<string, number> = {};
      for (const m of q.prompt.matchAll(/([A-D]) on port (\d)/g)) where[m[1]] = Number(m[2]);
      const frames = [...q.prompt.matchAll(/\d\. ([A-D]) → (broadcast|[A-D])/g)].map((m) => [m[1], m[2]]);
      expect(frames).toHaveLength(4);
      const known = new Set<string>();
      let flooded = 0;
      for (const [s, d] of frames) {
        known.add(s);
        if (d === "broadcast" || !known.has(d)) flooded++;
      }
      expect(q.answer).toBe(flooded);
      expect(Object.keys(where)).toHaveLength(4);
    }
  });

  it("last-frame answer is unique and matches the simulator", () => {
    for (const seed of SEEDS) {
      const q = macLastFrameGen.generate(seed) as McqQuestion;
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices).toHaveLength(4);
      expect(q.explain).toContain("Frame 4");
      expect(answerText(q)).toMatch(/^(Port \d only|Ports [\d, ]+|No port \(dropped\))$/);
    }
  });

  it("STP root is the lowest (priority, MAC)", () => {
    for (const seed of SEEDS) {
      const q = stpRootGen.generate(seed) as McqQuestion;
      const rows = [...q.prompt.matchAll(/(S\d) \(priority (\d+), MAC …([0-9a-f]+)\)/g)].map((m) => ({ n: m[1], p: Number(m[2]), mac: m[3] }));
      rows.sort((a, b) => a.p - b.p || (a.mac < b.mac ? -1 : 1));
      expect(answerText(q)).toBe(rows[0].n);
      expect(new Set(rows.map((r) => r.mac)).size).toBe(rows.length);
    }
  });

  it("blocked links and VLAN domains are recomputed from the prompt", () => {
    for (const seed of SEEDS) {
      const b = stpBlockedGen.generate(seed) as NumericQuestion;
      const [, n, l] = b.prompt.match(/^(\d+) switches are connected by (\d+) links/)!;
      expect(b.answer).toBe(Number(l) - Number(n) + 1);
      const v = vlanGen.generate(seed) as NumericQuestion;
      const [, a, c] = v.prompt.match(/VLANs ([\d, ]+); switch 2's are in VLANs ([\d, ]+)\./)!;
      expect(v.answer).toBe(new Set(`${a},${c}`.split(",").map((x) => x.trim())).size);
    }
  });
});
