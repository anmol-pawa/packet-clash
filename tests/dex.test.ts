import { describe, expect, it } from "vitest";
import { TOWNS } from "@/content/world";
import { BOSS_ART } from "@/game/art/bosses";
import { PARTNER_ART } from "@/game/art/partners";
import { DEX, dexLabel, dexNumber, dexRecord, dexStatus, lineUpTo, record, recordEncounter, recordStarter, recordWin } from "@/game/engine/dex";
import { parseSprite, silhouette } from "@/lib/pixel";

const EMPTY = { seen: [], caught: [] };

describe("Packetdex", () => {
  it("lists the starter lines, then the gym leaders in gym order, each with art", () => {
    expect(DEX.slice(0, 6)).toEqual(["framadillo", "trunkadillo", "pingkit", "tracevix", "ackorn", "oakwind"]);
    expect(DEX.slice(6)).toEqual(TOWNS.map((t) => t.bossSprite));
    expect(new Set(DEX).size).toBe(DEX.length);
    for (const id of DEX) expect(PARTNER_ART[id] ?? BOSS_ART[id], id).toBeDefined();
    // every creature with art is in the dex
    expect([...Object.keys(PARTNER_ART), ...Object.keys(BOSS_ART)].sort()).toEqual([...DEX].sort());
    expect(dexNumber("framadillo")).toBe(1);
    expect(dexLabel("stackadon")).toBe("No. 007");
    expect(dexLabel("gigaroc")).toBe("No. 015");
    expect(dexNumber("nobody")).toBe(0);
  });

  it("walks an evolution line back to its base form", () => {
    expect(lineUpTo("oakwind")).toEqual(["ackorn", "oakwind"]);
    expect(lineUpTo("pingkit")).toEqual(["pingkit"]);
  });

  it("keeps records in dex order, without duplicates or unknown ids, and catching implies seeing", () => {
    const r = record({ seen: ["gigaroc", "zzz"], caught: [] }, ["stackadon", "gigaroc"], ["pingkit"]);
    expect(r).toEqual({ seen: ["pingkit", "stackadon", "gigaroc"], caught: ["pingkit"] });
    expect(dexStatus(r, "pingkit")).toBe("caught");
    expect(dexStatus(r, "gigaroc")).toBe("seen");
    expect(dexStatus(r, "keyvern")).toBe("unseen");
  });

  it("records the starter choice, then a gym encounter and win", () => {
    let r = recordStarter(EMPTY, "ackorn");
    expect(r).toEqual({ seen: ["framadillo", "pingkit", "ackorn"], caught: ["ackorn"] });
    r = recordEncounter(r, "stackadon", "ackorn");
    expect(dexStatus(r, "stackadon")).toBe("seen");
    r = recordWin(r, "stackadon", "ackorn");
    expect(dexStatus(r, "stackadon")).toBe("caught");
    // a win that evolves the partner catches the new form too
    r = recordWin(r, "cidrab", "oakwind");
    expect(r.caught).toEqual(["ackorn", "oakwind", "stackadon", "cidrab"]);
  });

  it("rebuilds the dex of older saves from their partner and badges", () => {
    // a brand-new save has seen nothing
    expect(dexRecord({ partner: null, badges: [] })).toEqual(EMPTY);
    // a save from before the starter choice played as Pingkit, and evolved at badge 3
    const old = dexRecord({ partner: null, badges: [1, 2] });
    expect(old.caught).toEqual(["pingkit", "stackadon", "braidwyrm"]);
    const evolved = dexRecord({ seen: [], caught: [], partner: { species: "tracevix" }, badges: [1, 2, 3] });
    expect(evolved.caught).toEqual(["pingkit", "tracevix", "stackadon", "braidwyrm", "cidrab"]);
    expect(evolved.seen).toEqual(["framadillo", "pingkit", "tracevix", "ackorn", "stackadon", "braidwyrm", "cidrab"]);
    // junk in the save is ignored
    expect(dexRecord({ seen: [3, "keyvern", null], caught: "x", partner: null, badges: [] })).toEqual({ seen: ["keyvern"], caught: [] });
  });

  it("draws unseen creatures as a one-colour silhouette with the same outline", () => {
    for (const id of ["pingkit", "gigaroc"]) {
      const art = PARTNER_ART[id] ?? BOSS_ART[id];
      const def = art.front.idle[0];
      const src = parseSprite(def);
      const sil = parseSprite(silhouette(def, "#20183a"));
      expect(sil.width).toBe(src.width);
      expect(sil.pixels.map((p) => p !== null)).toEqual(src.pixels.map((p) => p !== null));
      expect(new Set(sil.pixels.filter(Boolean))).toEqual(new Set(["#20183a"]));
    }
  });
});
