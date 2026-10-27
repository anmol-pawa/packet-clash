import { describe, expect, it } from "vitest";
import { PERF_BANK } from "@/content/questions/perfBank";
import { PERF_GENERATORS, bloatGen, firstByteGen, mathisGen, scaleGen, slowStartGen, timeWaitGen } from "@/content/questions/perfGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { HTTP_STACKS, bdpBytes, firstByteTrips, mathisBps, maxConnsPerSec, queueDelayMs, slowStartRounds, windowLimitedBps, windowScaleShift } from "@/lib/net/perf";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

describe("perf solver", () => {
  it("Mathis: 1460-byte MSS, 100 ms, 1% loss is about 1.4 Mbit/s", () => {
    expect(mathisBps(1460, 0.1, 0.01) / 1e6).toBeCloseTo(1.4248, 3);
  });
  it("Mathis: quadrupling loss halves throughput, doubling RTT halves it", () => {
    const b = mathisBps(1460, 0.05, 0.0001);
    expect(mathisBps(1460, 0.05, 0.0004)).toBeCloseTo(b / 2, 6);
    expect(mathisBps(1460, 0.1, 0.0001)).toBeCloseTo(b / 2, 6);
  });
  it("a 64 KB window over 100 ms caps at about 5.2 Mbit/s", () => {
    expect(windowLimitedBps(65535, 0.1) / 1e6).toBeCloseTo(5.243, 3);
  });
  it("BDP of 1 Gbit/s x 80 ms is 10 MB", () => {
    expect(bdpBytes(1e9, 0.08)).toBe(10_000_000);
  });
  it("window scale: smallest shift covering the BDP", () => {
    expect(windowScaleShift(65535)).toBe(0);
    expect(windowScaleShift(65536)).toBe(1);
    expect(windowScaleShift(10_000_000)).toBe(8); // 65535 << 7 = 8.39 MB < 10 MB <= 65535 << 8 = 16.8 MB
    expect(windowScaleShift(2 ** 31)).toBe(-1);
  });
  it("slow start: IW10 sends 10, 30, 70... segments cumulatively", () => {
    expect(slowStartRounds(10_000, 10, 1000)).toBe(1);
    expect(slowStartRounds(30_000, 10, 1000)).toBe(2);
    expect(slowStartRounds(31_000, 10, 1000)).toBe(3);
    expect(slowStartRounds(100_000, 1, 1000)).toBe(7); // 1+2+4+..+64 = 127 >= 100
  });
  it("TIME_WAIT: default Linux range over 60 s is 470 connections/s", () => {
    expect(maxConnsPerSec(32768, 60999, 60)).toBe(470);
  });
  it("bufferbloat: 1 MB behind 10 Mbit/s is 800 ms", () => {
    expect(queueDelayMs(1_000_000, 10e6)).toBe(800);
  });
  it("round trips to first byte follow the textbook stacks", () => {
    expect(firstByteTrips("tcp-tls12")).toBe(4);
    expect(firstByteTrips("tcp-tls13")).toBe(3);
    expect(firstByteTrips("quic")).toBe(2);
    expect(firstByteTrips("quic-0rtt")).toBe(1);
  });
});

describe("perf cards", () => {
  it("are unique interview-topic MCQs with four choices", () => {
    expect(PERF_BANK.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PERF_BANK.map((q) => q.id)).size).toBe(PERF_BANK.length);
    for (const q of PERF_BANK) {
      expect(q.topic).toBe("interview");
      expect((q as McqQuestion).choices).toHaveLength(4);
      expect(new Set((q as McqQuestion).choices).size).toBe(4);
      expect(grade(q, correctResponse(q))).toBe(true);
    }
  });
});

describe("perf generators", () => {
  it("are registered", () => {
    for (const g of PERF_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const seed of seeds) {
      const ma = mathisGen.generate(seed) as NumericQuestion;
      const a = ma.prompt.match(/MSS = (\d+) bytes, RTT = (\d+) ms.* of ([\d.]+)%/)!;
      expect(ma.answer).toBeCloseTo(mathisBps(Number(a[1]), Number(a[2]) / 1000, Number(a[3]) / 100) / 1e6, 1);

      const sc = scaleGen.generate(seed) as NumericQuestion;
      const b = sc.prompt.match(/has (\d+) Mbit\/s.* a (\d+) ms RTT/)!;
      const shift = sc.answer;
      const bdp = bdpBytes(Number(b[1]) * 1e6, Number(b[2]) / 1000);
      expect(65535 * 2 ** shift).toBeGreaterThanOrEqual(bdp);
      if (shift > 0) expect(65535 * 2 ** (shift - 1)).toBeLessThan(bdp);

      const ss = slowStartGen.generate(seed) as NumericQuestion;
      const c = ss.prompt.match(/window = (\d+) segment.*send a (\d+) KB/)!;
      expect(ss.answer).toBe(slowStartRounds(Number(c[2]) * 1000, Number(c[1]), 1000));

      const tw = timeWaitGen.generate(seed) as NumericQuestion;
      const d = tw.prompt.match(/range is (\d+)-(\d+) and.*for (\d+) s/)!;
      expect(tw.answer).toBe(Math.floor((Number(d[2]) - Number(d[1]) + 1) / Number(d[3])));

      const bl = bloatGen.generate(seed) as NumericQuestion;
      const e = bl.prompt.match(/runs at (\d+) Mbit\/s and its queue holds (\d+) KB/)!;
      expect(bl.answer).toBeCloseTo(queueDelayMs(Number(e[2]) * 1000, Number(e[1]) * 1e6), 1);

      const fb = firstByteGen.generate(seed) as NumericQuestion;
      const stack = (Object.keys(HTTP_STACKS) as (keyof typeof HTTP_STACKS)[]).find((k) => fb.prompt.includes(HTTP_STACKS[k].label + ","))!;
      const rtt = Number(fb.prompt.match(/with a (\d+) ms RTT/)![1]);
      expect(fb.answer).toBe(HTTP_STACKS[stack].trips * rtt);
    }
  });
});
