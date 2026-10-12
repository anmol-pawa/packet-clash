import { describe, expect, it } from "vitest";
import { flipX, parseSprite, toRgba } from "@/lib/pixel";
import { BITLING, BITLING_DIM } from "@/game/art/mascot";

describe("pixel sprites", () => {
  const tiny = { palette: { r: "#ff0000", b: "#0000ff" }, rows: ["r.", ".b"] };

  it("expands rows into colours with transparency", () => {
    expect(parseSprite(tiny)).toEqual({ width: 2, height: 2, pixels: ["#ff0000", null, null, "#0000ff"] });
  });

  it("rejects ragged rows and unknown palette keys", () => {
    expect(() => parseSprite({ palette: { r: "#ff0000" }, rows: ["rr", "r"] })).toThrow(/row 1/);
    expect(() => parseSprite({ palette: { r: "#ff0000" }, rows: ["rx"] })).toThrow(/"x"/);
  });

  it("flips horizontally", () => {
    expect(flipX(tiny).rows).toEqual([".r", "b."]);
  });

  it("scales with nearest neighbour", () => {
    const { width, height, data } = toRgba(parseSprite(tiny), 2);
    expect([width, height]).toEqual([4, 4]);
    expect([...data.slice(0, 4)]).toEqual([255, 0, 0, 255]); // (0,0) red
    expect([...data.slice(4, 8)]).toEqual([255, 0, 0, 255]); // (1,0) still red
    expect(data[(1 * 4 + 2) * 4 + 3]).toBe(0); // (2,1) transparent
    expect([...data.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4)]).toEqual([0, 0, 255, 255]);
  });

  it("mascot frames are valid 32×32 sprites", () => {
    for (const s of [BITLING, BITLING_DIM]) {
      const g = parseSprite(s);
      expect([g.width, g.height]).toEqual([32, 32]);
    }
  });
});
