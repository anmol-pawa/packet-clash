/**
 * 5.9 system-design back-of-envelope problems. Answers come from `lib/net/sysdesign`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { avgQps, bandwidthMbps, concurrency, monthlyEgressUsd, originQps, peakQps, serversNeeded } from "@/lib/net/sysdesign";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "APPLICATION" } as const;
const fmt = (n: number) => n.toLocaleString("en-US");

export const peakQpsGen: Generator = {
  id: "gen-sde-peakqps",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    // 86.4 million requests a day is exactly 1,000 QPS on average.
    const k = pick(r, [1, 2, 3, 5, 10]);
    const factor = pick(r, [2, 3, 4]);
    const perDay = k * 86_400_000;
    const peak = peakQps(avgQps(perDay), factor);
    return {
      id: `gen-sde-peakqps:${k}:${factor}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A service handles ${fmt(perDay)} requests a day, and its peak is ${factor}x the daily average. What peak QPS should you plan for?`,
      answer: peak,
      unit: "QPS",
      explain: `Average = ${fmt(perDay)} / 86,400 s = ${fmt(avgQps(perDay))} QPS. Peak = ${factor} x ${fmt(avgQps(perDay))} = ${fmt(peak)} QPS. Size for the peak, not the average.`,
    } satisfies Question;
  },
};

export const bandwidthGen: Generator = {
  id: "gen-sde-bandwidth",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const qps = pick(r, [500, 1000, 2000, 5000, 10_000]);
    const [kb, bytes] = pick(r, [[10, 10_000], [50, 50_000], [100, 100_000], [250, 250_000]] as const);
    const mbps = bandwidthMbps(qps, bytes);
    return {
      id: `gen-sde-bandwidth:${qps}:${bytes}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A service sends ${fmt(qps)} responses per second of ${kb} kB each (1 kB = 1,000 bytes). How much outbound bandwidth does it need, in Mbit/s?`,
      answer: mbps,
      unit: "Mbit/s",
      explain: `${fmt(qps)} x ${fmt(bytes)} bytes x 8 bits = ${fmt(qps * bytes * 8)} bit/s = ${fmt(mbps)} Mbit/s. Remember the x8 from bytes to bits, and add headroom for protocol overhead.`,
    } satisfies Question;
  },
};

export const fleetGen: Generator = {
  id: "gen-sde-fleet",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const peak = pick(r, [4500, 7200, 12_000, 25_000, 41_000]);
    const per = pick(r, [800, 1000, 1500, 2500]);
    const n = serversNeeded(peak, per);
    return {
      id: `gen-sde-fleet:${peak}:${per}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `Peak load is ${fmt(peak)} QPS and one server sustains ${fmt(per)} QPS. How many servers do you need to carry the peak (no spare)?`,
      answer: n,
      unit: "servers",
      explain: `${fmt(peak)} / ${fmt(per)} = ${(peak / per).toFixed(2)}, rounded up to ${n}. In production add an N+1 spare (or a zone's worth) so one failure doesn't overload the rest.`,
    } satisfies Question;
  },
};

export const littleGen: Generator = {
  id: "gen-sde-little",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const qps = pick(r, [200, 500, 2000, 5000, 20_000]);
    const ms = pick(r, [20, 50, 100, 250, 500]);
    const n = concurrency(qps, ms / 1000);
    return {
      id: `gen-sde-little:${qps}:${ms}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A server receives ${fmt(qps)} requests per second and each takes ${ms} ms from accept to close. On average, how many connections are open at once?`,
      answer: n,
      unit: "connections",
      explain: `Little's law: L = lambda x W = ${fmt(qps)}/s x ${ms / 1000} s = ${fmt(n)}. Slower responses mean more open connections for the same traffic, which is how a slow database exhausts a server's connection limit.`,
    } satisfies Question;
  },
};

export const cdnGen: Generator = {
  id: "gen-sde-cdn",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const qps = pick(r, [10_000, 20_000, 50_000, 100_000]);
    const hit = pick(r, [80, 90, 95, 99]);
    const origin = originQps(qps, hit / 100);
    return {
      id: `gen-sde-cdn:${qps}:${hit}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A site gets ${fmt(qps)} requests per second and its CDN has a ${hit}% cache hit ratio. How many requests per second reach the origin?`,
      answer: origin,
      tolerance: 0.5,
      unit: "QPS",
      explain: `Misses = ${100 - hit}% of ${fmt(qps)} = ${fmt(origin)} QPS. Going from 90% to 99% hits cuts origin load tenfold, which is why hit ratio matters more than raw CDN capacity.`,
    } satisfies Question;
  },
};

export const egressGen: Generator = {
  id: "gen-sde-egress",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const tb = pick(r, [1, 2, 5, 10, 20]);
    const price = pick(r, [0.02, 0.05, 0.08, 0.09]);
    const usd = monthlyEgressUsd(tb, price);
    return {
      id: `gen-sde-egress:${tb}:${price}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `You serve ${tb} TB a day to the internet at $${price.toFixed(2)} per GB of egress (1 TB = 1,000 GB). What is the monthly bill for a 30-day month, in dollars?`,
      answer: usd,
      tolerance: 0.5,
      unit: "USD",
      explain: `${tb} TB x 1,000 GB x 30 days = ${fmt(tb * 30_000)} GB; at $${price.toFixed(2)} per GB that is $${fmt(Math.round(usd))}. Egress is why CDNs, compression and caching are cost levers, not just speed levers.`,
    } satisfies Question;
  },
};

export const SYSDESIGN_GENERATORS: readonly Generator[] = [peakQpsGen, bandwidthGen, fleetGen, littleGen, cdnGen, egressGen];
