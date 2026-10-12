import { describe, expect, it } from "vitest";
import { parseSprite } from "@/lib/pixel";
import { GLITCHLING, GLITCHLING_DIM } from "@/game/art/mascot";
import { PACKET, SPARK } from "@/game/art/effects";

describe("battle art", () => {
  it("demo foe frames parse at 32×32", () => {
    for (const f of [GLITCHLING, GLITCHLING_DIM]) expect(parseSprite(f)).toMatchObject({ width: 32, height: 32 });
  });

  it("effect sprites parse and the spark frames share one size", () => {
    expect(parseSprite(PACKET)).toMatchObject({ width: 12, height: 8 });
    expect(SPARK).toHaveLength(3);
    for (const f of SPARK) expect(parseSprite(f)).toMatchObject({ width: 13, height: 13 });
  });
});
