import { describe, expect, it } from "vitest";
import { REALTIME_BANK } from "@/content/questions/realtimeBank";
import { REALTIME_GENERATORS, jitterGen, longPollGen, lostGen, pollGen, voipGen, bufferGen } from "@/content/questions/realtimeGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { jitterBufferMs, longPollRps, pollingMeanDelay, pollingRps, rtcpFractionLost, rtpJitter, rtpLost, voipBandwidth } from "@/lib/net/realtime";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

describe("realtime solver", () => {
  it("RFC 3550 jitter: perfectly spaced arrivals give 0", () => {
    expect(rtpJitter([0, 20, 40, 60], [50, 70, 90, 110])).toBe(0);
  });
  it("RFC 3550 jitter: one 16 ms late packet adds 1 ms per step it contributes to", () => {
    // D = +16 then -16: J = 1, then 1 + (16 - 1)/16
    expect(rtpJitter([0, 20, 40], [0, 36, 40])).toBeCloseTo(1 + 15 / 16, 9);
  });
  it("loss accounting from sequence numbers and the RTCP fixed-point fraction", () => {
    expect(rtpLost(1000, 1099, 95)).toBe(5);
    expect(rtcpFractionLost(100, 5)).toBe(12); // 5/100 × 256 = 12.8 truncated
    expect(rtcpFractionLost(100, 0)).toBe(0);
    expect(rtcpFractionLost(100, -2)).toBe(0);
  });
  it("jitter buffer covers the spread of transit times", () => {
    expect(jitterBufferMs([40, 52, 47, 71, 44])).toBe(31);
  });
  it("G.711 at 20 ms: 160 B payload, 50 pps, 200 B packets, 80 kbit/s at the IP layer", () => {
    expect(voipBandwidth(64, 20)).toEqual({ payloadBytes: 160, packetsPerSec: 50, packetBytes: 200, ipKbps: 80 });
  });
  it("G.729 at 20 ms: 20 B payload, 40 kbit/s at the IP layer", () => {
    const v = voipBandwidth(8, 20);
    expect(v.payloadBytes).toBe(20);
    expect(v.ipKbps).toBe(24);
  });
  it("polling load and staleness", () => {
    expect(pollingRps(10_000, 5)).toBe(2000);
    expect(pollingMeanDelay(30)).toBe(15);
    expect(longPollRps(10_000, 0.01, 60)).toBeCloseTo(166.667, 2); // timeouts dominate quiet clients
    expect(longPollRps(10_000, 0.05, 60)).toBe(500);
    expect(longPollRps(10_000, 0, 50)).toBe(200);
  });
});

describe("realtime bank", () => {
  it("has well-formed MCQs", () => {
    for (const q of REALTIME_BANK as McqQuestion[]) {
      expect(q.choices).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(grade(q, correctResponse(q))).toBe(true);
    }
  });
});

describe("realtime generators", () => {
  it("are registered", () => {
    for (const g of REALTIME_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const seed of seeds) {
      const j = jitterGen.generate(seed) as NumericQuestion;
      const t = j.prompt.match(/send times \(ms\): ([\d, ]+)\. .*arrival times \(ms\): ([\d, ]+)\./)!;
      const s = t[1].split(", ").map(Number);
      const a = t[2].split(", ").map(Number);
      expect(j.answer).toBeCloseTo(rtpJitter(s, a), 1);

      const l = lostGen.generate(seed) as NumericQuestion;
      const lm = l.prompt.match(/from (\d+) to (\d+).* received (\d+) /)!;
      expect(l.answer).toBe(rtpLost(Number(lm[1]), Number(lm[2]), Number(lm[3])));

      const b = bufferGen.generate(seed) as NumericQuestion;
      const bm = b.prompt.match(/transit times \(ms\): ([\d, ]+)\./)!;
      expect(b.answer).toBe(jitterBufferMs(bm[1].split(", ").map(Number)));

      const v = voipGen.generate(seed) as NumericQuestion;
      const vm = v.prompt.match(/(\d+) kbit\/s.*every (\d+) ms/)!;
      expect(v.answer).toBeCloseTo(voipBandwidth(Number(vm[1]), Number(vm[2])).ipKbps, 1);

      const p = pollGen.generate(seed) as NumericQuestion;
      const pm = p.prompt.match(/([\d,]+) clients.*every (\d+) s/)!;
      expect(p.answer).toBe(pollingRps(Number(pm[1].replace(/,/g, "")), Number(pm[2])));

      const lp = longPollGen.generate(seed) as NumericQuestion;
      const lm2 = lp.prompt.match(/([\d,]+) clients.*once every (\d+) s.*timeout is (\d+) s/)!;
      expect(lp.answer).toBeCloseTo(longPollRps(Number(lm2[1].replace(/,/g, "")), 1 / Number(lm2[2]), Number(lm2[3])), 6);
    }
  });
});
