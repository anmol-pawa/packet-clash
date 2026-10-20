/**
 * The Leitner box: spaced repetition by sessions (one battle = one session).
 *
 * Every card sits in one of five boxes. A right answer promotes it one box
 * (box 5 stays in box 5), a wrong one sends it back to box 1. A card in box b
 * comes due again `INTERVALS[b]` sessions after its review, so missed facts
 * come back next battle and well-known ones only every sixteenth.
 *
 * Cards are keyed by `cardKey`: a hand-written question by its id, a
 * generated one by its generator (each instance is a fresh problem, so the
 * skill is what's being learnt, not the numbers).
 */
import { type DeckOptions, type Difficulty, type Generator, type Question, type TopicId } from "./questions";
import { rng, shuffled } from "@/lib/rng";

export type Box = 1 | 2 | 3 | 4 | 5;

/** Sessions until a card in box b is due again (index 0 unused). */
export const INTERVALS = [0, 1, 2, 4, 8, 16] as const;

export interface LeitnerCard {
  box: Box;
  /** The session at (or after) which this card is due. */
  due: number;
}

export interface LeitnerState {
  /** The current session number (0 before the first battle). */
  session: number;
  cards: Record<string, LeitnerCard>;
}

export const EMPTY_LEITNER: LeitnerState = { session: 0, cards: {} };

/** The Leitner key for a question id: generated ids ("gen-tx-delay:1000:5") collapse to their generator. */
export function cardKey(id: string): string {
  const i = id.indexOf(":");
  return i < 0 ? id : id.slice(0, i);
}

/** Begin a new session (a battle): cards whose `due` has arrived become due. */
export function startSession(s: LeitnerState): LeitnerState {
  return { ...s, session: s.session + 1 };
}

/** Record one answer. New cards start in box 1, so a first right answer puts them in box 2. */
export function review(s: LeitnerState, id: string, correct: boolean): LeitnerState {
  const key = cardKey(id);
  const prev = s.cards[key]?.box ?? 1;
  const box = (correct ? Math.min(5, prev + 1) : 1) as Box;
  return { ...s, cards: { ...s.cards, [key]: { box, due: s.session + INTERVALS[box] } } };
}

/** A card never reviewed is due; a reviewed one once the session reaches its `due`. */
export function isDue(s: LeitnerState, id: string): boolean {
  const c = s.cards[cardKey(id)];
  return !c || c.due <= s.session;
}

/** The box a card sits in (new cards count as box 1). */
export function boxOf(s: LeitnerState, id: string): Box {
  return s.cards[cardKey(id)]?.box ?? 1;
}

/** How many cards are in each box, index 1–5 (index 0 unused). */
export function boxCounts(s: LeitnerState): number[] {
  const out = [0, 0, 0, 0, 0, 0];
  for (const c of Object.values(s.cards)) out[c.box]++;
  return out;
}

/**
 * Rebuild a state from untrusted saved JSON: anything malformed is dropped
 * rather than crashing an old or hand-edited save.
 */
export function normalizeLeitner(raw: unknown): LeitnerState {
  if (!raw || typeof raw !== "object") return EMPTY_LEITNER;
  const r = raw as { session?: unknown; cards?: unknown };
  const session = Number.isInteger(r.session) && (r.session as number) >= 0 ? (r.session as number) : 0;
  const cards: Record<string, LeitnerCard> = {};
  if (r.cards && typeof r.cards === "object") {
    for (const [k, v] of Object.entries(r.cards as Record<string, unknown>)) {
      const c = v as { box?: unknown; due?: unknown } | null;
      if (!c || typeof c !== "object") continue;
      if (!Number.isInteger(c.box) || (c.box as number) < 1 || (c.box as number) > 5) continue;
      if (!Number.isInteger(c.due)) continue;
      cards[k] = { box: c.box as Box, due: c.due as number };
    }
  }
  return { session, cards };
}

/**
 * A battle's questions, preferring what the box says to practise:
 *   1. due cards already reviewed (lowest box first: the shakiest facts),
 *   2. new cards never seen,
 *   3. cards not yet due, soonest first, only to fill the deck.
 * Ties break by seed, and the chosen questions are shuffled so the battle
 * doesn't always open with the hardest card. Call after `startSession`.
 */
export function pickDeck(
  s: LeitnerState,
  questions: readonly Question[],
  generators: readonly Generator[],
  o: DeckOptions,
): Question[] {
  const keep = (x: { topic: TopicId; difficulty: Difficulty }) =>
    (!o.topics || o.topics.includes(x.topic)) && (!o.difficulties || o.difficulties.includes(x.difficulty));
  const r = rng(o.seed);
  const pool = shuffled(r, [
    ...questions.filter(keep).map((q) => ({ key: cardKey(q.id), make: () => q })),
    ...generators.filter(keep).map((g) => {
      const seed = Math.floor(r() * 2 ** 31);
      return { key: g.id, make: () => g.generate(seed) };
    }),
  ]);
  const rank = (key: string): [number, number] => {
    const c = s.cards[key];
    if (!c) return [1, 0];
    if (c.due <= s.session) return [0, c.box];
    return [2, c.due];
  };
  // Array.prototype.sort is stable, so equal ranks keep the seeded order.
  const chosen = pool
    .map((p) => ({ p, rank: rank(p.key) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1])
    .slice(0, o.size)
    .map(({ p }) => p.make());
  return shuffled(r, chosen);
}
