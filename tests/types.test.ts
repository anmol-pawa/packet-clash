import { describe, expect, it } from "vitest";
import { DEMO_QUESTIONS } from "@/content/demo";
import { gymFoe } from "@/content/gyms";
import { TOWNS } from "@/content/world";
import { BOSS_ART } from "@/game/art/bosses";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { TRACEVIX } from "@/game/art/creatures/tracevix";
import { foeDamage, initialState, playerDamage, reducer, type BattleState, type Fighter } from "@/game/engine/battle";
import { CHART, CREATURE_TYPES, effectiveness, effectMessage, effectReasons, TYPE_INFO, TYPES, typeMult, type PacketType } from "@/game/engine/types";

const LAYERS: PacketType[] = ["PHYSICAL", "LINK", "NETWORK", "TRANSPORT", "APPLICATION"];

describe("type chart", () => {
  it("has each matchup at most once, with a reason, and only ×2 or ×½", () => {
    const keys = CHART.map((m) => `${m.atk}>${m.def}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of CHART) {
      expect([2, 0.5]).toContain(m.mult);
      expect(m.why.length).toBeGreaterThan(20);
      expect(m.atk).not.toBe(m.def);
    }
  });

  it("makes the layer below super effective and the layer above not very effective", () => {
    for (let i = 0; i + 1 < LAYERS.length; i++) {
      const [lower, upper] = [LAYERS[i], LAYERS[i + 1]];
      expect(typeMult(lower, upper)).toBe(2);
      expect(typeMult(upper, lower)).toBe(0.5);
    }
  });

  it("is neutral between layers that aren't neighbours, and against yourself", () => {
    for (const a of LAYERS)
      for (const d of LAYERS) if (Math.abs(LAYERS.indexOf(a) - LAYERS.indexOf(d)) !== 1) expect(typeMult(a, d)).toBe(1);
    for (const t of TYPES) expect(typeMult(t, t)).toBe(1);
  });

  it("has the security triangle", () => {
    expect(typeMult("PHYSICAL", "SECURITY")).toBe(2);
    expect(typeMult("SECURITY", "APPLICATION")).toBe(2);
    expect(typeMult("SECURITY", "PHYSICAL")).toBe(0.5);
    expect(typeMult("APPLICATION", "SECURITY")).toBe(1);
    expect(typeMult("NETWORK", "SECURITY")).toBe(1);
  });

  it("has a full row of info for every type, with the right PDU names", () => {
    for (const t of TYPES) expect(TYPE_INFO[t].move).toMatch(/^[A-Z ]+$/);
    expect(LAYERS.map((t) => TYPE_INFO[t].pdu)).toEqual(["bit", "frame", "packet", "segment", "message"]);
    expect(TYPE_INFO.SECURITY.pdu).toBeNull();
    expect(new Set(TYPES.map((t) => TYPE_INFO[t].color)).size).toBe(TYPES.length);
  });

  it("multiplies the multipliers of a dual type", () => {
    expect(effectiveness("NETWORK", ["TRANSPORT"])).toBe(2);
    expect(effectiveness("PHYSICAL", ["LINK", "SECURITY"])).toBe(4);
    expect(effectiveness("TRANSPORT", ["APPLICATION", "NETWORK"])).toBe(1);
    expect(effectiveness("SECURITY", ["PHYSICAL", "LINK"])).toBe(0.5);
    expect(effectiveness("LINK", ["PHYSICAL", "TRANSPORT"])).toBe(0.5);
    expect(effectiveness("APPLICATION", ["TRANSPORT", "NETWORK"])).toBe(0.5);
  });

  it("writes the messages and reasons", () => {
    expect(effectMessage(4)).toBe("It's super effective!");
    expect(effectMessage(2)).toBe("It's super effective!");
    expect(effectMessage(1)).toBe("");
    expect(effectMessage(0.5)).toBe("It's not very effective…");
    expect(effectReasons("NETWORK", ["TRANSPORT"])[0]).toMatch(/inside IP packets/);
    expect(effectReasons("NETWORK", ["APPLICATION"])).toEqual([]);
    expect(effectReasons("PHYSICAL", ["LINK", "SECURITY"])).toHaveLength(2);
  });
});

describe("creature types", () => {
  it("types every boss and the starter line with one or two distinct types", () => {
    for (const id of [...Object.keys(BOSS_ART), PINGKIT.id, TRACEVIX.id]) {
      const ts = CREATURE_TYPES[id];
      expect(ts, id).toBeDefined();
      expect(ts.length).toBeGreaterThanOrEqual(1);
      expect(ts.length).toBeLessThanOrEqual(2);
      expect(new Set(ts).size).toBe(ts.length);
    }
  });

  it("gives each gym leader its creature's types", () => {
    for (const t of TOWNS) expect(gymFoe(t).types).toEqual(CREATURE_TYPES[t.bossSprite!]);
    expect(CREATURE_TYPES.braidwyrm).toEqual(["PHYSICAL"]);
    expect(CREATURE_TYPES.keyvern).toEqual(["SECURITY"]);
    expect(CREATURE_TYPES.synackle).toEqual(["TRANSPORT"]);
  });

  it("types every demo question by its layer", () => {
    const want: Record<string, PacketType> = {
      "router-layer": "NETWORK",
      arp: "LINK",
      "hosts-26": "NETWORK",
      "syn-reply": "TRANSPORT",
      "tx-delay": "PHYSICAL",
      "tcp-pdu": "TRANSPORT",
    };
    for (const q of DEMO_QUESTIONS) expect(q.type, q.id).toBe(want[q.id]);
  });
});

describe("typed battles", () => {
  const player: Fighter = { name: "Pingkit", level: 5, hp: 60, maxHp: 60, types: ["NETWORK"] };
  const start = (foe: Fighter): BattleState =>
    reducer(reducer(initialState(), { type: "load", player, foe, questionCount: 3 }), { type: "ready" });
  const synackle: Fighter = { name: "Synackle", level: 14, hp: 130, maxHp: 130, types: ["TRANSPORT"] };
  const base = playerDamage(5, 1).damage;

  it("doubles a super-effective move and halves a resisted one", () => {
    const se = reducer(start(synackle), { type: "answer", correct: true, choice: 0, moveType: "NETWORK" });
    expect(se.last).toMatchObject({ effect: 2, damage: base * 2, moveType: "NETWORK" });
    expect(se.foe.hp).toBe(130 - base * 2);
    const nve = reducer(start(synackle), { type: "answer", correct: true, choice: 0, moveType: "APPLICATION" });
    expect(nve.last).toMatchObject({ effect: 0.5, damage: Math.round(base / 2) });
    const neutral = reducer(start(synackle), { type: "answer", correct: true, choice: 0, moveType: "PHYSICAL" });
    expect(neutral.last).toMatchObject({ effect: 1, damage: base });
  });

  it("types the foe's hit with its first type", () => {
    const stackadon: Fighter = { name: "Stackadon", level: 6, hp: 90, maxHp: 90, types: ["LINK", "APPLICATION"] };
    const miss = reducer(start(stackadon), { type: "answer", correct: false, choice: 1, moveType: "NETWORK" });
    expect(miss.last).toMatchObject({ moveType: "LINK", effect: 2, damage: foeDamage(6) * 2 });
    expect(miss.player.hp).toBe(60 - foeDamage(6) * 2);
  });

  it("is neutral when a move or fighter has no type", () => {
    const untyped: Fighter = { name: "Glitchling", level: 4, hp: 100, maxHp: 100 };
    expect(reducer(start(untyped), { type: "answer", correct: true, choice: 0, moveType: "NETWORK" }).last?.effect).toBe(1);
    expect(reducer(start(synackle), { type: "answer", correct: true, choice: 0 }).last?.effect).toBe(1);
  });
});
