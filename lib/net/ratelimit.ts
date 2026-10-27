/**
 * Rate limiting and resilience (ROADMAP 5.2): token bucket, leaky-bucket meter,
 * fixed / sliding-log / sliding-counter windows (each decides allow or deny for a
 * request trace), exponential backoff with jitter bounds, retry amplification and a
 * circuit-breaker state machine. Times are integer seconds so results are exact.
 */

/** Token bucket: starts full, refills `rate` tokens/s up to `capacity`, each request costs one token. */
export function tokenBucket(times: readonly number[], capacity: number, rate: number): boolean[] {
  let tokens = capacity;
  let last = times[0] ?? 0;
  return times.map((t) => {
    tokens = Math.min(capacity, tokens + (t - last) * rate);
    last = t;
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  });
}

/** Leaky bucket as a meter: each allowed request adds one unit, the level drains `rate`/s, and the bucket holds `capacity`. */
export function leakyBucket(times: readonly number[], capacity: number, rate: number): boolean[] {
  let level = 0;
  let last = times[0] ?? 0;
  return times.map((t) => {
    level = Math.max(0, level - (t - last) * rate);
    last = t;
    if (level + 1 <= capacity) {
      level += 1;
      return true;
    }
    return false;
  });
}

/** Fixed window counter: at most `limit` allowed per window [k*W, (k+1)*W). */
export function fixedWindow(times: readonly number[], windowSec: number, limit: number): boolean[] {
  const counts = new Map<number, number>();
  return times.map((t) => {
    const w = Math.floor(t / windowSec);
    const c = counts.get(w) ?? 0;
    if (c < limit) {
      counts.set(w, c + 1);
      return true;
    }
    return false;
  });
}

/** Sliding window log: allow if fewer than `limit` allowed requests fall in (t - W, t]. */
export function slidingLog(times: readonly number[], windowSec: number, limit: number): boolean[] {
  const allowed: number[] = [];
  return times.map((t) => {
    const inWindow = allowed.filter((a) => a > t - windowSec).length;
    if (inWindow < limit) {
      allowed.push(t);
      return true;
    }
    return false;
  });
}

/**
 * Sliding window counter: weigh the previous window by the part of it still inside the
 * sliding window. Allow if prev*(W - elapsed)/W + current + 1 <= limit (kept in integers).
 */
export function slidingCounter(times: readonly number[], windowSec: number, limit: number): boolean[] {
  const counts = new Map<number, number>();
  return times.map((t) => {
    const w = Math.floor(t / windowSec);
    const elapsed = t - w * windowSec;
    const prev = counts.get(w - 1) ?? 0;
    const cur = counts.get(w) ?? 0;
    if (prev * (windowSec - elapsed) + (cur + 1) * windowSec <= limit * windowSec) {
      counts.set(w, cur + 1);
      return true;
    }
    return false;
  });
}

/** Exponential backoff ceiling before retry n (0-based): min(cap, base * 2^n). */
export function backoffCeiling(base: number, cap: number, n: number): number {
  return Math.min(cap, base * 2 ** n);
}

/** Longest total wait over `retries` retries with no jitter (and the upper bound with full jitter). */
export function backoffTotal(base: number, cap: number, retries: number): number {
  let sum = 0;
  for (let n = 0; n < retries; n++) sum += backoffCeiling(base, cap, n);
  return sum;
}

/** Worst-case calls reaching the bottom of a chain of `layers` services when each layer tries `attempts` times. */
export function retryAmplification(layers: number, attempts: number): number {
  return attempts ** layers;
}

export type BreakerState = "closed" | "open" | "half-open";
export type CallResult = "ok" | "fail" | "rejected";

/**
 * Circuit breaker. Closed: calls go through and `threshold` consecutive failures open it.
 * Open: calls are rejected without reaching the backend until `cooldown` seconds have passed,
 * then it is half-open and lets one probe through: success closes it, failure reopens it.
 * `backendOk[i]` says whether call i succeeds if it is actually sent.
 */
export function circuitBreaker(
  times: readonly number[],
  backendOk: readonly boolean[],
  threshold: number,
  cooldown: number,
): { results: CallResult[]; finalState: BreakerState } {
  let state: BreakerState = "closed";
  let failures = 0;
  let openedAt = 0;
  const results = times.map((t, i): CallResult => {
    if (state === "open" && t - openedAt >= cooldown) state = "half-open";
    if (state === "open") return "rejected";
    if (backendOk[i]) {
      state = "closed";
      failures = 0;
      return "ok";
    }
    failures++;
    if (state === "half-open" || failures >= threshold) {
      state = "open";
      openedAt = t;
    }
    return "fail";
  });
  return { results, finalState: state };
}
