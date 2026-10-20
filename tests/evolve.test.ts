import { describe, expect, it } from "vitest";
import { ACKORN } from "@/game/art/creatures/ackorn";
import { FRAMADILLO } from "@/game/art/creatures/framadillo";
import { OAKWIND } from "@/game/art/creatures/oakwind";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { TRACEVIX } from "@/game/art/creatures/tracevix";
import { TRUNKADILLO } from "@/game/art/creatures/trunkadillo";
import { EVOLUTIONS, evolutionOf, evolveSchedule, morphFrames } from "@/game/art/evolve";
import { silhouette } from "@/lib/pixel";

const filled = (rows: string[]) => rows.join("").replace(/\./g, "").length;

describe("evolution", () => {
  it("Pingkit evolves into Tracevix, a different shape at the same size", () => {
    expect(evolutionOf(PINGKIT.id)).toBe(TRACEVIX);
    expect(evolutionOf(TRACEVIX.id)).toBeUndefined();
    expect(TRACEVIX.size).toBe(PINGKIT.size);
    const a = silhouette(PINGKIT.front.idle[0]).rows;
    const b = silhouette(TRACEVIX.front.idle[0]).rows;
    const diff = a.join("").split("").filter((ch, i) => (ch === ".") !== (b.join("")[i] === ".")).length;
    // the silhouettes differ in a good share of their area (the twin tails, the ruff, the legs)
    expect(diff).toBeGreaterThan(filled(a) * 0.2);
  });

  it("Framadillo evolves into Trunkadillo, a spikier, horned shape at the same size", () => {
    expect(evolutionOf(FRAMADILLO.id)).toBe(TRUNKADILLO);
    expect(evolutionOf(TRUNKADILLO.id)).toBeUndefined();
    expect(TRUNKADILLO.size).toBe(FRAMADILLO.size);
    const a = silhouette(FRAMADILLO.front.idle[0]).rows.join("");
    const b = silhouette(TRUNKADILLO.front.idle[0]).rows.join("");
    const diff = a.split("").filter((ch, i) => (ch === ".") !== (b[i] === ".")).length;
    expect(diff).toBeGreaterThan(filled([a]) * 0.15);
  });

  it("Ackorn evolves into Oakwind, a helmeted, longer-tailed shape at the same size", () => {
    expect(evolutionOf(ACKORN.id)).toBe(OAKWIND);
    expect(evolutionOf(OAKWIND.id)).toBeUndefined();
    expect(OAKWIND.size).toBe(ACKORN.size);
    const a = silhouette(ACKORN.front.idle[0]).rows.join("");
    const b = silhouette(OAKWIND.front.idle[0]).rows.join("");
    const diff = a.split("").filter((ch, i) => (ch === ".") !== (b[i] === ".")).length;
    expect(diff).toBeGreaterThan(filled([a]) * 0.15);
  });

  it("every evolution has front and back art", () => {
    for (const { from, to } of EVOLUTIONS) {
      expect(to.front.idle.length).toBeGreaterThan(0);
      expect(to.back.idle.length).toBeGreaterThan(0);
      expect(to.id).not.toBe(from.id);
    }
  });

  describe("morphFrames", () => {
    const from = PINGKIT.front.idle[0];
    const to = TRACEVIX.front.idle[0];
    const frames = morphFrames(from, to, 8);
    const shape = (rows: string[]) => rows.map((r) => r.replace(/[^.]/g, "w"));

    it("starts on the old silhouette and ends on the new one, all white", () => {
      expect(frames).toHaveLength(8);
      expect(frames[0].rows).toEqual(shape(from.rows));
      expect(frames[7].rows).toEqual(shape(to.rows));
      for (const f of frames) expect(Object.values(f.palette)).toEqual(["#ffffff"]);
    });

    it("moves monotonically from one shape to the other", () => {
      const dist = (r: string[], t: string[]) => r.join("").split("").filter((ch, i) => ch !== t.join("")[i]).length;
      const target = shape(to.rows);
      const d = frames.map((f) => dist(f.rows, target));
      for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1]);
      expect(d[0]).toBeGreaterThan(0);
      expect(d[7]).toBe(0);
      // the middle frame is a real mix: about half the differing pixels have switched
      expect(d[4] / d[0]).toBeGreaterThan(0.3);
      expect(d[4] / d[0]).toBeLessThan(0.7);
    });

    it("pixels shared by both shapes stay lit throughout", () => {
      const a = shape(from.rows).join("");
      const b = shape(to.rows).join("");
      for (const f of frames) {
        const r = f.rows.join("");
        for (let i = 0; i < r.length; i++) if (a[i] === "w" && b[i] === "w") expect(r[i]).toBe("w");
      }
    });

    it("pads a smaller sprite to the larger size, anchored at the bottom centre", () => {
      const small = { palette: { a: "#000" }, rows: ["aa", "aa"] };
      const big = { palette: { a: "#000" }, rows: ["....", "....", "....", "aaaa"] };
      const [first] = morphFrames(small, big, 2);
      expect(first.rows).toEqual(["....", "....", ".ww.", ".ww."]);
    });
  });

  it("the schedule swaps shapes faster and faster, then dissolves and holds the new form", () => {
    const steps = evolveSchedule(PINGKIT.front.idle[0], TRACEVIX.front.idle[0]);
    const swaps = steps.filter((s) => s.stretch > 1.05);
    expect(swaps.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < swaps.length; i++) expect(swaps[i].dur).toBeLessThanOrEqual(swaps[i - 1].dur);
    expect(steps[steps.length - 1].sprite.rows).toEqual(morphFrames(PINGKIT.front.idle[0], TRACEVIX.front.idle[0])[5].rows);
    const total = steps.reduce((a, s) => a + s.dur, 0);
    expect(total).toBeGreaterThan(2);
    expect(total).toBeLessThan(5);
  });
});
