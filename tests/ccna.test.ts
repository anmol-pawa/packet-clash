import { describe, expect, it } from "vitest";
import { CCNA_BANK } from "@/content/questions/ccnaBank";
import { CCNA_GENERATORS, cableGen, frameGen, pingPayloadGen, pingRateGen, poeGen, tracerouteGen } from "@/content/questions/ccnaGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { cableFor, frameClass, maxPingPayload, parsePing, parseTraceroute, poeDevices } from "@/lib/net/devices";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 3);
const numeric = (q: unknown) => q as NumericQuestion;
const mcq = (q: unknown) => q as McqQuestion;

describe("CCNA 4.1 bank", () => {
  it("is all ccna-topic with unique ids", () => {
    expect(CCNA_BANK.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CCNA_BANK.map((q) => q.id)).size).toBe(CCNA_BANK.length);
    for (const q of CCNA_BANK) expect(q.topic).toBe("ccna");
  });

  it("covers every kind of question", () => {
    expect(new Set(CCNA_BANK.map((q) => q.kind))).toEqual(new Set(["mcq", "multi", "numeric", "sort"]));
  });
});

describe("CCNA 4.1 generators", () => {
  it("are registered", () => {
    expect(CCNA_GENERATORS).toHaveLength(6);
    for (const g of CCNA_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("are deterministic per seed and always answerable", () => {
    for (const g of CCNA_GENERATORS) {
      for (const s of seeds) {
        const q = g.generate(s);
        expect(g.generate(s)).toEqual(q);
        expect(q.topic).toBe("ccna");
        expect(grade(q, correctResponse(q)), `${g.id} ${s}`).toBe(true);
      }
    }
  });

  it("PoE budgets divide by the per-port maximum", () => {
    for (const s of seeds) {
      const q = numeric(poeGen.generate(s));
      const [, std, budget] = q.id.split(":");
      expect(q.answer).toBe(poeDevices(Number(budget), std as "af" | "at" | "bt3" | "bt4"));
    }
    const af370 = seeds.map((s) => poeGen.generate(s)).find((q) => q.id === "gen-poe:af:370");
    if (af370) expect(numeric(af370).answer).toBe(24);
  });

  it("cable questions follow the pin groups, with one right answer", () => {
    for (const s of seeds) {
      const q = mcq(cableGen.generate(s));
      const [, a, b] = q.id.split(":");
      expect(answerText(q)).toBe(cableFor(a as never, b as never));
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("frame questions use the 64–1518 byte limits", () => {
    for (const s of seeds) {
      const q = mcq(frameGen.generate(s));
      const bytes = Number(q.id.split(":")[1]);
      const word = { runt: "a runt", normal: "a normal frame", giant: "a giant" }[frameClass(bytes)];
      expect(answerText(q)).toBe(word);
    }
  });

  it("ping questions match a recount of the symbols", () => {
    for (const s of seeds) {
      const q = numeric(pingRateGen.generate(s));
      const line = q.id.split(":")[2];
      const ok = [...line].filter((c) => c === "!").length;
      expect(q.answer).toBe(Math.floor((ok * 100) / line.length));
      expect(q.answer).toBe(parsePing(line).successPercent);
      expect(q.prompt).toContain(line);
    }
  });

  it("traceroute questions are solved from the text in the prompt", () => {
    for (const s of seeds) {
      const q = numeric(tracerouteGen.generate(s));
      const text = q.prompt.split("\n\nThe trace")[0];
      const dest = q.id.split(":")[1];
      expect(q.answer).toBe(parseTraceroute(text, dest).lastResponding);
      expect(q.answer).toBeGreaterThanOrEqual(1);
    }
  });

  it("ping payload is the MTU minus 28", () => {
    for (const s of seeds) {
      const q = numeric(pingPayloadGen.generate(s));
      expect(q.answer).toBe(maxPingPayload(Number(q.id.split(":")[1])));
    }
    expect(maxPingPayload(1500)).toBe(1472);
  });
});
