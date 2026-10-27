/**
 * The FAANG mock loop (ROADMAP 5.10): three rounds (rapid-fire concepts, a
 * debugging scenario, a design-flavoured round) and a hire / no-hire
 * scorecard. Pure: the page owns the clock and feeds in each result.
 */
import { BANK } from "@/content/questions/bank";
import { DEBUG_BANK } from "@/content/questions/debugBank";
import { DEBUG_GENERATORS } from "@/content/questions/debugGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { LOADBALANCE_BANK } from "@/content/questions/loadBalanceBank";
import { LOADBALANCE_GENERATORS } from "@/content/questions/loadBalanceGenerators";
import { PERF_BANK } from "@/content/questions/perfBank";
import { PERF_GENERATORS } from "@/content/questions/perfGenerators";
import { RATELIMIT_BANK } from "@/content/questions/rateLimitBank";
import { RATELIMIT_GENERATORS } from "@/content/questions/rateLimitGenerators";
import { REALTIME_BANK } from "@/content/questions/realtimeBank";
import { REALTIME_GENERATORS } from "@/content/questions/realtimeGenerators";
import { SYSDESIGN_BANK } from "@/content/questions/sysdesignBank";
import { SYSDESIGN_GENERATORS } from "@/content/questions/sysdesignGenerators";
import { rng, shuffled } from "@/lib/rng";
import { scorecard, type Result, type Scorecard } from "./mockInterview";
import type { Generator, Question } from "./questions";

export type RoundId = "rapid" | "debug" | "design";

export interface Round {
  id: RoundId;
  title: string;
  blurb: string;
  count: number;
}

export const ROUNDS: readonly Round[] = [
  { id: "rapid", title: "RAPID-FIRE CONCEPTS", blurb: "Short fundamentals from every gym. Be quick and be exact.", count: 6 },
  { id: "debug", title: "DEBUGGING SCENARIO", blurb: "Something is slow or broken. Read the evidence, name the cause.", count: 4 },
  { id: "design", title: "SYSTEM DESIGN", blurb: "Back-of-envelope sizing and the edge, load and traffic choices behind it.", count: 4 },
];

export const LOOP_LENGTH = ROUNDS.reduce((s, r) => s + r.count, 0);

const DEBUG_POOL = { bank: DEBUG_BANK, gens: DEBUG_GENERATORS };
const DESIGN_POOL = {
  bank: [...SYSDESIGN_BANK, ...LOADBALANCE_BANK, ...RATELIMIT_BANK, ...REALTIME_BANK, ...PERF_BANK],
  gens: [...SYSDESIGN_GENERATORS, ...LOADBALANCE_GENERATORS, ...RATELIMIT_GENERATORS, ...REALTIME_GENERATORS, ...PERF_GENERATORS],
};

/** Everything else: the nine gyms' chapters and the interview gauntlet (CCNA has its own exam). */
function rapidPool(): { bank: Question[]; gens: Generator[] } {
  const taken = new Set([...DEBUG_POOL.bank, ...DESIGN_POOL.bank].map((q) => q.id));
  const takenGens = new Set([...DEBUG_POOL.gens, ...DESIGN_POOL.gens].map((g) => g.id));
  return {
    bank: BANK.filter((q) => q.topic !== "ccna" && !taken.has(q.id)),
    gens: GENERATORS.filter((g) => g.topic !== "ccna" && !takenGens.has(g.id)),
  };
}

/** `count` cards: about a third generated (fresh numbers each loop), the rest hand-written, easiest first. */
function dealRound(seed: number, pool: { bank: readonly Question[]; gens: readonly Generator[] }, count: number): Question[] {
  const r = rng(seed);
  const gens = Math.min(pool.gens.length, Math.round(count / 3));
  const picked = [
    ...shuffled(r, pool.bank).slice(0, count - gens),
    ...shuffled(r, pool.gens).slice(0, gens).map((g, i) => g.generate(seed * 31 + i + 1)),
  ];
  return picked.map((q, i) => ({ q, i })).sort((a, b) => a.q.difficulty - b.q.difficulty || a.i - b.i).map((x) => x.q);
}

/** A seeded loop: every round's cards in order, rounds one to three. */
export function loopDeck(seed: number): Question[] {
  const pools = { rapid: rapidPool(), debug: DEBUG_POOL, design: DESIGN_POOL };
  return ROUNDS.flatMap((round, k) => dealRound(seed * 7 + k + 1, pools[round.id], round.count));
}

/** Which round the n-th question (0-based) belongs to. */
export function roundOf(n: number): Round {
  let left = n;
  for (const r of ROUNDS) {
    if (left < r.count) return r;
    left -= r.count;
  }
  return ROUNDS[ROUNDS.length - 1];
}

/** True when the n-th question opens a round. */
export const opensRound = (n: number) => n === 0 || roundOf(n).id !== roundOf(n - 1).id;

export type LoopVerdict = "STRONG HIRE" | "HIRE" | "LEAN NO HIRE" | "NO HIRE";

/** A round scoring under this share is a red flag, whatever the total. */
export const ROUND_BAR = 40;

export interface LoopCard {
  overall: Scorecard;
  rounds: { round: Round; card: Scorecard }[];
  verdict: LoopVerdict;
  /** Rounds under the bar, which cap the verdict at LEAN NO HIRE. */
  redFlags: Round[];
}

/** Hire needs the weighted total and no weak round: one bombed round caps a loop at lean no hire. */
export function loopCard(results: readonly Result[]): LoopCard {
  const overall = scorecard(results);
  let at = 0;
  const rounds = ROUNDS.map((round) => {
    const card = scorecard(results.slice(at, at + round.count));
    at += round.count;
    return { round, card };
  });
  const redFlags = rounds.filter((x) => x.card.total > 0 && x.card.percent < ROUND_BAR).map((x) => x.round);
  return { overall, rounds, verdict: loopVerdict(overall.percent, redFlags.length), redFlags };
}

/** The verdict for a weighted total and the number of rounds under the bar. */
export function loopVerdict(percent: number, redFlags: number): LoopVerdict {
  const verdict: LoopVerdict = percent >= 85 ? "STRONG HIRE" : percent >= 65 ? "HIRE" : percent >= 45 ? "LEAN NO HIRE" : "NO HIRE";
  return redFlags > 0 && (verdict === "STRONG HIRE" || verdict === "HIRE") ? "LEAN NO HIRE" : verdict;
}
