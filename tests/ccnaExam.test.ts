import { describe, expect, it } from "vitest";
import { BANK } from "@/content/questions/bank";
import { GENERATORS } from "@/content/questions/generators";
import { DOMAINS, EXAM_LENGTH, allocate, domainOf, examDeck, examScorecard, type DomainId, type ExamResult } from "@/game/engine/ccnaExam";
import { correctResponse, grade } from "@/game/engine/questions";

const ids: DomainId[] = ["fundamentals", "access", "connectivity", "services", "security", "automation"];

describe("CCNA blueprint", () => {
  it("weights sum to 100 and match the 200-301 blueprint", () => {
    expect(DOMAINS.map((d) => d.weight)).toEqual([20, 20, 25, 10, 15, 10]);
    expect(DOMAINS.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });

  it("puts every CCNA card and generator in exactly one domain", () => {
    for (const q of BANK.filter((x) => x.topic === "ccna")) expect(domainOf(q.id), q.id).toBeDefined();
    for (const g of GENERATORS.filter((x) => x.topic === "ccna")) expect(domainOf(g.id), g.id).toBeDefined();
  });

  it("leaves other topics out and gives each domain a deep pool", () => {
    expect(domainOf("router-layer")).toBeUndefined();
    for (const id of ids) {
      const n = BANK.filter((q) => q.topic === "ccna" && domainOf(q.id) === id).length + GENERATORS.filter((g) => g.topic === "ccna" && domainOf(g.id) === id).length;
      expect(n, id).toBeGreaterThanOrEqual(10);
    }
  });

  it("files known cards where the blueprint puts them", () => {
    expect(domainOf("stp-root-election")).toBe("access");
    expect(domainOf("port-sec-modes")).toBe("security");
    expect(domainOf("dhcp-snooping-trust")).toBe("security");
    expect(domainOf("hsrp-election")).toBe("connectivity");
    expect(domainOf("nat-overload")).toBe("services");
    expect(domainOf("auto-rest-verbs")).toBe("automation");
    expect(domainOf("gen-acl-verdict")).toBe("security");
    expect(domainOf("gen-ccna-natterm")).toBe("services");
  });
});

describe("exam deck", () => {
  it("allocates 40 questions 8/8/10/4/6/4", () => {
    expect(allocate(40)).toEqual({ fundamentals: 8, access: 8, connectivity: 10, services: 4, security: 6, automation: 4 });
    for (const n of [1, 7, 33, 100]) expect(Object.values(allocate(n)).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it("is seeded, unique, in blueprint proportion, and every answer grades", () => {
    for (const seed of [1, 2, 99, 12345]) {
      const deck = examDeck(seed);
      expect(deck).toHaveLength(EXAM_LENGTH);
      expect(new Set(deck.map((e) => e.q.id)).size).toBe(EXAM_LENGTH);
      for (const d of DOMAINS) expect(deck.filter((e) => e.domain === d.id)).toHaveLength(allocate(EXAM_LENGTH)[d.id]);
      for (const e of deck) {
        expect(domainOf(e.q.id.split(":")[0]), e.q.id).toBe(e.domain);
        expect(grade(e.q, correctResponse(e.q))).toBe(true);
      }
    }
    expect(examDeck(5).map((e) => e.q.id)).toEqual(examDeck(5).map((e) => e.q.id));
    expect(examDeck(5).map((e) => e.q.id)).not.toEqual(examDeck(6).map((e) => e.q.id));
  });
});

describe("exam scorecard", () => {
  const deck = examDeck(3);
  const mk = (f: (e: (typeof deck)[number]) => boolean): ExamResult[] => deck.map((e) => ({ ...e, correct: f(e), answered: true }));

  it("scores all right as READY and all wrong as KEEP STUDYING", () => {
    const all = examScorecard(mk(() => true));
    expect(all).toMatchObject({ percent: 100, verdict: "READY", correct: 40, missed: [] });
    const none = examScorecard(mk(() => false));
    expect(none).toMatchObject({ percent: 0, verdict: "KEEP STUDYING", missed: deck.map((e) => e.q) });
  });

  it("weights by domain: missing all of IP Connectivity costs its 25 points", () => {
    const sc = examScorecard(mk((e) => e.domain !== "connectivity"));
    expect(sc.percent).toBe(75);
    expect(sc.verdict).toBe("CLOSE");
    expect(sc.weakest?.id).toBe("connectivity");
    expect(sc.domains.find((d) => d.domain.id === "connectivity")).toMatchObject({ correct: 0, total: 10, percent: 0 });
  });

  it("counts unanswered questions as wrong and handles an empty exam", () => {
    const sc = examScorecard(deck.map((e) => ({ ...e, correct: false, answered: false })));
    expect(sc.unanswered).toBe(40);
    expect(examScorecard([])).toMatchObject({ percent: 0, total: 0, weakest: undefined });
  });
});
