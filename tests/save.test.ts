import { describe, expect, it } from "vitest";
import { normalizeSave } from "@/lib/save";

describe("normalizeSave", () => {
  it("keeps a pre-gym-10 save intact and gives gyms 10-16 empty progress", () => {
    const old = { version: 1, xp: 900, badges: [1, 2, 3, 4, 5, 6, 7, 8, 9], seen: ["pingkit"], caught: ["pingkit"], mapTown: "hub", partner: null, lessonsSeen: [1, 2], settings: { volume: 0.2 } };
    const s = normalizeSave(old);
    expect(s.badges).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.xp).toBe(900);
    expect(s.lessonsSeen).toEqual([1, 2]);
    expect(s.mapTown).toBe("hub");
    expect(s.settings).toEqual({ volume: 0.2, music: true, reducedMotion: false, zen: false });
    expect(s.leitner.cards).toEqual({});
    expect(s.daily.streak).toBe(0);
    expect(s.badges.some((b) => b >= 10)).toBe(false);
  });

  it("keeps badges 10-16, de-duplicates and sorts them", () => {
    expect(normalizeSave({ badges: [12, 3, 10, 3, 16] }).badges).toEqual([3, 10, 12, 16]);
  });

  it("repairs wrong-typed fields instead of throwing, and treats junk as a fresh save", () => {
    const s = normalizeSave({ xp: "lots", badges: "all", seen: [1, "a"], settings: 5, leitner: 7, daily: "x" });
    expect(s.xp).toBe(0);
    expect(s.badges).toEqual([]);
    expect(s.seen).toEqual(["a"]);
    expect(s.settings.volume).toBe(0.6);
    for (const junk of [null, 5, "x", [], undefined]) expect(normalizeSave(junk).xp).toBe(0);
  });
});
