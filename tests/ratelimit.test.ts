import { describe, expect, it } from "vitest";
import { RATELIMIT_BANK } from "@/content/questions/rateLimitBank";
import { RATELIMIT_GENERATORS, amplifyGen, backoffGen, breakerGen, fixedWindowGen, tokenBucketGen } from "@/content/questions/rateLimitGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { backoffCeiling, backoffTotal, circuitBreaker, fixedWindow, leakyBucket, retryAmplification, slidingCounter, slidingLog, tokenBucket } from "@/lib/net/ratelimit";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);
const count = (a: boolean[]) => a.filter(Boolean).length;

describe("rate-limit solver", () => {
  it("token bucket allows a burst of the bucket size, then the refill rate", () => {
    // capacity 3, 1 token/s: 5 requests at t=0 -> 3 pass; at t=1 one token has refilled
    expect(tokenBucket([0, 0, 0, 0, 0, 1, 1], 3, 1)).toEqual([true, true, true, false, false, true, false]);
  });
  it("token bucket never exceeds capacity after idling", () => {
    expect(count(tokenBucket([0, 100, 100, 100, 100], 2, 5))).toBe(3); // t=0 spends 1 (1 left); by t=100 it is back to the cap of 2, so 2 more pass and the rest are denied
  });
  it("leaky bucket meter mirrors the token bucket", () => {
    const t = [0, 0, 0, 0, 1, 1, 5];
    expect(leakyBucket(t, 3, 1)).toEqual([true, true, true, false, true, false, true]);
  });
  it("fixed window lets a boundary burst double the limit; sliding log does not", () => {
    const t = [8, 9, 9, 10, 11, 11]; // limit 3 per 10 s, boundary at 10
    expect(count(fixedWindow(t, 10, 3))).toBe(6);
    expect(count(slidingLog(t, 10, 3))).toBe(3);
  });
  it("sliding counter weights the previous window", () => {
    // W=10, limit 4. Four requests in window 0, then t=12: estimate = 4*(8/10)+0+1 = 4.2 > 4 -> deny; t=19 -> 4*0.1+1 = 1.4 ok
    expect(slidingCounter([1, 2, 3, 4, 12, 19], 10, 4)).toEqual([true, true, true, true, false, true]);
  });
  it("backoff doubles up to the cap", () => {
    expect([0, 1, 2, 3, 4].map((n) => backoffCeiling(100, 500, n))).toEqual([100, 200, 400, 500, 500]);
    expect(backoffTotal(100, 500, 5)).toBe(1700);
  });
  it("retries multiply across layers", () => {
    expect(retryAmplification(3, 3)).toBe(27);
  });
  it("circuit breaker opens, rejects, probes and recloses", () => {
    const times = [0, 1, 2, 3, 8, 9];
    const ok = [false, false, false, false, true, true];
    const { results, finalState } = circuitBreaker(times, ok, 2, 5);
    expect(results).toEqual(["fail", "fail", "rejected", "rejected", "ok", "ok"]);
    expect(finalState).toBe("closed");
  });
  it("a failed half-open probe reopens the breaker", () => {
    const { results, finalState } = circuitBreaker([0, 1, 7, 8], [false, false, false, true], 2, 5);
    expect(results).toEqual(["fail", "fail", "fail", "rejected"]);
    expect(finalState).toBe("open");
  });
});

describe("rate-limit cards", () => {
  it("are unique interview-topic MCQs with four choices", () => {
    expect(RATELIMIT_BANK.length).toBeGreaterThanOrEqual(20);
    expect(new Set(RATELIMIT_BANK.map((q) => q.id)).size).toBe(RATELIMIT_BANK.length);
    for (const q of RATELIMIT_BANK) {
      expect(q.topic).toBe("interview");
      expect((q as McqQuestion).choices).toHaveLength(4);
      expect(new Set((q as McqQuestion).choices).size).toBe(4);
      expect(grade(q, correctResponse(q))).toBe(true);
    }
  });
});

describe("rate-limit generators", () => {
  it("are registered", () => {
    for (const g of RATELIMIT_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const seed of seeds) {
      const tb = tokenBucketGen.generate(seed) as NumericQuestion;
      const m = tb.prompt.match(/holds (\d+) tokens.*refills (\d+) tokens? per second.*t = ([\d, ]+) seconds/)!;
      expect(tb.answer).toBe(count(tokenBucket(m[3].split(", ").map(Number), Number(m[1]), Number(m[2]))));

      const fw = fixedWindowGen.generate(seed) as NumericQuestion;
      const f = fw.prompt.match(/allows (\d+) requests per (\d+)-second.*t = ([\d, ]+)\. How/)!;
      const ft = f[3].split(", ").map(Number);
      expect(fw.answer).toBe(count(fixedWindow(ft, Number(f[2]), Number(f[1]))));
      expect(fw.answer).toBeGreaterThan(count(slidingLog(ft, Number(f[2]), Number(f[1]))));

      const bo = backoffGen.generate(seed) as NumericQuestion;
      const b = bo.prompt.match(/min\((\d+) ms, (\d+) ms × 2\^n\).*across (\d+) retries/)!;
      expect(bo.answer).toBe(backoffTotal(Number(b[2]), Number(b[1]), Number(b[3])));

      const br = breakerGen.generate(seed) as NumericQuestion;
      const c = br.prompt.match(/after (\d+) consecutive failures.*open for (\d+) s.*t = ([\d, ]+)\. The backend is down and fails its first (\d+) real/)!;
      const times = c[3].split(", ").map(Number);
      // replay: the first `down` calls actually sent fail, later ones succeed
      const flags = times.map(() => false);
      let sent = 0;
      for (let i = 0; i < times.length; i++) {
        const res = circuitBreaker(times.slice(0, i + 1), flags.slice(0, i + 1), Number(c[1]), Number(c[2])).results[i];
        if (res !== "rejected") flags[i] = sent++ >= Number(c[4]);
      }
      const results = circuitBreaker(times, flags, Number(c[1]), Number(c[2])).results;
      expect(br.answer).toBe(results.filter((x) => x !== "rejected").length);
      expect(br.answer).toBeLessThan(times.length);

      const am = amplifyGen.generate(seed) as NumericQuestion;
      const a = am.prompt.match(/through (\d+) layers.*makes up to (\d+) attempts/)!;
      expect(am.answer).toBe(Number(a[2]) ** Number(a[1]));
    }
  });
});
