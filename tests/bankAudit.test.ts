import { describe, expect, it } from "vitest";
import { correctResponse, grade, answerText, type Question } from "@/game/engine/questions";
import { BANK } from "@/content/questions/bank";
import { GENERATORS } from "@/content/questions/generators";
import { MOCK_POOL } from "@/game/engine/mockInterview";
import { TYPES } from "@/game/engine/types";

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);
const TOPICS = new Set(["models", "link", "network", "routing", "transport", "application", "security", "journey", "interview", "ccna"]);

/** Every structural rule a question must meet, whether hand-written or generated. */
function audit(q: Question, where: string): void {
  expect(q.id, where).toMatch(/^\S.*$/);
  expect(TOPICS.has(q.topic), `${where} topic`).toBe(true);
  expect(TYPES as readonly string[], `${where} type`).toContain(q.type);
  expect([1, 2, 3], `${where} difficulty`).toContain(q.difficulty);
  expect(q.prompt.trim().length, `${where} prompt`).toBeGreaterThan(8);
  expect(q.explain.trim().length, `${where} explain`).toBeGreaterThan(20);
  expect(grade(q, correctResponse(q)), `${where} correct response grades`).toBe(true);
  expect(answerText(q).length, `${where} answer text`).toBeGreaterThan(0);
  switch (q.kind) {
    case "mcq":
      expect(q.choices.length, where).toBeGreaterThanOrEqual(3);
      expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${where} answer index`).toBe(true);
      expect(new Set(q.choices).size, `${where} duplicate choices`).toBe(q.choices.length);
      expect(q.choices.every((c) => c.trim().length > 0), `${where} blank choice`).toBe(true);
      break;
    case "multi":
      expect(q.choices.length, where).toBeGreaterThanOrEqual(3);
      expect(new Set(q.choices).size, `${where} duplicate choices`).toBe(q.choices.length);
      expect(q.answers.length, `${where} answers`).toBeGreaterThanOrEqual(1);
      expect(new Set(q.answers).size, `${where} repeated answers`).toBe(q.answers.length);
      expect(q.answers.every((i) => Number.isInteger(i) && i >= 0 && i < q.choices.length), `${where} answer indexes`).toBe(true);
      expect(q.answers.length, `${where} every choice correct`).toBeLessThan(q.choices.length);
      break;
    case "numeric":
      expect(Number.isFinite(q.answer), where).toBe(true);
      expect(q.tolerance ?? 0, where).toBeGreaterThanOrEqual(0);
      break;
    case "order":
      expect(q.steps.length, where).toBeGreaterThanOrEqual(3);
      expect(new Set(q.steps).size, `${where} duplicate steps`).toBe(q.steps.length);
      break;
    case "sort":
      expect(q.bins.length, where).toBeGreaterThanOrEqual(2);
      expect(new Set(q.bins).size, `${where} duplicate bins`).toBe(q.bins.length);
      expect(new Set(q.items.map((i) => i.label)).size, `${where} duplicate items`).toBe(q.items.length);
      expect(q.items.every((i) => Number.isInteger(i.bin) && i.bin >= 0 && i.bin < q.bins.length), `${where} item bins`).toBe(true);
      break;
  }
}

/** Share of each answer slot among the given MCQs. */
function slotShares(qs: readonly Question[]): number[] {
  const mcq = qs.filter((q) => q.kind === "mcq");
  const counts = [0, 0, 0, 0];
  for (const q of mcq) if (q.kind === "mcq") counts[q.answer]++;
  return counts.map((c) => c / Math.max(1, mcq.length));
}

describe("whole-bank audit", () => {
  it("has unique ids and passes the structural audit for every hand-written question", () => {
    expect(new Set(BANK.map((q) => q.id)).size).toBe(BANK.length);
    for (const q of BANK) audit(q, `bank:${q.id}`);
  });

  it("balances the mock-interview pool too, and keeps its ids inside the bank", () => {
    for (const s of slotShares(MOCK_POOL)) {
      expect(s).toBeGreaterThan(0.15);
      expect(s).toBeLessThan(0.4);
    }
    const ids = new Set(BANK.map((q) => q.id));
    for (const q of MOCK_POOL) expect(ids.has(q.id), q.id).toBe(true);
    for (const q of MOCK_POOL) audit(q, `mock:${q.id}`);
  });

  it("keeps generator ids unique and distinct from bank ids", () => {
    const ids = GENERATORS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    const bank = new Set(BANK.map((q) => q.id));
    for (const id of ids) expect(bank.has(id), id).toBe(false);
  });

  it("does not make the correct MCQ slot predictable across the bank or any chapter", () => {
    const all = slotShares(BANK);
    for (const s of all) {
      expect(s).toBeGreaterThan(0.15);
      expect(s).toBeLessThan(0.4);
    }
    const byTopic = new Map<string, Question[]>();
    for (const q of BANK) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
    for (const [topic, qs] of byTopic) {
      const n = qs.filter((q) => q.kind === "mcq").length;
      if (n < 20) continue;
      for (const s of slotShares(qs)) {
        expect(s, `${topic} (${n} mcq)`).toBeGreaterThan(0.08);
        expect(s, `${topic} (${n} mcq)`).toBeLessThan(0.5);
      }
    }
  });

  // Known weakness (ROADMAP 7.1b): hand-written correct answers are usually the
  // most detailed choice. This ratchet stops it getting worse until distractors
  // are padded; lower the limit as banks are fixed.
  it("does not let the longest choice give the answer away more than it does today", () => {
    const mcq = BANK.filter((q) => q.kind === "mcq");
    let longest = 0;
    for (const q of mcq) {
      if (q.kind !== "mcq") continue;
      const lens = q.choices.map((c) => c.length);
      if (lens.indexOf(Math.max(...lens)) === q.answer) longest++;
    }
    expect(longest / mcq.length).toBeLessThan(0.7);
  });

  // Chapters already padded (7.1b): keep their distractors as detailed as the answer.
  it("keeps padded chapters (load balancing, rate limiting, datacenter, sockets, web security, debugging, transport performance, real-time) below their longest-answer limits", () => {
    for (const [prefix, limit] of [["lb-", 0.75], ["rl-", 0.75], ["dc-", 0.65], ["sock-", 0.60], ["websec-", 0.60], ["dbg-", 0.45], ["tp-", 0.65], ["rt-", 0.70]] as const) {
      const mcq = BANK.filter((q) => q.kind === "mcq" && q.id.startsWith(prefix));
      let longest = 0;
      for (const q of mcq) {
        if (q.kind !== "mcq") continue;
        const lens = q.choices.map((c) => c.length);
        if (lens.indexOf(Math.max(...lens)) === q.answer) longest++;
      }
      expect(longest / mcq.length, prefix).toBeLessThan(limit);
    }
  });

  it("builds every generator deterministically and well-formed over 40 seeds", () => {
    for (const g of GENERATORS) {
      const shown = new Set<string>();
      for (const seed of SEEDS) {
        const a = g.generate(seed);
        const b = g.generate(seed);
        expect(b, `${g.id} seed ${seed} deterministic`).toEqual(a);
        audit(a, `${g.id}@${seed}`);
        expect(a.topic, `${g.id} topic matches generator`).toBe(g.topic);
        shown.add(JSON.stringify(a));
      }
      expect(shown.size, `${g.id} varies with the seed`).toBeGreaterThan(3);
    }
  });

  it("spreads generated MCQ answers over all slots", () => {
    for (const g of GENERATORS) {
      const qs = SEEDS.map((s) => g.generate(s));
      const mcq = qs.filter((q) => q.kind === "mcq" && q.choices.length === 4);
      if (mcq.length < 30) continue;
      const shares = slotShares(mcq);
      for (const s of shares) {
        expect(s, `${g.id} ${shares.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.03);
        expect(s, `${g.id} ${shares.map((x) => x.toFixed(2))}`).toBeLessThan(0.6);
      }
    }
  });
});
