/**
 * 5.2 rate-limiting and resilience problems: allow/deny counts for a request trace under
 * token bucket, fixed window and sliding log, backoff totals, retry amplification and a
 * circuit-breaker trace. Answers come from `lib/net/ratelimit`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { backoffTotal, circuitBreaker, fixedWindow, retryAmplification, slidingLog, tokenBucket } from "@/lib/net/ratelimit";
import { randInt, rng } from "@/lib/rng";

const base = { topic: "interview", type: "APPLICATION" } as const;

/** Strictly increasing request times starting at 0. */
function trace(r: () => number, n: number, maxGap: number): number[] {
  const out = [0];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + randInt(r, 0, maxGap));
  return out;
}

export const tokenBucketGen: Generator = {
  id: "gen-sde-tokenbucket",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const times = trace(r, randInt(r, 6, 8), 2);
    const capacity = randInt(r, 2, 4);
    const rate = randInt(r, 1, 2);
    const allowed = tokenBucket(times, capacity, rate).filter(Boolean).length;
    return {
      id: `gen-sde-tokenbucket:${times.join(",")}:${capacity}:${rate}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A token bucket holds ${capacity} tokens (it starts full) and refills ${rate} token${rate > 1 ? "s" : ""} per second. Each request costs one token and is dropped if none is left. Requests arrive at t = ${times.join(", ")} seconds. How many are allowed?`,
      answer: allowed,
      explain: `Replaying the trace: tokens refill by ${rate} per elapsed second (never above ${capacity}) and each allowed request spends one. ${allowed} of ${times.length} get through. The bucket size is the burst you tolerate and the refill rate is the sustained rate.`,
    } satisfies Question;
  },
};

export const fixedWindowGen: Generator = {
  id: "gen-sde-fixedwindow",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const windowSec = randInt(r, 5, 10);
    const limit = randInt(r, 2, 4);
    // a burst just before a window boundary and another just after it
    const edge = windowSec * randInt(r, 1, 2);
    const times = [edge - 2, edge - 1, edge - 1, edge, edge + 1, edge + 1];
    const fixed = fixedWindow(times, windowSec, limit).filter(Boolean).length;
    const sliding = slidingLog(times, windowSec, limit).filter(Boolean).length;
    return {
      id: `gen-sde-fixedwindow:${windowSec}:${limit}:${edge}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A fixed-window limiter allows ${limit} requests per ${windowSec}-second window (windows start at t = 0, ${windowSec}, ${2 * windowSec}…). Requests arrive at t = ${times.join(", ")}. How many are allowed?`,
      answer: fixed,
      explain: `The counter resets at t = ${edge}, so requests either side of the boundary are counted separately and ${fixed} pass. A sliding-window log over the same trace would allow only ${sliding}: fixed windows can let through up to twice the limit around a boundary.`,
    } satisfies Question;
  },
};

export const backoffGen: Generator = {
  id: "gen-sde-backoff",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const baseMs = randInt(r, 1, 5) * 100;
    const retries = randInt(r, 4, 7);
    const cap = baseMs * 2 ** randInt(r, 2, retries - 1);
    const total = backoffTotal(baseMs, cap, retries);
    return {
      id: `gen-sde-backoff:${baseMs}:${cap}:${retries}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A client retries with exponential backoff: the wait before retry n (n = 0, 1, 2…) is min(${cap} ms, ${baseMs} ms × 2^n). With no jitter, what is the total time spent waiting across ${retries} retries, in ms?`,
      answer: total,
      explain: `Waits are ${Array.from({ length: retries }, (_, n) => Math.min(cap, baseMs * 2 ** n)).join(" + ")} = ${total} ms. The cap stops the delay growing forever. With full jitter each wait is a random value in [0, that ceiling], which spreads clients out so they don't retry in lockstep (a thundering herd).`,
    } satisfies Question;
  },
};

export const breakerGen: Generator = {
  id: "gen-sde-breaker",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const threshold = randInt(r, 2, 3);
    const cooldown = randInt(r, 4, 6);
    const n = 9;
    const times = trace(r, n, 1).map((t, i) => t + i);
    // backend is down for the first few sent calls, then recovers
    const downFor = randInt(r, threshold, threshold + 2);
    // Whether call i succeeds depends on how many calls were really sent before it, so
    // replay the breaker on each prefix to learn if call i is sent, then set its outcome.
    const flags: boolean[] = Array.from({ length: n }, () => false);
    let sent = 0;
    for (let i = 0; i < n; i++) {
      const res = circuitBreaker(times.slice(0, i + 1), flags.slice(0, i + 1), threshold, cooldown).results[i];
      if (res === "rejected") continue;
      flags[i] = sent >= downFor;
      sent++;
    }
    const { results } = circuitBreaker(times, flags, threshold, cooldown);
    const reached = results.filter((x) => x !== "rejected").length;
    return {
      id: `gen-sde-breaker:${times.join(",")}:${threshold}:${cooldown}:${downFor}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A circuit breaker opens after ${threshold} consecutive failures and stays open for ${cooldown} s, then lets one probe through (half-open): a success closes it, a failure reopens it. Calls are made at t = ${times.join(", ")}. The backend is down and fails its first ${downFor} real calls, then works again. How many of the ${n} calls actually reach the backend?`,
      answer: reached,
      explain: `Trace: ${results.map((x, i) => `t=${times[i]} ${x}`).join(", ")}. While open, calls are rejected instantly without touching the struggling backend; ${reached} of ${n} get through. That fast failure protects the backend and frees the caller's threads.`,
    } satisfies Question;
  },
};

export const amplifyGen: Generator = {
  id: "gen-sde-retryamp",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const layers = randInt(r, 2, 4);
    const attempts = randInt(r, 2, 4);
    const total = retryAmplification(layers, attempts);
    return {
      id: `gen-sde-retryamp:${layers}:${attempts}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `Service calls are chained through ${layers} layers (each layer calls the one below it). Every layer makes up to ${attempts} attempts (1 try + ${attempts - 1} retries) when its call fails. If the bottom service is down, how many calls can it receive for ONE user request in the worst case?`,
      answer: total,
      explain: `Attempts multiply down the chain: ${attempts}^${layers} = ${total}. Retries at every layer amplify load on an already struggling service (a retry storm). Retry at one layer only, use a retry budget, and add jitter.`,
    } satisfies Question;
  },
};

export const RATELIMIT_GENERATORS: readonly Generator[] = [tokenBucketGen, fixedWindowGen, backoffGen, breakerGen, amplifyGen];
