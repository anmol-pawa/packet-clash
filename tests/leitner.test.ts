import { describe, expect, it } from "vitest";
import {
  EMPTY_LEITNER,
  INTERVALS,
  boxCounts,
  boxOf,
  cardKey,
  isDue,
  normalizeLeitner,
  pickDeck,
  review,
  startSession,
  type LeitnerState,
} from "@/game/engine/leitner";
import { buildDeck } from "@/game/engine/questions";
import { BANK } from "@/content/questions/bank";
import { GENERATORS, txDelay } from "@/content/questions/generators";

/** Run `n` sessions with nothing reviewed. */
const sessions = (s: LeitnerState, n: number) => Array.from({ length: n }).reduce<LeitnerState>((x) => startSession(x), s);

describe("Leitner box", () => {
  it("promotes one box per right answer up to box 5, and a wrong answer resets to box 1", () => {
    let s = startSession(EMPTY_LEITNER);
    expect(boxOf(s, "arp")).toBe(1);
    const boxes: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = review(s, "arp", true);
      boxes.push(boxOf(s, "arp"));
    }
    expect(boxes).toEqual([2, 3, 4, 5, 5, 5]);
    s = review(s, "arp", false);
    expect(boxOf(s, "arp")).toBe(1);
    expect(s.cards.arp.due).toBe(s.session + 1);
  });

  it("schedules each box by its interval in sessions: 1, 2, 4, 8, 16", () => {
    expect(INTERVALS.slice(1)).toEqual([1, 2, 4, 8, 16]);
    for (let box = 1; box <= 5; box++) {
      // Reach `box` with box-1 right answers in session 1.
      let s = startSession(EMPTY_LEITNER);
      s = box === 1 ? review(s, "arp", false) : Array.from({ length: box - 1 }).reduce<LeitnerState>((x) => review(x, "arp", true), s);
      expect(boxOf(s, "arp")).toBe(box);
      expect(isDue(s, "arp")).toBe(false);
      expect(isDue(sessions(s, INTERVALS[box] - 1), "arp")).toBe(false);
      expect(isDue(sessions(s, INTERVALS[box]), "arp")).toBe(true);
    }
  });

  it("treats unseen cards as due, and a missed card is due next session", () => {
    let s = startSession(EMPTY_LEITNER);
    expect(isDue(s, "never-seen")).toBe(true);
    s = review(s, "dhcp-dora", false);
    expect(isDue(s, "dhcp-dora")).toBe(false);
    expect(isDue(startSession(s), "dhcp-dora")).toBe(true);
  });

  it("keys generated questions by their generator, so every instance shares one card", () => {
    expect(cardKey("arp")).toBe("arp");
    for (const g of GENERATORS) {
      const a = g.generate(1);
      const b = g.generate(987654);
      expect(cardKey(a.id)).toBe(g.id);
      expect(cardKey(b.id)).toBe(g.id);
    }
    let s = startSession(EMPTY_LEITNER);
    s = review(s, txDelay.generate(1).id, true);
    s = review(s, txDelay.generate(2).id, true);
    expect(Object.keys(s.cards)).toEqual([txDelay.id]);
    expect(boxOf(s, txDelay.generate(3).id)).toBe(3);
  });

  it("bank ids never contain ':' and never collide with a generator id", () => {
    const gens = new Set(GENERATORS.map((g) => g.id));
    for (const q of BANK) {
      expect(q.id).not.toContain(":");
      expect(gens.has(q.id)).toBe(false);
    }
  });

  it("is pure: reviewing doesn't mutate the old state", () => {
    const s = startSession(EMPTY_LEITNER);
    const t = review(s, "arp", true);
    expect(s.cards).toEqual({});
    expect(EMPTY_LEITNER).toEqual({ session: 0, cards: {} });
    expect(t).not.toBe(s);
  });

  it("counts cards per box", () => {
    let s = startSession(EMPTY_LEITNER);
    s = review(s, "arp", true);
    s = review(s, "dhcp-dora", false);
    s = review(review(s, "udp-apps", true), "udp-apps", true);
    expect(boxCounts(s)).toEqual([0, 1, 1, 1, 0, 0]);
  });

  it("normalizes saved JSON, dropping anything malformed", () => {
    expect(normalizeLeitner(undefined)).toEqual(EMPTY_LEITNER);
    expect(normalizeLeitner("junk")).toEqual(EMPTY_LEITNER);
    expect(
      normalizeLeitner({
        session: 4,
        cards: { arp: { box: 3, due: 6 }, bad: { box: 9, due: 1 }, half: { box: 2 }, nul: null, frac: { box: 2.5, due: 1 } },
      }),
    ).toEqual({ session: 4, cards: { arp: { box: 3, due: 6 } } });
    expect(normalizeLeitner({ session: -2, cards: [] })).toEqual({ session: 0, cards: {} });
    const s = review(startSession(EMPTY_LEITNER), "arp", true);
    expect(normalizeLeitner(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe("pickDeck", () => {
  const all = BANK.length + GENERATORS.length;

  it("on an empty box it holds the same questions as buildDeck would, deterministically", () => {
    const s = startSession(EMPTY_LEITNER);
    const deck = pickDeck(s, BANK, GENERATORS, { seed: 3, size: 6 });
    expect(deck).toHaveLength(6);
    expect(pickDeck(s, BANK, GENERATORS, { seed: 3, size: 6 })).toEqual(deck);
    expect(new Set(deck.map((q) => cardKey(q.id))).size).toBe(6);
    const full = pickDeck(s, BANK, GENERATORS, { seed: 3, size: all });
    expect(full).toHaveLength(all);
    expect(new Set(full.map((q) => cardKey(q.id)))).toEqual(
      new Set(buildDeck(BANK, GENERATORS, { seed: 3, size: all }).map((q) => cardKey(q.id))),
    );
  });

  it("puts due reviewed cards first, lowest box first, then new cards, then not-due ones", () => {
    let s = startSession(EMPTY_LEITNER);
    // Everything learnt to box 2 except: arp missed (box 1), dhcp-dora in box 3.
    for (const q of BANK) s = review(s, q.id, true);
    for (const g of GENERATORS) s = review(s, g.id, true);
    s = review(s, "dhcp-dora", true);
    s = review(s, "arp", false);
    s = startSession(s); // session 2: arp (box 1) is due; box-2 cards are due at 3, dhcp-dora at 5.
    let deck = pickDeck(s, BANK, GENERATORS, { seed: 1, size: 1 });
    expect(deck.map((q) => q.id)).toEqual(["arp"]);

    s = startSession(s); // session 3: arp and every box-2 card due; arp first.
    const keys = (n: number, seed: number) => pickDeck(s, BANK, GENERATORS, { seed, size: n }).map((q) => cardKey(q.id));
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(keys(1, seed)).toEqual(["arp"]);
      expect(keys(all - 1, seed)).not.toContain("dhcp-dora");
      expect(keys(all, seed)).toContain("dhcp-dora");
    }

    // A brand-new question beats a not-yet-due one but loses to a due one.
    const fresh = { ...BANK[0], id: "fresh-card" };
    deck = pickDeck(s, [...BANK, fresh], GENERATORS, { seed: 7, size: all });
    const picked = deck.map((q) => cardKey(q.id));
    expect(picked).toContain("fresh-card");
    expect(picked).not.toContain("dhcp-dora");
  });

  it("among not-due cards fills with the soonest due first", () => {
    let s = startSession(EMPTY_LEITNER);
    s = review(s, "arp", true); // box 2, due 3
    s = review(review(review(s, "udp-apps", true), "udp-apps", true), "udp-apps", true); // box 4, due 9
    const deck = pickDeck(s, BANK.filter((q) => q.id === "arp" || q.id === "udp-apps"), [], { seed: 4, size: 1 });
    expect(deck.map((q) => q.id)).toEqual(["arp"]);
  });

  it("respects topic and difficulty filters", () => {
    const s = startSession(EMPTY_LEITNER);
    const deck = pickDeck(s, BANK, GENERATORS, { seed: 9, size: 50, topics: ["network"], difficulties: [1, 2] });
    expect(deck.length).toBeGreaterThan(0);
    expect(deck.every((q) => q.topic === "network" && q.difficulty <= 2)).toBe(true);
  });

  it("draws a fresh generated instance per seed", () => {
    const s = startSession(EMPTY_LEITNER);
    const ids = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => pickDeck(s, [], [txDelay], { seed, size: 1 })[0].id),
    );
    expect(ids.size).toBeGreaterThan(1);
  });
});
