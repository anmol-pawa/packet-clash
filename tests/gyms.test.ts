import { describe, expect, it } from "vitest";
import { gymFoe, gymOpen, gymTown, unlockedBy, winBadge } from "@/content/gyms";
import { currentTown, isUnlocked, TOWNS } from "@/content/world";
import { BOSS_ART } from "@/game/art/bosses";
import { BADGE_SIZE, badgeFrames, badgeSprite, SPARKLE } from "@/game/art/world/badges";
import { parseSprite } from "@/lib/pixel";

describe("gyms", () => {
  it("finds a gym's town from a query value and rejects anything else", () => {
    expect(gymTown("2")?.id).toBe("copperfield");
    expect(gymTown(9)?.name).toBe("Backbone Summit");
    for (const bad of ["0", "10", "x", "", null, undefined, "2.5"]) expect(gymTown(bad)).toBeNull();
  });

  it("makes later leaders tougher, with gym 2 matching the demo Braidwyrm", () => {
    expect(gymFoe(gymTown(2)!)).toEqual({ name: "Braidwyrm", level: 8, hp: 100, maxHp: 100, types: ["PHYSICAL"] });
    for (let g = 2; g <= 9; g++) {
      const [a, b] = [gymFoe(gymTown(g - 1)!), gymFoe(gymTown(g)!)];
      expect(b.level).toBeGreaterThan(a.level);
      expect(b.maxHp).toBeGreaterThan(a.maxHp);
    }
  });

  it("only opens gyms whose leader has art, and every listed art exists", () => {
    for (const t of TOWNS) {
      expect(gymOpen(t)).toBe(t.bossSprite !== null);
      if (t.bossSprite) expect(BOSS_ART[t.bossSprite]?.size).toBe(96);
    }
    // a fresh save can challenge gym 1 and earn its first badge
    expect(gymOpen(gymTown(1)!)).toBe(true);
    expect(gymOpen(gymTown(2)!)).toBe(true);
  });

  it("saves a badge once, in gym order", () => {
    expect(winBadge([], 2)).toEqual([2]);
    expect(winBadge([3, 1], 2)).toEqual([1, 2, 3]);
    expect(winBadge([1, 2], 2)).toEqual([1, 2]);
  });

  it("each win opens the next town, and the whole island after nine badges", () => {
    let badges: number[] = [];
    for (let g = 1; g <= 9; g++) {
      expect(currentTown(badges).gym).toBe(g);
      const next = unlockedBy(g);
      if (next) expect(isUnlocked(next, badges)).toBe(false);
      badges = winBadge(badges, g);
      if (next) {
        expect(next.gym).toBe(g + 1);
        expect(isUnlocked(next, badges)).toBe(true);
      }
    }
    expect(unlockedBy(9)).toBeNull();
    expect(TOWNS.every((t) => isUnlocked(t, badges))).toBe(true);
  });
});

describe("badge art", () => {
  it("draws a 24×24 outlined medal per gym with an emblem and a gold bezel", () => {
    for (const t of TOWNS) {
      const def = badgeSprite(t);
      const g = parseSprite(def);
      expect([g.width, g.height]).toEqual([BADGE_SIZE, BADGE_SIZE]);
      const chars = new Set(def.rows.join(""));
      for (const ch of ["o", "1", "2", "3", "4", "e", "s", "a", "b", "c", "d"]) expect(chars.has(ch), `${t.badge} uses ${ch}`).toBe(true);
      // corners stay clear (octagon), the centre is filled
      expect(def.rows[0][0]).toBe(".");
      expect(g.pixels[12 * BADGE_SIZE + 12]).not.toBeNull();
      // symmetric silhouette
      for (const row of def.rows) expect([...row].map((c) => c === ".").join()).toBe([...row].reverse().map((c) => c === ".").join());
    }
  });

  it("gives every gym a different emblem", () => {
    const emblems = TOWNS.map((t) =>
      badgeSprite(t)
        .rows.map((r) => r.replace(/[^s]/g, "."))
        .join("/"),
    );
    expect(new Set(emblems).size).toBe(TOWNS.length);
  });

  it("sweeps a glint across the gem and comes to rest", () => {
    const t = TOWNS[1];
    const frames = badgeFrames(t);
    expect(frames.length).toBe(10);
    const whites = frames.map((f) => [...f.rows.join("")].filter((c) => c === "w").length);
    expect(Math.max(...whites)).toBeGreaterThan(whites[9] + 5);
    expect(frames[9]).toEqual(badgeSprite(t));
    expect(() => parseSprite(SPARKLE)).not.toThrow();
  });
});
