/**
 * The daily challenge (ROADMAP 3.1): one deck per calendar day, the same for
 * everyone, plus the streak of consecutive days played. Pure: the page passes
 * in the date and the save.
 */
import { BANK } from "@/content/questions/bank";
import { GENERATORS } from "@/content/questions/generators";
import { pickDeck } from "./leitner";
import type { Question } from "./questions";

/** Questions in one daily challenge. */
export const DAILY_LENGTH = 5;

export interface DailyState {
  /** Day key of the last completed challenge, or null. */
  last: string | null;
  /** Consecutive days completed, ending at `last`. */
  streak: number;
  /** Longest streak ever. */
  best: number;
  /** Correct answers out of DAILY_LENGTH on `last`. */
  score: number;
}

export const EMPTY_DAILY: DailyState = { last: null, streak: 0, best: 0, score: 0 };

/** The local calendar day as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` key (calendar arithmetic, no time zones or DST). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The seed behind a day's deck. */
export function dailySeed(key: string): number {
  return dayNumber(key) * 2654435761 % 2 ** 31;
}

/** The day's questions: identical for the same day key, fresh generator numbers each day. */
export function dailyDeck(key: string, size = DAILY_LENGTH): Question[] {
  return pickDeck({ session: 0, cards: {} }, BANK, GENERATORS, { seed: dailySeed(key), size });
}

/** Has the challenge for `key` already been completed? */
export function doneToday(s: DailyState, key: string): boolean {
  return s.last === key;
}

/** The streak as it stands on `key`: it lapses unless the last day was today or yesterday. */
export function liveStreak(s: DailyState, key: string): number {
  if (s.last === null) return 0;
  const gap = dayNumber(key) - dayNumber(s.last);
  return gap <= 1 && gap >= 0 ? s.streak : 0;
}

/** Record a completed challenge. Playing the same day twice changes nothing. */
export function completeDaily(s: DailyState, key: string, score: number): DailyState {
  if (s.last === key) return s;
  const streak = liveStreak(s, key) + 1;
  return { last: key, streak, best: Math.max(s.best, streak), score };
}

/** Normalise stored data (older saves have none). */
export function normalizeDaily(d: Partial<DailyState> | undefined): DailyState {
  if (!d || typeof d !== "object") return EMPTY_DAILY;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return { last: typeof d.last === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.last) ? d.last : null, streak: n(d.streak), best: n(d.best), score: n(d.score) };
}
