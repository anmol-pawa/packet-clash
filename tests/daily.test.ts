import { describe, expect, it } from "vitest";
import { DAILY_LENGTH, EMPTY_DAILY, completeDaily, dailyDeck, dailySeed, dayKey, dayNumber, doneToday, liveStreak, normalizeDaily } from "@/game/engine/daily";
import { correctResponse, grade } from "@/game/engine/questions";

describe("daily challenge", () => {
  it("formats local day keys and counts days across month, year and leap boundaries", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("2024-03-01") - dayNumber("2024-02-28")).toBe(2);
    expect(dayNumber("2026-01-01") - dayNumber("2025-12-31")).toBe(1);
  });

  it("deals the same deck on the same day and a different one the next", () => {
    const a = dailyDeck("2026-10-22");
    expect(a).toHaveLength(DAILY_LENGTH);
    expect(dailyDeck("2026-10-22").map((q) => q.id)).toEqual(a.map((q) => q.id));
    expect(dailySeed("2026-10-22")).not.toBe(dailySeed("2026-10-23"));
    expect(dailyDeck("2026-10-23").map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it("every daily question can be answered right", () => {
    for (const day of ["2026-10-22", "2026-10-23", "2027-02-28"]) for (const q of dailyDeck(day)) expect(grade(q, correctResponse(q))).toBe(true);
  });

  it("extends the streak on consecutive days and restarts after a gap", () => {
    let s = completeDaily(EMPTY_DAILY, "2026-10-20", 4);
    expect(s).toMatchObject({ streak: 1, best: 1, score: 4 });
    s = completeDaily(s, "2026-10-21", 5);
    s = completeDaily(s, "2026-10-22", 3);
    expect(s).toMatchObject({ streak: 3, best: 3, last: "2026-10-22", score: 3 });
    expect(liveStreak(s, "2026-10-23")).toBe(3);
    expect(liveStreak(s, "2026-10-24")).toBe(0);
    s = completeDaily(s, "2026-10-25", 5);
    expect(s).toMatchObject({ streak: 1, best: 3 });
  });

  it("counts a day once", () => {
    const s = completeDaily(EMPTY_DAILY, "2026-10-22", 2);
    expect(doneToday(s, "2026-10-22")).toBe(true);
    expect(completeDaily(s, "2026-10-22", 5)).toBe(s);
  });

  it("normalises missing or damaged saves", () => {
    expect(normalizeDaily(undefined)).toEqual(EMPTY_DAILY);
    expect(normalizeDaily({ last: "yesterday", streak: -3, best: 2.7 })).toEqual({ last: null, streak: 0, best: 2, score: 0 });
  });
});
