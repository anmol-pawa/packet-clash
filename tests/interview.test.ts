import { describe, expect, it } from "vitest";
import { INTERVIEW_BANK } from "@/content/questions/interviewBank";
import { GYM_TOPICS, gymDeck } from "@/content/questions/decks";
import { EMPTY_LEITNER, startSession } from "@/game/engine/leitner";
import { MOCK_LENGTH, interviewDeck, scorecard, timeLimit, type Result } from "@/game/engine/mockInterview";
import { correctResponse, grade, type Question } from "@/game/engine/questions";
import { broadcastOf, formatIp, parseCidr, usableHosts } from "@/lib/net/ipv4";

const byId = (id: string) => INTERVIEW_BANK.find((q) => q.id === id)!;

describe("interview gauntlet bank", () => {
  it("is all interview-topic with unique ids", () => {
    expect(INTERVIEW_BANK.length).toBeGreaterThanOrEqual(10);
    expect(new Set(INTERVIEW_BANK.map((q) => q.id)).size).toBe(INTERVIEW_BANK.length);
    for (const q of INTERVIEW_BANK) expect(q.topic).toBe("interview");
  });

  it("solves the subnetting questions with the ipv4 helpers", () => {
    const hosts = byId("iv-subnet-hosts");
    expect(hosts.kind === "numeric" && hosts.answer).toBe(usableHosts(27));
    const bc = byId("iv-subnet-broadcast");
    const ip = formatIp(broadcastOf(parseCidr("172.16.5.200/21")));
    expect(ip).toBe("172.16.7.255");
    expect(bc.kind === "numeric" && bc.answer).toBe(Number(ip.split(".")[2]));
  });

  it("gym 9 asks the gauntlet bank, a full deck of right answers", () => {
    expect(GYM_TOPICS[9]).toEqual(["interview"]);
    const deck = gymDeck(startSession(EMPTY_LEITNER), 9, 5);
    expect(deck).toHaveLength(10);
    for (const q of deck) {
      expect(q.topic).toBe("interview");
      expect(grade(q, correctResponse(q))).toBe(true);
    }
  });
});

describe("mock interview", () => {
  const mk = (q: Question, correct: boolean, timedOut = false, seconds = 10): Result => ({ q, correct, timedOut, seconds });

  it("deals a seeded deck of unique cards, easiest first", () => {
    const deck = interviewDeck(7);
    expect(deck).toHaveLength(MOCK_LENGTH);
    expect(new Set(deck.map((q) => q.id)).size).toBe(MOCK_LENGTH);
    expect(interviewDeck(7).map((q) => q.id)).toEqual(deck.map((q) => q.id));
    expect(interviewDeck(8).map((q) => q.id)).not.toEqual(deck.map((q) => q.id));
    const ds = deck.map((q) => q.difficulty);
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
  });

  it("gives ordering and sorting more time and tough questions more than warm-ups", () => {
    const base = { topic: "interview", type: "NETWORK", prompt: "p", explain: "e" } as const;
    const mcq = (difficulty: 1 | 2 | 3): Question => ({ ...base, id: "x", kind: "mcq", difficulty, choices: ["a", "b"], answer: 0 });
    expect(timeLimit(mcq(1))).toBe(30);
    expect(timeLimit(mcq(3))).toBe(60);
    expect(timeLimit(byId("iv-websocket-steps"))).toBe(90);
  });

  it("weights marks by difficulty and picks the verdict", () => {
    const easy = byId("iv-subnet-hosts"); // difficulty 2
    const hard = byId("iv-lb-l4-l7"); // difficulty 3
    const all = scorecard([mk(easy, true), mk(hard, true)]);
    expect(all.percent).toBe(100);
    expect(all.verdict).toBe("STRONG HIRE");
    // 2 of 5 marks → 40%
    const some = scorecard([mk(easy, true), mk(hard, false, true, 60)]);
    expect(some.percent).toBe(40);
    expect(some.verdict).toBe("NOT YET");
    expect(some.timedOut).toBe(1);
    expect(some.missed).toEqual([hard]);
    expect(some.byDifficulty[3]).toEqual({ correct: 0, total: 1 });
    expect(some.averageSeconds).toBe(35);
    // 3 of 5 marks → 60% → borderline; 5 of 7 → 71% → hire
    expect(scorecard([mk(easy, false), mk(hard, true)]).verdict).toBe("BORDERLINE");
    expect(scorecard([mk(easy, true), mk(easy, false), mk(hard, true)]).verdict).toBe("HIRE");
  });

  it("scores an empty interview as zero without dividing by zero", () => {
    expect(scorecard([])).toMatchObject({ percent: 0, total: 0, averageSeconds: 0, verdict: "NOT YET" });
  });
});
