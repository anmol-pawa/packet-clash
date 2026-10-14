import { describe, expect, it } from "vitest";
import { gymFoe, gymTown, winBadge } from "@/content/gyms";
import { evolutionOf } from "@/game/art/evolve";
import { PARTNER_ART } from "@/game/art/partners";
import { EVOLVE_MILESTONES, evolutionDue, PARTNER_NAMES, partnerFighter, partnerMaxHp, STARTER, validPartner, winBattle } from "@/game/engine/party";
import { typesOf } from "@/game/engine/types";
import { levelFor, xpReward, xpTotal } from "@/game/engine/xp";

describe("partner creature", () => {
  it("starts as a Lv 5 Pingkit with exactly Lv 5's XP", () => {
    expect(STARTER).toEqual({ species: "pingkit", level: 5, xp: 125 });
    expect(levelFor(STARTER.xp)).toBe(STARTER.level);
  });

  it("fights with level-scaled HP and its species' types", () => {
    expect(partnerMaxHp(5)).toBe(60); // the demo's Pingkit
    expect(partnerFighter(STARTER)).toEqual({ name: "Pingkit", level: 5, hp: 60, maxHp: 60, types: typesOf("pingkit") });
    expect(partnerFighter({ species: "tracevix", level: 12, xp: 1728 })).toMatchObject({ name: "Tracevix", hp: 95, maxHp: 95 });
  });

  it("has art and a name for every species, and milestones that match the art's evolutions", () => {
    for (const id of Object.keys(PARTNER_NAMES)) {
      expect(PARTNER_ART[id]?.name).toBe(PARTNER_NAMES[id]);
      expect(PARTNER_ART[id].size).toBe(64);
    }
    for (const m of EVOLVE_MILESTONES) {
      expect(evolutionOf(m.from)?.id).toBe(m.to);
      expect(gymTown(m.badge)).not.toBeNull();
      expect(m.to in PARTNER_NAMES).toBe(true);
    }
  });

  it("repairs missing, unknown or edited saves", () => {
    expect(validPartner(null)).toEqual(STARTER);
    expect(validPartner({ species: "glitchmon", level: 9, xp: 900 })).toEqual(STARTER);
    expect(validPartner({ species: "pingkit", level: 3 })).toEqual(STARTER);
    // the level always follows the XP
    expect(validPartner({ species: "tracevix", level: 99, xp: 1000.7 })).toEqual({ species: "tracevix", level: 10, xp: 1000 });
    expect(validPartner({ species: "pingkit", level: 5, xp: -5 })).toEqual({ species: "pingkit", level: 1, xp: 0 });
  });

  it("evolves Pingkit once the gym 3 badge is held, not before", () => {
    expect(evolutionDue("pingkit", [])).toBeNull();
    expect(evolutionDue("pingkit", [1, 2])).toBeNull();
    expect(evolutionDue("pingkit", [1, 2, 3])).toBe("tracevix");
    expect(evolutionDue("tracevix", [1, 2, 3, 4])).toBeNull(); // final form
  });

  it("earns boss XP, levels up and evolves through the first three gyms", () => {
    let p = { ...STARTER };
    let badges: number[] = [];
    const log: { level: number; species: string; levels: number[] }[] = [];
    for (const g of [1, 2, 3]) {
      const foe = gymFoe(gymTown(g)!);
      badges = winBadge(badges, g);
      const w = winBattle(p, foe.level, true, badges);
      expect(w.reward).toBe(xpReward(foe.level, true));
      expect(w.partner.xp).toBe(p.xp + w.reward);
      expect(w.partner.level).toBe(levelFor(w.partner.xp));
      expect(w.gain.levelsGained).toEqual(Array.from({ length: w.partner.level - p.level }, (_, i) => p.level + 1 + i));
      expect(w.evolvedTo).toBe(g === 3 ? "tracevix" : null);
      p = w.partner;
      log.push({ level: p.level, species: p.species, levels: w.gain.levelsGained });
    }
    // gym 1 (Lv 6 boss): 125 + 153 = 278 → Lv 6. Gym 2 (Lv 8): +205 = 483 → Lv 7. Gym 3 (Lv 10): +256 = 739 → Lv 9.
    expect(log).toEqual([
      { level: 6, species: "pingkit", levels: [6] },
      { level: 7, species: "pingkit", levels: [7] },
      { level: 9, species: "tracevix", levels: [8, 9] },
    ]);
    expect(p.xp).toBe(739);
    expect(xpTotal(9)).toBeLessThanOrEqual(p.xp);
  });

  it("evolves an older save that already holds the milestone badge on its next win", () => {
    const w = winBattle({ species: "pingkit", level: 9, xp: 729 }, 12, true, [1, 2, 3, 4]);
    expect(w.evolvedTo).toBe("tracevix");
    expect(w.partner.species).toBe("tracevix");
    // a rematch after evolving does not evolve again
    expect(winBattle(w.partner, 12, true, [1, 2, 3, 4]).evolvedTo).toBeNull();
  });
});
