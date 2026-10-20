/**
 * Which questions a battle asks. A gym asks about its own chapter first (due
 * Leitner cards before new ones), then tops the deck up from every chapter
 * while its chapter's bank is still small. The demo battle shows one of each
 * question kind.
 */
import { cardKey, pickDeck, type LeitnerState } from "@/game/engine/leitner";
import type { Question, QuestionKind, TopicId } from "@/game/engine/questions";
import { BANK } from "./bank";
import { GENERATORS } from "./generators";

/** Questions per battle (the deck cycles if the battle runs longer). */
export const DECK_SIZE = 10;

/** Each gym's chapter (gyms 7–9, security, the URL journey and the gauntlet, draw from everything). */
export const GYM_TOPICS: Readonly<Record<number, readonly TopicId[]>> = {
  1: ["models"],
  2: ["link"],
  3: ["network"],
  4: ["routing"],
  5: ["transport"],
  6: ["application"],
};

/** A gym battle's deck: its chapter's cards first, then any chapter's, never the same card twice. */
export function gymDeck(s: LeitnerState, gym: number, seed: number, size = DECK_SIZE): Question[] {
  const topics = GYM_TOPICS[gym];
  const own = pickDeck(s, BANK, GENERATORS, { seed, size, topics });
  if (own.length >= size) return own;
  const used = new Set(own.map((q) => cardKey(q.id)));
  const rest = pickDeck(
    s,
    BANK.filter((q) => !used.has(cardKey(q.id))),
    GENERATORS.filter((g) => !used.has(g.id)),
    { seed: seed + 1, size: size - own.length },
  );
  return [...own, ...rest];
}

const DEMO_KINDS: readonly QuestionKind[] = ["mcq", "multi", "numeric", "order"];

/** The demo battle: one question of each kind first, so a short battle shows them all, then the rest of the bank. */
export function demoDeck(seed: number): Question[] {
  const deck = pickDeck({ session: 0, cards: {} }, BANK, GENERATORS, { seed, size: BANK.length + GENERATORS.length });
  const firsts = DEMO_KINDS.map((k) => deck.find((q) => q.kind === k)).filter((q): q is Question => !!q);
  return [...firsts, ...deck.filter((q) => !firsts.includes(q))];
}
