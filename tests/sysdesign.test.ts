import { describe, expect, it } from "vitest";
import { SYSDESIGN_BANK } from "@/content/questions/sysdesignBank";
import { SYSDESIGN_GENERATORS, bandwidthGen, cdnGen, egressGen, fleetGen, littleGen, peakQpsGen } from "@/content/questions/sysdesignGenerators";
import { GENERATORS } from "@/content/questions/generators";
import type { NumericQuestion } from "@/game/engine/questions";
import { LATENCY_LADDER, avgQps, bandwidthMbps, concurrency, monthlyEgressUsd, originQps, peakQps, serversNeeded, storageTb } from "@/lib/net/sysdesign";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 13);
const nums = (g: { generate(s: number): unknown }) => seeds.map((s) => g.generate(s) as NumericQuestion);
const grab = (p: string, re: RegExp) => Number((p.match(re) ?? [])[1]?.replace(/,/g, ""));

describe("system-design solver", () => {
  it("QPS and peak", () => {
    expect(avgQps(86_400_000)).toBe(1000);
    expect(avgQps(1_000_000_000)).toBeCloseTo(11_574.07, 2);
    expect(peakQps(1000, 3)).toBe(3000);
  });
  it("bandwidth, fleet and Little's law", () => {
    expect(bandwidthMbps(1000, 125_000)).toBe(1000);
    expect(serversNeeded(4500, 1000)).toBe(5);
    expect(serversNeeded(5000, 1000)).toBe(5);
    expect(concurrency(2000, 0.25)).toBe(500);
  });
  it("CDN offload, egress and storage", () => {
    expect(originQps(100_000, 0.99)).toBeCloseTo(1000, 6);
    expect(monthlyEgressUsd(10, 0.09)).toBeCloseTo(27_000, 6);
    // 1 million 500 kB objects a day for a year, three copies.
    expect(storageTb(1e6, 500_000, 365, 3)).toBeCloseTo(547.5, 6);
  });
  it("latency ladder is strictly increasing", () => {
    for (let i = 1; i < LATENCY_LADDER.length; i++) expect(LATENCY_LADDER[i].ns).toBeGreaterThan(LATENCY_LADDER[i - 1].ns);
  });
});

describe("system-design content", () => {
  it("generators re-solve from the printed prompt", () => {
    for (const q of nums(peakQpsGen)) {
      const perDay = grab(q.prompt, /handles ([\d,]+) requests/);
      expect(q.answer).toBeCloseTo(peakQps(avgQps(perDay), grab(q.prompt, /is (\d)x the daily/)), 6);
    }
    for (const q of nums(bandwidthGen)) {
      expect(q.answer).toBeCloseTo(bandwidthMbps(grab(q.prompt, /sends ([\d,]+) responses/), grab(q.prompt, /of (\d+) kB/) * 1000), 6);
    }
    for (const q of nums(fleetGen)) {
      expect(q.answer).toBe(serversNeeded(grab(q.prompt, /load is ([\d,]+) QPS/), grab(q.prompt, /sustains ([\d,]+) QPS/)));
    }
    for (const q of nums(littleGen)) {
      expect(q.answer).toBeCloseTo(concurrency(grab(q.prompt, /receives ([\d,]+) requests/), grab(q.prompt, /takes (\d+) ms/) / 1000), 6);
    }
    for (const q of nums(cdnGen)) {
      expect(q.answer).toBeCloseTo(originQps(grab(q.prompt, /gets ([\d,]+) requests/), grab(q.prompt, /a (\d+)% cache/) / 100), 6);
    }
    for (const q of nums(egressGen)) {
      expect(q.answer).toBeCloseTo(monthlyEgressUsd(grab(q.prompt, /serve (\d+) TB/), grab(q.prompt, /\$([\d.]+) per GB/)), 6);
    }
  });
  it("is registered with unique ids, and the sort bins are all used", () => {
    expect(SYSDESIGN_GENERATORS.every((g) => GENERATORS.includes(g))).toBe(true);
    expect(new Set(SYSDESIGN_BANK.map((q) => q.id)).size).toBe(SYSDESIGN_BANK.length);
    for (const q of SYSDESIGN_BANK) if (q.kind === "sort") expect(new Set(q.items.map((i) => i.bin)).size).toBe(q.bins.length);
  });
  it("the order card matches the ladder", () => {
    const q = SYSDESIGN_BANK.find((x) => x.id === "sd-latency-ladder")!;
    if (q.kind !== "order") throw new Error("order");
    expect(q.steps).toEqual(LATENCY_LADDER.map((l) => l.label));
  });
});
