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
  LAYERS_5,
  PROTOCOL_LAYERS,
  bandwidthDelay,
  broadcastAddress,
  circuitCapacity,
  circuitTime,
  nodalDelay,
  pathThroughput,
  protocolLayer,
  queuingIntensity,
  storeForward,
  networkAddress,
  prefixForHosts,
  propDelay,
  subnetHosts,
  txDelay,
} from "@/content/questions/generators";
import {
  bottleneck,
  circuitFileTime,
  circuitUsers,
  probMoreThanActive,
  propagationDelay,
  storeAndForwardTime,
  trafficIntensity,
  transmissionDelay,
} from "@/lib/net/basics";
import { encapsulate, totalBytes } from "@/game/engine/encap";
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
      "tcpip-app-covers": "Application, Presentation, Session",
      "process-to-process": "Transport",
      "frame-onion": "1. Ethernet header  2. IP header  3. TCP header  4. HTTP request  5. Ethernet FCS trailer",
      "router-layers": "Physical, Link, Network",
      "decap-order":
        "1. The NIC turns the signal back into bits  2. The link layer checks the FCS and strips the Ethernet header  3. The network layer sees its own IP address and strips the IP header  4. The transport layer reads the port and hands the data to that socket  5. The application reads the message",
      "packet-switching": "Links are shared on demand (statistical multiplexing), Packets may queue, and be dropped, at a busy router",
      tdm: "TDM",
      "packet-vs-circuit-users": "About 0.04%",
      "delay-by-size": "Transmission delay",
      "intensity-over-one": "It grows without bound (until packets are dropped)",
      "header-overhead": "58 bytes",
      "pdu-link": "Frame",
      "hub-layer": "Hub",
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

describe("gym 1 (models and basics) generators", () => {
  const all = <T,>(g: { generate(s: number): T }) => SEEDS.map((s) => g.generate(s));

  it("match Kurose & Ross's packet- and circuit-switching examples", () => {
    // §1.3: one packet over N links takes N·L/R; three packets over two links take 4·L/R.
    expect(storeAndForwardTime(1000, 1e6, 3)).toBeCloseTo(3 * 0.008, 12);
    expect(storeAndForwardTime(1000, 1e6, 2, 3)).toBeCloseTo(4 * 0.008, 12);
    expect(() => storeAndForwardTime(1000, 1e6, 0)).toThrow();
    // §1.3: a 640,000-bit file over a 1.536 Mbps, 24-slot TDM circuit with 500 ms setup takes 10.5 s.
    expect(circuitFileTime(640_000, 1.536e6, 24, 0.5)).toBeCloseTo(10.5, 9);
    // §1.3: a 1 Mbps link and 100 kbps users: 10 circuits; with 35 users active 10% of the time,
    // P(more than 10 active) ≈ 0.0004.
    expect(circuitUsers(1e6, 100e3)).toBe(10);
    expect(probMoreThanActive(35, 0.1, 10)).toBeCloseTo(0.000424, 5);
    expect(probMoreThanActive(10, 0.5, -1)).toBeCloseTo(1, 12);
    expect(probMoreThanActive(10, 0.5, 10)).toBe(0);
    // §1.4.4: a 32 Mbit file with Rs = 2 Mbps and Rc = 1 Mbps takes 32 s.
    expect(32e6 / bottleneck([2e6, 1e6])).toBe(32);
    expect(() => bottleneck([])).toThrow();
    // §1.4.2: La/R for 1,000-byte packets at 100/s on 1 Mbps = 0.8.
    expect(trafficIntensity(1000, 100, 1e6)).toBeCloseTo(0.8, 12);
  });

  it("solve one-hop delay, traffic intensity and store-and-forward", () => {
    for (const q of all(nodalDelay)) {
      const [, bytes, mbps, km] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer).toBeCloseTo((bytes * 8) / (mbps * 1000) + km / 200, 9);
    }
    for (const q of all(queuingIntensity)) {
      const [, bytes, pps, mbps] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer).toBeCloseTo((bytes * 8 * pps) / (mbps * 1e6), 12);
      expect(q.explain).toContain(q.answer >= 1 ? "without bound" : q.answer > 0.8 ? "shoots up" : "short queue");
    }
    for (const q of all(storeForward)) {
      const [, links, packets, bytes, mbps] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      // Simulate the pipeline: packet p finishes link k at (p + k)·L/R (0-based p, 1-based k).
      const lr = (bytes * 8) / (mbps * 1000);
      let done = 0;
      for (let p = 0; p < packets; p++) for (let k = 1; k <= links; k++) done = Math.max(done, (p + k) * lr);
      expect(q.answer).toBeCloseTo(done, 9);
    }
  });

  it("solve circuit switching and bottleneck throughput", () => {
    for (const q of all(circuitTime)) {
      const [, kbit, rate, slots, setup] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer).toBeCloseTo(setup / 1000 + (kbit * 1000 * slots) / rate, 9);
      expect(Number.isInteger(rate / slots)).toBe(true);
    }
    for (const q of all(circuitCapacity)) {
      const [, mbps, kbps] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer * kbps).toBeLessThanOrEqual(mbps * 1000);
      expect((q.answer + 1) * kbps).toBeGreaterThan(mbps * 1000);
    }
    for (const q of all(pathThroughput)) {
      const [, path, mbit] = q.id.split(":");
      const rates = path.split("-").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(new Set(rates).size).toBe(3);
      expect(q.answer).toBeCloseTo(Number(mbit) / Math.min(...rates), 9);
    }
  });

  it("place every protocol in its layer", () => {
    expect(PROTOCOL_LAYERS.TCP).toBe("Transport");
    expect(PROTOCOL_LAYERS.ICMP).toBe("Network");
    expect(PROTOCOL_LAYERS.Ethernet).toBe("Link");
    expect(PROTOCOL_LAYERS.DNS).toBe("Application");
    expect(new Set(Object.values(PROTOCOL_LAYERS))).toEqual(new Set(LAYERS_5));
    const seen = new Set<string>();
    for (const q of all(protocolLayer)) {
      const proto = q.id.split(":")[1];
      seen.add(proto);
      expect(answerText(q)).toBe(PROTOCOL_LAYERS[proto]);
      expect(q.prompt).toContain(proto);
    }
    expect(seen.size).toBe(Object.keys(PROTOCOL_LAYERS).length);
  });

  it("agree with the encapsulation engine on header overhead", () => {
    // The HTTP message is well over Ethernet's 46-byte minimum once in TCP + IP, so there is no padding.
    const [message, , , frame] = encapsulate("APPLICATION");
    const q = BANK.find((x) => x.id === "header-overhead")!;
    if (q.kind !== "numeric") throw new Error("numeric");
    expect(q.answer).toBe(totalBytes(frame) - totalBytes(message));
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
