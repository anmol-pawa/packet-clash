import { describe, expect, it } from "vitest";
import { parseSprite } from "@/lib/pixel";
import { copperfield, HORIZON } from "@/game/art/backgrounds/copperfield";

const W = 256;
const H = 192;

describe("Copperfield battle background", () => {
  const bg = copperfield();
  const grid = parseSprite(bg.image);
  const at = (x: number, y: number) => grid.pixels[(y - bg.y) * grid.width + (x - bg.x)];

  it("covers the stage with a margin for wide screens and camera shake, with no holes", () => {
    expect(bg.x).toBeLessThanOrEqual(-64);
    expect(bg.y).toBeLessThanOrEqual(-32);
    expect(bg.x + grid.width).toBeGreaterThanOrEqual(W + 64);
    expect(bg.y + grid.height).toBeGreaterThanOrEqual(H + 32);
    expect(grid.pixels.every((p) => p !== null)).toBe(true);
  });

  it("is illustrated with a limited palette, not flat bands", () => {
    const pal = Object.keys(bg.image.palette).length;
    expect(pal).toBeGreaterThanOrEqual(30);
    expect(pal).toBeLessThanOrEqual(64);
    // the horizon strip (peaks, poles, trees, hut) uses many colours
    const strip = new Set<string>();
    for (let y = HORIZON - 40; y < HORIZON; y++) for (let x = 0; x < W; x++) strip.add(at(x, y)!);
    expect(strip.size).toBeGreaterThanOrEqual(15);
  });

  it("is deterministic", () => {
    expect(copperfield().image.rows).toEqual(bg.image.rows);
  });

  it("has sky at the top and meadow below the horizon", () => {
    const sky = ["a", "b", "c", "d", "e", "f", "g"].map((k) => bg.image.palette[k]);
    for (let x = 0; x < W; x += 16) expect(sky).toContain(at(x, -32));
    const p = bg.image.palette;
    const grass = ["v", "w", "x", "y", "z", "A", "B"].map((k) => p[k]);
    // left meadow below the reel, clear of the platforms and the path
    expect(grass).toContain(at(4, 145));
  });

  it("draws both platforms with an outline where the creatures stand", () => {
    const outline = bg.image.palette.O;
    for (const spot of [bg.platforms.player, bg.platforms.foe]) {
      expect(at(spot.cx, spot.cy)).not.toBe(outline);
      // walk down from the centre: grass top, soil side, then the outline
      let y = spot.cy;
      while (at(spot.cx, y) !== outline && y < spot.cy + 30) y++;
      expect(y - spot.cy).toBeGreaterThan(spot.ry);
      expect(at(spot.cx - spot.rx - 1, spot.cy)).toBe(outline);
    }
  });

  it("has blinking lights on the pole tops and drawn clouds", () => {
    expect(bg.lights.length).toBeGreaterThanOrEqual(5);
    for (const l of bg.lights) expect(l.y).toBeLessThan(HORIZON);
    expect(bg.clouds.length).toBeGreaterThanOrEqual(3);
    for (const c of bg.clouds) {
      const g = parseSprite(c);
      expect(g.pixels.some((p) => p === null)).toBe(true);
      expect(new Set(g.pixels.filter(Boolean)).size).toBe(3);
    }
  });
});
