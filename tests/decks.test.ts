import { describe, expect, it } from "vitest";
import { DECK_SIZE, GYM_TOPICS, demoDeck, gymDeck } from "@/content/questions/decks";
import { BANK } from "@/content/questions/bank";
import { GENERATORS } from "@/content/questions/generators";
import { EMPTY_LEITNER, cardKey, review, startSession } from "@/game/engine/leitner";
import { correctResponse, grade } from "@/game/engine/questions";

const keys = (qs: { id: string }[]) => qs.map((q) => cardKey(q.id));

describe("battle decks", () => {
  it("a gym deck is full, has no repeated card, and is seeded", () => {
    for (let gym = 1; gym <= 9; gym++) {
      const s = startSession(EMPTY_LEITNER);
      const deck = gymDeck(s, gym, 42);
      expect(deck).toHaveLength(DECK_SIZE);
      expect(new Set(keys(deck)).size).toBe(DECK_SIZE);
      expect(keys(gymDeck(s, gym, 42))).toEqual(keys(deck));
      for (const q of deck) expect(grade(q, correctResponse(q))).toBe(true);
    }
  });

  it("a gym asks its own chapter first", () => {
    const own = (gym: number) => {
      const topics = GYM_TOPICS[gym];
      return BANK.filter((q) => topics.includes(q.topic)).length + GENERATORS.filter((g) => topics.includes(g.topic)).length;
    };
    for (const gym of [1, 3, 5]) {
      const deck = gymDeck(startSession(EMPTY_LEITNER), gym, 9);
      const n = Math.min(DECK_SIZE, own(gym));
      expect(n).toBeGreaterThan(0);
      expect(deck.filter((q) => GYM_TOPICS[gym].includes(q.topic)).length).toBe(n);
    }
  });

  it("a missed card comes back in its gym's next battle", () => {
    let s = startSession(EMPTY_LEITNER);
    // Miss one network card and pass the rest: the miss is due again next session.
    const first = gymDeck(s, 3, 1);
    const missed = first.find((q) => q.topic === "network")!;
    for (const q of first) s = review(s, q.id, q !== missed);
    s = startSession(s);
    expect(keys(gymDeck(s, 3, 2))).toContain(cardKey(missed.id));
  });

  it("the demo opens with one question of each kind and covers the whole bank", () => {
    const deck = demoDeck(7);
    expect(deck.slice(0, 5).map((q) => q.kind)).toEqual(["mcq", "multi", "numeric", "order", "sort"]);
    expect(deck).toHaveLength(BANK.length + GENERATORS.length);
    expect(keys(demoDeck(7))).toEqual(keys(deck));
  });
});

describe("Cisco Cove and Scale Citadel decks (6.3)", () => {
  const all = [...BANK, ...GENERATORS];

  it("every CCNA and interview card is claimed by a gym on purpose, and every gym 10-16 has a deep pool", async () => {
    const { focusGym } = await import("@/content/questions/decks");
    const pool: Record<number, number> = {};
    for (const x of all) {
      const g = focusGym(x.topic, x.id);
      if (g === null) {
        expect(["ccna", "interview"]).not.toContain(x.topic);
        continue;
      }
      pool[g] = (pool[g] ?? 0) + 1;
    }
    for (const gym of [10, 11, 12, 13, 14, 15, 16]) expect(pool[gym], `gym ${gym}`).toBeGreaterThanOrEqual(25);
    expect(focusGym("ccna", "gen-ccna-stp-root")).toBe(10);
    expect(focusGym("ccna", "ospf-dr-election")).toBe(11);
    expect(focusGym("ccna", "gen-ccna-natpool")).toBe(12);
    expect(focusGym("ccna", "gen-acl-verdict")).toBe(13);
    expect(focusGym("interview", "gen-sde-ringmoved")).toBe(14);
    expect(focusGym("interview", "gen-sde-leafspine")).toBe(15);
    expect(focusGym("interview", "dbg-502")).toBe(16);
    expect(focusGym("models", "osi-layers")).toBeNull();
  });

  it("each new gym deck is full, unique, seeded, graded correctly and stays on its own chapter", async () => {
    const { focusGym } = await import("@/content/questions/decks");
    const idOf = (q: { id: string; topic: string }) => q.id;
    const genIds = new Set(GENERATORS.map((g) => g.id));
    for (let gym = 10; gym <= 16; gym++) {
      const s = startSession(EMPTY_LEITNER);
      const deck = gymDeck(s, gym, 7);
      expect(deck).toHaveLength(DECK_SIZE);
      expect(new Set(keys(deck)).size).toBe(DECK_SIZE);
      expect(keys(gymDeck(s, gym, 7))).toEqual(keys(deck));
      for (const q of deck) {
        expect(grade(q, correctResponse(q))).toBe(true);
        // Generated questions carry the generator id's stem; fixed ones their own id.
        const src = all.find((x) => x.id === idOf(q) || (genIds.has(x.id) && q.id.startsWith(x.id)));
        expect(src, q.id).toBeDefined();
        expect(focusGym(src!.topic, src!.id), `${q.id} in gym ${gym}`).toBe(gym);
      }
    }
  });
});
