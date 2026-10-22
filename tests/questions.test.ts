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
  sortGroups,
  sortMarks,
  type Question,
  type SortQuestion,
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
  sortLayers,
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
    case "sort":
      expect(new Set(q.bins).size).toBe(q.bins.length);
      expect(new Set(q.items.map((it) => it.label)).size).toBe(q.items.length);
      expect(q.items.length).toBeGreaterThanOrEqual(3);
      for (const it of q.items) expect(q.bins[it.bin]).toBeDefined();
      // At least two bins in use, or there is nothing to sort.
      expect(new Set(q.items.map((it) => it.bin)).size).toBeGreaterThanOrEqual(2);
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

describe("sort into bins", () => {
  const q = BANK.find((x): x is SortQuestion => x.id === "devices-to-layers")!;
  const right = q.items.map((it) => it.bin);

  it("is right only when every item is in its bin", () => {
    expect(grade(q, { kind: "sort", bins: right })).toBe(true);
    // One item in the wrong bin, one left unplaced, a short response, the wrong kind.
    expect(grade(q, { kind: "sort", bins: right.map((b, i) => (i === 0 ? (b + 1) % 3 : b)) })).toBe(false);
    expect(grade(q, { kind: "sort", bins: right.map((b, i) => (i === 1 ? null : b)) })).toBe(false);
    expect(grade(q, { kind: "sort", bins: right.slice(1) })).toBe(false);
    expect(grade(q, { kind: "sort", bins: [...right, 0] })).toBe(false);
    expect(grade(q, { kind: "order", steps: [] })).toBe(false);
  });

  it("marks each item on its own", () => {
    // Switch and Repeater swapped: those two are wrong, the rest are right.
    const swapped = right.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(sortMarks(q, { kind: "sort", bins: swapped })).toEqual([false, false, true, true, true]);
    expect(sortMarks(q, { kind: "sort", bins: right.map(() => null) })).toEqual([false, false, false, false, false]);
    expect(sortMarks(q, { kind: "mcq", choice: 0 }).some(Boolean)).toBe(false);
  });

  it("groups the answer by bin, in bin order", () => {
    expect(sortGroups(q)).toEqual([
      { bin: "Network", items: ["Router"] },
      { bin: "Link", items: ["Switch", "Bridge"] },
      { bin: "Physical", items: ["Repeater", "Hub"] },
    ]);
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
    expect(new Set(BANK.map((q) => q.kind))).toEqual(new Set(["mcq", "multi", "numeric", "order", "sort"]));
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
      "devices-to-layers": "Network: Router; Link: Switch, Bridge; Physical: Repeater, Hub",
      "parity-two-flips": "Nothing wrong: the error goes undetected",
      "two-d-parity": "Detect it and correct it",
      "ethernet-fcs": "A CRC-32 over the frame",
      "internet-checksum-users": "The IPv4 header, UDP segments, TCP segments",
      "crc-burst": "Bursts of up to r bits",
      "ethernet-sizes": "64 and 1518 bytes",
      "arp-request-frame": "Broadcast frame to FF:FF:FF:FF:FF:FF; B replies by unicast",
      "arp-off-subnet": "The MAC of the default gateway",
      "csma-cd-order":
        "1. Sense the channel until it is idle  2. Transmit the frame while listening  3. Detect a collision and send a jam signal  4. Wait a random backoff of K × 512 bit times  5. Sense the channel and retransmit",
      "csma-ca-why": "Radios cannot transmit and listen on the same channel at once, and distant stations may not hear each other",
      "hidden-terminal": "The hidden terminal problem: B's CTS, which C hears, makes C stay quiet while A sends",
      "aloha-max": "18.4% and 36.8%",
      "manchester-clock": "Every bit has a mid-bit transition, so the receiver can recover the clock even in a long run of identical bits",
      "switch-vs-hub": "A hub is one collision domain; each switch port is its own collision domain",
      "switch-learning": "It learns the source MAC address and arrival port of every frame it receives",
      "switch-flood-which": "A frame to the broadcast address FF:FF:FF:FF:FF:FF, A frame whose destination MAC is not in the table",
      "vlan-purpose": "Splits one physical switch into separate broadcast domains",
      "vlan-trunk": "An IEEE 802.1Q tag (4 bytes with the 12-bit VLAN ID) is inserted in the Ethernet header",
      "stp-why": "Redundant links create loops, and Ethernet frames have no TTL, so broadcasts would circulate forever (a broadcast storm)",
      "stp-root": "The lowest bridge ID wins: the priority (default 32768), with the MAC address breaking ties",
      "ipv4-ihl": "24 bytes",
      "ipv4-ttl-expiry": "Drops it and sends an ICMP Time Exceeded message to the source",
      "special-addresses": "127.0.0.1, 169.254.10.5, 192.168.4.9",
      "nat-pat": "The router rewrites the source address and port and keeps a table of (private IP, port) ↔ (public IP, port)",
      "nat-inbound": "The NAT table has no entry for an unsolicited inbound packet, so the router doesn't know which private host it is for",
      "ping-icmp": "ICMP echo request and echo reply",
      "traceroute-order":
        "1. Send a probe with TTL = 1  2. The first router drops it and returns ICMP Time Exceeded  3. Send the next probe with TTL = 2  4. Repeat until the destination replies, so the TTL was large enough",
      "path-mtu": "The router drops it and sends ICMP “fragmentation needed” (type 3, code 4) with the link's MTU",
      apipa: "169.254.x.y (link-local, APIPA)",
      "ipv6-size": "128 bits as eight groups of four hex digits",
      "ipv6-vs-ipv4": "The base header is a fixed 40 bytes, There is no header checksum, The TTL field is renamed Hop Limit",
      "ls-vs-dv": "Link-state routers flood every link cost to all routers and each runs Dijkstra on the full map; distance-vector routers only tell neighbours their own distance estimates",
      "rip-infinity": "16",
      "rip-update": "Its whole routing table every 30 seconds, over UDP port 520",
      "ospf-cost": "10",
      "ospf-areas": "To keep link-state flooding and each router's Dijkstra run small; every area connects to the backbone, area 0",
      "ospf-dr": "Routers form adjacencies only with the DR and BDR instead of a full mesh of 10, so there is much less flooding",
      "bgp-pathvector": "A router rejects any route whose AS_PATH already contains its own AS number",
      "ebgp-ibgp": "eBGP runs between routers in different ASes; iBGP runs between routers in the same AS to spread the externally learned routes",
      "bgp-policy": "Between ISPs, routes are chosen by business policy first (for example customer routes over peer routes over provider routes); AS-path length is only a later tie-breaker",
      "default-route": "It matches every destination, Any longer matching prefix wins over it, A stub network or home router typically uses it to send everything unknown to its ISP",
      "static-vs-dynamic": "A small stub network with a single exit, where the route never needs to change",
      "dijkstra-steps":
        "1. Set the source's cost to 0 and every other node's to infinity  2. Settle the unsettled node with the smallest cost  3. Relax its neighbours: lower D(v) if D(u) + c(u,v) is smaller  4. Repeat until every node is settled",
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

  it("sort a protocol from every layer into its layer", () => {
    const seen = new Set<string>();
    for (const q of all(sortLayers)) {
      if (q.kind !== "sort") throw new Error("sort");
      expect(q.bins).toEqual([...LAYERS_5]);
      expect(q.items).toHaveLength(6);
      // Every layer gets at least one protocol, and one gets two.
      expect(new Set(q.items.map((it) => it.bin)).size).toBe(5);
      for (const it of q.items) {
        seen.add(it.label);
        expect(q.bins[it.bin]).toBe(PROTOCOL_LAYERS[it.label]);
        expect(q.explain).toContain(it.label);
      }
      expect(q.id).toBe(`gen-sort-layers:${q.items.map((it) => it.label).join("|")}`);
    }
    expect(seen.size).toBe(Object.keys(PROTOCOL_LAYERS).length);
    const fixed = sortLayers.generate(3);
    if (fixed.kind !== "sort") throw new Error("sort");
    const tcp = { ...fixed, items: [{ label: "TCP", bin: 1 }, { label: "Ethernet", bin: 3 }] };
    expect(answerText(tcp)).toBe("Transport: TCP; Link: Ethernet");
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
