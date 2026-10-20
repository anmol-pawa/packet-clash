import { describe, expect, it } from "vitest";
import {
  answerText,
  buildDeck,
  correctResponse,
  grade,
  mcqChoices,
  moveStep,
  parseNumber,
  scrambleSteps,
  type Question,
} from "@/game/engine/questions";
import { BANK } from "@/content/questions/bank";
import {
  GENERATORS,
  bandwidthDelay,
  broadcastAddress,
  networkAddress,
  prefixForHosts,
  propDelay,
  subnetHosts,
  txDelay,
} from "@/content/questions/generators";
import { propagationDelay, transmissionDelay } from "@/lib/net/basics";
import { rng } from "@/lib/rng";
import { TYPES } from "@/game/engine/types";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

/** Every structural rule a question must satisfy before it can be shown. */
function checkShape(q: Question) {
  expect(q.prompt.length).toBeGreaterThan(0);
  expect(q.explain.length).toBeGreaterThan(0);
  expect(TYPES).toContain(q.type);
  switch (q.kind) {
    case "mcq":
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices.length).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      break;
    case "multi":
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.answers.length).toBeGreaterThanOrEqual(1);
      expect(q.answers.length).toBeLessThan(q.choices.length);
      for (const a of q.answers) expect(q.choices[a]).toBeDefined();
      break;
    case "numeric":
      expect(Number.isFinite(q.answer)).toBe(true);
      break;
    case "order":
      expect(new Set(q.steps).size).toBe(q.steps.length);
      expect(q.steps.length).toBeGreaterThanOrEqual(3);
      break;
  }
  expect(grade(q, correctResponse(q))).toBe(true);
}

describe("grading", () => {
  const mcq = BANK.find((q) => q.id === "arp")!;
  const multi = BANK.find((q) => q.id === "rfc1918")!;
  const order = BANK.find((q) => q.id === "dhcp-dora")!;

  it("grades multiple choice", () => {
    expect(grade(mcq, { kind: "mcq", choice: 2 })).toBe(true);
    expect(grade(mcq, { kind: "mcq", choice: 0 })).toBe(false);
    expect(grade(mcq, { kind: "numeric", value: 2 })).toBe(false);
  });

  it("needs exactly the right set for multi-select, in any order", () => {
    expect(grade(multi, { kind: "multi", choices: [4, 0, 2] })).toBe(true);
    expect(grade(multi, { kind: "multi", choices: [0, 2] })).toBe(false);
    expect(grade(multi, { kind: "multi", choices: [0, 1, 2, 4] })).toBe(false);
    expect(grade(multi, { kind: "multi", choices: [0, 2, 2] })).toBe(false);
    expect(grade(multi, { kind: "multi", choices: [] })).toBe(false);
  });

  it("grades numeric answers with their tolerance", () => {
    const q = txDelay.generate(1);
    if (q.kind !== "numeric") throw new Error("expected numeric");
    expect(grade(q, { kind: "numeric", value: q.answer })).toBe(true);
    expect(grade(q, { kind: "numeric", value: q.answer * 1.004 })).toBe(true);
    expect(grade(q, { kind: "numeric", value: q.answer * 1.02 })).toBe(false);
    expect(grade(q, { kind: "numeric", value: NaN })).toBe(false);
    const exact = BANK.find((x) => x.id === "http-404")!;
    expect(grade(exact, { kind: "numeric", value: 404 })).toBe(true);
    expect(grade(exact, { kind: "numeric", value: 404.5 })).toBe(false);
  });

  it("grades order-the-steps only in the exact order", () => {
    expect(grade(order, { kind: "order", steps: ["Discover", "Offer", "Request", "Acknowledge"] })).toBe(true);
    expect(grade(order, { kind: "order", steps: ["Discover", "Request", "Offer", "Acknowledge"] })).toBe(false);
    expect(grade(order, { kind: "order", steps: ["Discover", "Offer", "Request"] })).toBe(false);
  });

  it("writes the answer out for the explanation box", () => {
    expect(answerText(mcq)).toBe("ARP");
    expect(answerText(multi)).toBe("10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16");
    expect(answerText(order)).toBe("1. Discover  2. Offer  3. Request  4. Acknowledge");
    expect(answerText(txDelay.generate(1))).toMatch(/^\d+(\.\d+)? ms$/);
  });

  it("parses what players type", () => {
    expect(parseNumber("1,500")).toBe(1500);
    expect(parseNumber(" 0.12 ")).toBe(0.12);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("2e-3")).toBe(0.002);
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("12ms")).toBeNaN();
    expect(parseNumber("1.2.3")).toBeNaN();
  });
});

describe("order steps", () => {
  it("never shows the steps already solved, and is seeded", () => {
    const steps = ["a", "b", "c", "d"];
    for (const seed of SEEDS.slice(0, 50)) {
      const s = scrambleSteps(steps, seed);
      expect([...s].sort()).toEqual(steps);
      expect(s).not.toEqual(steps);
      expect(scrambleSteps(steps, seed)).toEqual(s);
    }
    expect(scrambleSteps(["x", "y"], 3)).toEqual(["y", "x"]);
  });

  it("moves a step up or down by one", () => {
    expect(moveStep(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveStep(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveStep(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveStep(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("multiple-choice options", () => {
  it("keeps the answer, drops duplicate distractors and shuffles by seed", () => {
    const m = mcqChoices(rng(5), "B", ["B", "A", "A", "C", "D", "E"]);
    expect(m.choices).toHaveLength(4);
    expect(m.choices[m.answer]).toBe("B");
    expect([...m.choices].sort()).toEqual(["A", "B", "C", "D"]);
    expect(mcqChoices(rng(5), "B", ["A", "C", "D"])).toEqual(mcqChoices(rng(5), "B", ["A", "C", "D"]));
    expect(() => mcqChoices(rng(5), "B", ["A", "A", "B", "C"])).toThrow();
  });
});

describe("the bank", () => {
  it("has unique ids and every kind", () => {
    expect(new Set(BANK.map((q) => q.id)).size).toBe(BANK.length);
    expect(new Set(BANK.map((q) => q.kind))).toEqual(new Set(["mcq", "multi", "numeric", "order"]));
  });

  it("has well-formed questions whose answers grade as right", () => {
    for (const q of BANK) checkShape(q);
  });

  it("has the right answers", () => {
    const expected: Record<string, string> = {
      "router-layer": "Network (L3)",
      "pdu-names": "Segment",
      "osi-bottom-up": "1. Physical  2. Data link  3. Network  4. Transport  5. Session  6. Presentation  7. Application",
      arp: "ARP",
      rfc1918: "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16",
      "router-rewrites": "TTL, Header checksum",
      "syn-reply": "SYN-ACK",
      "tcp-teardown":
        "1. Client sends FIN  2. Server ACKs the FIN  3. Server sends its own FIN  4. Client ACKs it and waits in TIME_WAIT",
      "dhcp-dora": "1. Discover  2. Offer  3. Request  4. Acknowledge",
      "udp-apps": "DNS queries, DHCP",
      "http-404": "404",
    };
    expect(Object.keys(expected).sort()).toEqual(BANK.map((q) => q.id).sort());
    for (const q of BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
  });
});

describe("generators", () => {
  it("are deterministic, well-formed and never fail to build", () => {
    for (const g of GENERATORS) {
      for (const seed of SEEDS) {
        const q = g.generate(seed);
        expect(q.id.startsWith(g.id)).toBe(true);
        expect(q.topic).toBe(g.topic);
        expect(q.type).toBe(g.type);
        expect(q.difficulty).toBe(g.difficulty);
        checkShape(q);
        expect(g.generate(seed)).toEqual(q);
      }
    }
  });

  it("vary with the seed", () => {
    for (const g of GENERATORS) expect(new Set(SEEDS.map((s) => g.generate(s).id)).size).toBeGreaterThan(3);
  });

  it("match Forouzan's worked delay examples", () => {
    // Forouzan, Data Communications and Networking: 12,000 km at 2.4×10⁸ m/s → 50 ms.
    expect(propagationDelay(12_000_000, 2.4e8) * 1000).toBeCloseTo(50, 9);
    // …and a 2.5 kB e-mail on a 1 Gbps link → 0.020 ms of transmission time.
    expect(transmissionDelay(2500, 1e9) * 1000).toBeCloseTo(0.02, 12);
    const p = SEEDS.map((s) => propDelay.generate(s)).find((q) => q.id === "gen-prop-delay:12000:240000000");
    expect(p && p.kind === "numeric" && p.answer).toBeCloseTo(50, 9);
  });

  it("solve delays and the bandwidth-delay product", () => {
    for (const seed of SEEDS) {
      const t = txDelay.generate(seed);
      const [, bytes, mbps] = t.id.split(":").map(Number);
      if (t.kind !== "numeric") throw new Error("numeric");
      expect(t.answer).toBeCloseTo((bytes * 8) / (mbps * 1000), 9);
      const b = bandwidthDelay.generate(seed);
      const [, r, rtt] = b.id.split(":").map(Number);
      if (b.kind !== "numeric") throw new Error("numeric");
      expect(b.answer).toBe(r * rtt);
    }
    // 1,000 bytes on 1 Mbps → 8 ms (Kurose & Ross's L/R).
    const k = SEEDS.map((s) => txDelay.generate(s)).find((q) => q.id === "gen-tx-delay:1000:1");
    expect(k && answerText(k)).toBe("8 ms");
  });

  it("solve subnet sizes", () => {
    const byPrefix = new Map(SEEDS.map((s) => subnetHosts.generate(s)).map((q) => [q.id, q]));
    const h = (p: number) => {
      const q = byPrefix.get(`gen-subnet-hosts:${p}`);
      return q && q.kind === "numeric" ? q.answer : undefined;
    };
    expect(h(24)).toBe(254);
    expect(h(26)).toBe(62);
    expect(h(30)).toBe(2);
    expect(h(20)).toBe(4094);

    for (const seed of SEEDS) {
      const q = prefixForHosts.generate(seed);
      if (q.kind !== "numeric") throw new Error("numeric");
      const need = Number(q.id.split(":")[1]);
      expect(2 ** (32 - q.answer) - 2).toBeGreaterThanOrEqual(need);
      expect(2 ** (32 - (q.answer + 1)) - 2).toBeLessThan(need);
    }
  });

  it("solve network and broadcast addresses", () => {
    for (const seed of SEEDS) {
      const n = networkAddress.generate(seed);
      const b = broadcastAddress.generate(seed);
      expect(n.prompt).toContain(n.id.split(":")[1]);
      expect(b.prompt).toContain(b.id.split(":")[1]);
    }
    // Recompute every instance independently, with plain arithmetic instead of bit masks.
    const all = SEEDS.flatMap((s) => [networkAddress.generate(s), broadcastAddress.generate(s)]);
    for (const q of all) {
      const [ip, len] = q.id.split(":")[1].split("/");
      const [a, b, c, d] = ip.split(".").map(Number);
      const n = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
      const host = 2 ** (32 - Number(len));
      const net = n - (n % host);
      const want = q.id.startsWith("gen-network") ? net : net + host - 1;
      const dotted = [24, 16, 8, 0].map((s) => Math.floor(want / 2 ** s) % 256).join(".");
      expect(answerText(q)).toBe(dotted);
    }
  });
});

describe("decks", () => {
  it("filters by topic and difficulty, adds one instance per generator, and is seeded", () => {
    const deck = buildDeck(BANK, GENERATORS, { seed: 9, size: 50, topics: ["network"] });
    expect(deck.every((q) => q.topic === "network")).toBe(true);
    const fixed = BANK.filter((q) => q.topic === "network").length;
    const gens = GENERATORS.filter((g) => g.topic === "network").length;
    expect(deck).toHaveLength(fixed + gens);
    expect(buildDeck(BANK, GENERATORS, { seed: 9, size: 50, topics: ["network"] })).toEqual(deck);

    const easy = buildDeck(BANK, GENERATORS, { seed: 2, size: 5, difficulties: [1] });
    expect(easy).toHaveLength(5);
    expect(easy.every((q) => q.difficulty === 1)).toBe(true);
  });
});
