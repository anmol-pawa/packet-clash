/**
 * The mock interview (ROADMAP 2.9b): a timed set of the gauntlet's questions
 * and the scorecard that follows. Pure: the page owns the clock and feeds in
 * each result.
 */
import { DEBUG_BANK } from "@/content/questions/debugBank";
import { INTERVIEW_BANK } from "@/content/questions/interviewBank";
import { LOADBALANCE_BANK } from "@/content/questions/loadBalanceBank";
import { PERF_BANK } from "@/content/questions/perfBank";
import { RATELIMIT_BANK } from "@/content/questions/rateLimitBank";
import { REALTIME_BANK } from "@/content/questions/realtimeBank";
import { SOCKET_BANK } from "@/content/questions/socketBank";
import { SYSDESIGN_BANK } from "@/content/questions/sysdesignBank";
import { WEBSEC_BANK } from "@/content/questions/webSecBank";
import { rng, shuffled } from "@/lib/rng";
import type { Difficulty, Question } from "./questions";

/** Questions in one interview. */
export const MOCK_LENGTH = 8;

/** Seconds allowed per question: tougher follow-ups and longer answers get longer. */
export function timeLimit(q: Question): number {
  const base: Record<Difficulty, number> = { 1: 30, 2: 45, 3: 60 };
  return base[q.difficulty] + (q.kind === "order" || q.kind === "sort" ? 30 : 0);
}

/** Every hand-written interview card: the gauntlet plus the SDE chapters (sockets, web security, debugging, design, performance). */
export const MOCK_POOL: readonly Question[] = [
  ...INTERVIEW_BANK,
  ...SOCKET_BANK,
  ...WEBSEC_BANK,
  ...DEBUG_BANK,
  ...SYSDESIGN_BANK,
  ...LOADBALANCE_BANK,
  ...RATELIMIT_BANK,
  ...REALTIME_BANK,
  ...PERF_BANK,
];

/** A seeded interview: a shuffled pick, warm-ups first and tough follow-ups last. */
export function interviewDeck(seed: number, size = MOCK_LENGTH): Question[] {
  const picked = shuffled(rng(seed), MOCK_POOL).slice(0, size);
  return picked.map((q, i) => ({ q, i })).sort((a, b) => a.q.difficulty - b.q.difficulty || a.i - b.i).map((x) => x.q);
}

export interface Result {
  q: Question;
  correct: boolean;
  /** Ran out of time (always wrong). */
  timedOut: boolean;
  /** Seconds used, at most the time limit. */
  seconds: number;
}

export type Verdict = "STRONG HIRE" | "HIRE" | "BORDERLINE" | "NOT YET";

export interface Scorecard {
  /** Difficulty-weighted share of marks earned, 0–100. */
  percent: number;
  verdict: Verdict;
  correct: number;
  total: number;
  timedOut: number;
  /** Mean seconds per answered question. */
  averageSeconds: number;
  /** Marks earned out of marks available, per difficulty. */
  byDifficulty: Record<Difficulty, { correct: number; total: number }>;
  /** Questions to revisit (wrong or timed out), in the order asked. */
  missed: Question[];
}

/** A right answer is worth its difficulty; a timeout or miss is worth nothing. */
export function scorecard(results: readonly Result[]): Scorecard {
  const byDifficulty: Scorecard["byDifficulty"] = { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 } };
  let earned = 0;
  let available = 0;
  for (const r of results) {
    const d = r.q.difficulty;
    byDifficulty[d].total++;
    available += d;
    if (r.correct) {
      byDifficulty[d].correct++;
      earned += d;
    }
  }
  const percent = available === 0 ? 0 : Math.round((earned / available) * 100);
  const verdict: Verdict = percent >= 85 ? "STRONG HIRE" : percent >= 65 ? "HIRE" : percent >= 45 ? "BORDERLINE" : "NOT YET";
  const seconds = results.reduce((s, r) => s + r.seconds, 0);
  return {
    percent,
    verdict,
    correct: results.filter((r) => r.correct).length,
    total: results.length,
    timedOut: results.filter((r) => r.timedOut).length,
    averageSeconds: results.length === 0 ? 0 : Math.round((seconds / results.length) * 10) / 10,
    byDifficulty,
    missed: results.filter((r) => !r.correct).map((r) => r.q),
  };
}
