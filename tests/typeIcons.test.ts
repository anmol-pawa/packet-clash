import { describe, expect, it } from "vitest";
import { TYPE_EMBLEMS, TYPE_ICON_SIZE, TYPE_ICONS, typeIcon } from "@/game/art/typeIcons";
import { CHART, matchupReason, TYPE_INFO, TYPES, typeMult } from "@/game/engine/types";
import { parseSprite } from "@/lib/pixel";

describe("type icons", () => {
  it("are one 11×11 sprite per type that parses", () => {
    expect(Object.keys(TYPE_ICONS).sort()).toEqual([...TYPES].sort());
    for (const t of TYPES) {
      const g = parseSprite(TYPE_ICONS[t]);
      expect([g.width, g.height]).toEqual([TYPE_ICON_SIZE, TYPE_ICON_SIZE]);
    }
  });

  it("have 7×7 emblems that all differ", () => {
    const seen = new Set<string>();
    for (const t of TYPES) {
      const e = TYPE_EMBLEMS[t];
      expect(e).toHaveLength(7);
      for (const row of e) expect(row).toMatch(/^[.#]{7}$/);
      seen.add(e.join("|"));
    }
    expect(seen.size).toBe(TYPES.length);
  });

  it("are tiles in the type's colour with rounded corners, an outline and the emblem drawn on top", () => {
    for (const t of TYPES) {
      const def = typeIcon(t);
      const g = parseSprite(def);
      const at = (x: number, y: number) => g.pixels[y * g.width + x];
      // the four corner pixels are transparent; the edge midpoints are outline
      for (const [x, y] of [[0, 0], [10, 0], [0, 10], [10, 10]]) expect(at(x, y)).toBeNull();
      for (const [x, y] of [[5, 0], [0, 5], [10, 5], [5, 10]]) expect(at(x, y)).toBe(def.palette.o);
      expect(def.palette.b).toBe(TYPE_INFO[t].color);
      // every emblem pixel is drawn at an offset of 2
      TYPE_EMBLEMS[t].forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && expect(at(i + 2, j + 2)).toBe(def.palette.w)));
      // the emblem leaves some of the tile's face showing
      const ink = TYPE_EMBLEMS[t].join("").split("#").length - 1;
      expect(ink / 49).toBeLessThanOrEqual(0.7);
      expect(g.pixels.filter((p) => p === def.palette.b).length).toBeGreaterThan(0);
    }
  });
});

describe("type chart screen helpers", () => {
  it("gives the chart's reason for every non-neutral matchup", () => {
    for (const m of CHART) expect(matchupReason(m.atk, m.def)).toBe(m.why);
  });

  it("explains neutral matchups (same type, or unrelated layers)", () => {
    expect(typeMult("NETWORK", "NETWORK")).toBe(1);
    expect(matchupReason("NETWORK", "NETWORK")).toMatch(/same layer/i);
    expect(typeMult("PHYSICAL", "APPLICATION")).toBe(1);
    expect(matchupReason("PHYSICAL", "APPLICATION")).toMatch(/normally/);
  });
});
