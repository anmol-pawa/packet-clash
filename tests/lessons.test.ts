import { describe, expect, it } from "vitest";
import { ENCAP_STEPS, LESSONS, WORKED, lessonsFor, markLessonsSeen, showLessonsFirst } from "@/content/lessons";
import { TOWNS } from "@/content/world";
import { TCP_FLOW, WINDOW_DEMO, bellmanFordFigure, bgpFigure, countToInfinityFigure, cwndFigure, dijkstraFigure, stateTrail, tcpFlowFigure, windowFigure, windowSends, BURST, CRC_DEMO, HAMMING_DEMO, OSI_LAYERS, TCPIP_LAYERS, TDM_FRAMES, crcFigure, csmaFigure, delaysFigure, fragFigure, hammingFigure, lpmFigure, subnetFigure, vlsmFigure, layerStackFigure, macLearningFigure, packetOrder, switchingFigure } from "@/game/art/lessons";
import { totalBytes } from "@/game/engine/encap";
import { tcpSteps } from "@/game/engine/tcpMachine";
import { bandwidthDelayProduct } from "@/lib/net/basics";
import { hammingSyndrome } from "@/lib/net/errors";
import { ACTIVE_OPEN_CLOSE, PASSIVE_OPEN_CLOSE, TCP_TRANSITIONS } from "@/lib/net/transport";
import { parseSprite } from "@/lib/pixel";

describe("lesson content", () => {
  it("gives gym 1 its four concept cards with unique ids", () => {
    expect(lessonsFor(1).map((l) => l.figure)).toEqual(["layers", "encap", "switching", "delays"]);
    const ids = Object.values(LESSONS).flat().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const gym of Object.keys(LESSONS)) expect(TOWNS.some((t) => t.gym === Number(gym))).toBe(true);
    for (const l of Object.values(LESSONS).flat()) {
      expect(l.paras.length).toBeGreaterThan(0);
      expect(l.caption.length).toBeGreaterThan(0);
    }
  });

  it("works Kurose & Ross's circuit vs packet example: 10 circuit users, P(>10 of 35) ≈ 0.0004", () => {
    expect(WORKED.krCircuit).toBe(10);
    expect(WORKED.krOverload).toBeCloseTo(0.0004, 4);
    const card = lessonsFor(1).find((l) => l.id === "switching")!;
    expect(card.example!.lines.join(" ")).toContain("= 10 users");
    expect(card.example!.lines.join(" ")).toContain("≈ 0.0004");
  });

  it("works the one-hop delays: 1500 B at 10 Mbps = 1.2 ms, 2,000 km at 2×10⁸ m/s = 10 ms, BDP 100,000 bits", () => {
    expect(WORKED.dTrans).toBeCloseTo(0.0012, 12);
    expect(WORKED.dProp).toBeCloseTo(0.01, 12);
    expect(WORKED.bdp).toBeCloseTo(100_000, 6);
    expect(bandwidthDelayProduct(1e9, 0.05)).toBe(5e7); // 1 Gbps × 50 ms = 50 Mbit in flight
    const lines = lessonsFor(1).find((l) => l.id === "delays")!.example!.lines;
    expect(lines).toEqual([
      "Transmission: 1,500 B × 8 ÷ 10 Mbps = 1.2 ms",
      "Propagation: 2,000 km ÷ 2×10⁸ m/s = 10 ms",
      "Bandwidth-delay product: 10 Mbps × 10 ms = 100,000 bits in flight",
    ]);
  });

  it("walks an HTTP message down all five layers, each PDU bigger than the last", () => {
    expect(ENCAP_STEPS.map((s) => s.pdu)).toEqual(["message", "segment", "packet", "frame", "bits"]);
    const sizes = ENCAP_STEPS.map(totalBytes);
    sizes.slice(1).forEach((b, i) => expect(b).toBeGreaterThan(sizes[i]));
    // TCP 20 + IP 20 + Ethernet 18 on top of the message (no padding: the payload is over 46 bytes)
    expect(sizes[3] - sizes[0]).toBe(58);
    const line = lessonsFor(1).find((l) => l.id === "encapsulation")!.example!.lines[0];
    expect(line).toBe(ENCAP_STEPS.map((s) => `${s.pdu} ${totalBytes(s)} B`).join(" → "));
  });

  it("maps OSI's top three layers onto the application layer and the rest one to one", () => {
    expect(OSI_LAYERS).toHaveLength(7);
    expect(OSI_LAYERS.filter((l) => l.tcpip === "APPLICATION").map((l) => l.name)).toEqual(["Application", "Presentation", "Session"]);
    expect([...new Set(OSI_LAYERS.map((l) => l.tcpip))]).toEqual(TCPIP_LAYERS);
  });

  it("gives gym 2 its four cards: CRC, Hamming, CSMA/CD, MAC learning", () => {
    expect(lessonsFor(2).map((l) => l.figure)).toEqual(["crc", "hamming", "csmacd", "macLearn"]);
  });

  it("divides Kurose & Ross's 101110 by 1001 to get remainder 011 and sends 101110011", () => {
    expect(CRC_DEMO).toEqual({ data: "101110", gen: "1001" });
    expect(WORKED.crcRes.remainder).toBe("011");
    expect(WORKED.crcRes.codeword).toBe("101110011");
    expect(WORKED.crcRecv).toBe(true);
    const lines = lessonsFor(2).find((l) => l.id === "crc")!.example!.lines;
    expect(lines[1]).toContain("remainder 011");
    expect(lines[2]).toContain("Sent: 101110011");
  });

  it("encodes 1011 as Hamming 0110011 and locates a flipped bit 6 by syndrome 6", () => {
    expect(HAMMING_DEMO.code).toBe("0110011");
    expect(WORKED.hamFlipped).toBe("0110001");
    expect(WORKED.hamSyndrome).toBe(6);
    expect(hammingSyndrome(HAMMING_DEMO.code)).toBe(0);
    const lines = lessonsFor(2).find((l) => l.id === "hamming")!.example!.lines;
    expect(lines[1]).toContain("2 + 4 = 6");
  });

  it("works the CSMA/CD minimum frame (10 Mbps, 2.5 km → 250 bits) and the backoff ranges", () => {
    expect(WORKED.cdMinBits).toBe(250);
    const lines = lessonsFor(2).find((l) => l.id === "csma-cd")!.example!.lines;
    expect(lines[1]).toContain("= 250 bits");
    expect(lines[2]).toContain("one of 2 values (0, 1)");
    expect(lines[2]).toContain("one of 8 (0 … 7)");
  });

  it("lets the switch learn A and B: the first frame floods to ports 2, 3, 4, the reply goes to port 1 only", () => {
    const lines = lessonsFor(2).find((l) => l.id === "mac-learning")!.example!.lines;
    expect(lines[0]).toContain("floods to ports 2, 3, 4");
    expect(lines[1]).toContain("goes only to port 1");
  });

  it("gives gym 3 its four cards: subnetting, VLSM, longest-prefix match, fragmentation", () => {
    expect(lessonsFor(3).map((l) => l.figure)).toEqual(["subnet", "vlsm", "lpm", "frag"]);
  });

  it("borrows 2 bits from 192.168.1.0/24: four /26 subnets, subnet 2 hosts .65 to .126, broadcast .127", () => {
    expect(WORKED.subNets.map((s) => s.network & 255)).toEqual([0, 64, 128, 192]);
    const lines = lessonsFor(3).find((l) => l.id === "subnetting")!.example!.lines;
    expect(lines[0]).toContain("192.168.1.0/26, 192.168.1.64/26, 192.168.1.128/26, 192.168.1.192/26");
    expect(lines[1]).toBe("Each has 64 addresses, 62 usable for hosts.");
    expect(lines[2]).toContain("network 192.168.1.64, hosts 192.168.1.65 to 192.168.1.126, broadcast 192.168.1.127");
  });

  it("allocates 100, 50, 20 and 2 hosts from a /24 as /25, /26, /27 and /30 at .0, .128, .192, .224", () => {
    const lines = lessonsFor(3).find((l) => l.id === "vlsm")!.example!.lines;
    expect(lines[0]).toContain("192.168.1.0/25 (128 addresses, 126 usable)");
    expect(lines[1]).toContain("192.168.1.128/26");
    expect(lines[2]).toContain("192.168.1.192/27");
    expect(lines[3]).toContain("192.168.1.224/30 (4 addresses, 2 usable)");
    expect(lines[4]).toBe("Together they use 228 of 256 addresses.");
  });

  it("routes 10.1.2.7 by the /24 among four matching routes", () => {
    expect(WORKED.lpmMatches).toHaveLength(4);
    expect(WORKED.lpmWinner.nextHop).toBe("R3");
    const lines = lessonsFor(3).find((l) => l.id === "longest-prefix")!.example!.lines;
    expect(lines[0]).toBe("Matching routes: 0.0.0.0/0, 10.0.0.0/8, 10.1.0.0/16, 10.1.2.0/24.");
    expect(lines[1]).toBe("Longest is 10.1.2.0/24, so the packet goes to R3.");
  });

  it("fragments Kurose & Ross's 4000-byte datagram into lengths 1500, 1500, 1040 at offsets 0, 185, 370", () => {
    expect(WORKED.fragList.map((f) => [f.totalLength, f.offset, f.more])).toEqual([[1500, 0, true], [1500, 185, true], [1040, 370, false]]);
    const lines = lessonsFor(3).find((l) => l.id === "fragmentation")!.example!.lines;
    expect(lines[0]).toContain("at most 1480 B of data per fragment");
    expect(lines[3]).toBe("Fragment 3: length 1040, offset 370, MF = 0.");
    expect(lines[4]).toBe("Offset 185 × 8 = 1480 bytes of data come before fragment 2.");
  });

  it("gives gym 4 its four cards: Dijkstra, Bellman-Ford, count to infinity, BGP", () => {
    expect(lessonsFor(4).map((l) => l.figure)).toEqual(["dijkstra", "bellman", "cti", "bgp"]);
  });

  it("settles K&R's graph (relabelled A–F) from A in the order A, D, B, E, C, F with A→F via D, E", () => {
    expect(WORKED.dijRes.order).toEqual(["A", "D", "B", "E", "C", "F"]);
    const lines = lessonsFor(4).find((l) => l.id === "dijkstra")!.example!.lines;
    expect(lines[1]).toBe("After settling D, C improves from 5 to 4 through D and E becomes 2.");
    expect(lines[2]).toBe("Final costs: A = 0, B = 2, C = 3, D = 1, E = 2, F = 4.");
    expect(lines[3]).toBe("Least-cost path to F: A → D → E → F, cost 4, so A forwards F-bound packets to D.");
  });

  it("runs Bellman-Ford to F: costs by round, settled after 3 rounds", () => {
    expect(WORKED.bfRounds).toHaveLength(5);
    const lines = lessonsFor(4).find((l) => l.id === "bellman-ford")!.example!.lines;
    expect(lines[0]).toBe("Round 1: A = ∞, B = ∞, C = 5, D = ∞, E = 2, F = 0.");
    expect(lines[1]).toBe("Round 2: A = 10, B = 8, C = 3, D = 3, E = 2, F = 0.");
    expect(lines[2]).toBe("Round 3: A = 4, B = 5, C = 3, D = 3, E = 2, F = 0.");
    expect(lines[4]).toContain("settled after 3 rounds");
  });

  it("counts to infinity in 15 rounds without poison and 2 with it", () => {
    expect(WORKED.ctiPlain.slice(0, 4).map((h) => [h.dist.B, h.dist.C])).toEqual([[1, 2], [3, 2], [3, 4], [5, 4]]);
    const lines = lessonsFor(4).find((l) => l.id === "count-to-infinity")!.example!.lines;
    expect(lines[1]).toBe("That takes 15 rounds before both reach RIP's infinity of 16.");
    expect(lines[2]).toBe("With poisoned reverse: (1, 2) → (16, 2) → (16, 16), done in 2 rounds.");
  });

  it("builds AS_PATH 3 2 1 at AS4 and has AS1 reject 4 3 2 1", () => {
    expect(WORKED.bgpPaths[2]).toEqual([3, 2, 1]);
    const lines = lessonsFor(4).find((l) => l.id === "bgp-as-path")!.example!.lines;
    expect(lines).toEqual(["AS2 receives AS_PATH 1.", "AS3 receives AS_PATH 2 1.", "AS4 receives AS_PATH 3 2 1.", "If AS4 passed it on to AS1, the path would be 4 3 2 1. It contains AS1, so AS1 rejects it."]);
  });

  it("gives gym 5 its three cards: handshake and teardown, sliding windows, congestion control", () => {
    expect(lessonsFor(5).map((l) => l.figure)).toEqual(["tcpflow", "window", "cwnd"]);
  });

  it("draws the handshake with seq 100/300 and the data ack 301", () => {
    const lines = lessonsFor(5).find((l) => l.id === "tcp-connection")!.example!.lines;
    expect(lines.slice(0, 3)).toEqual(["Client sends SYN, seq 100.", "Server sends SYN+ACK, seq 300, ack 101.", "Client sends ACK, seq 101, ack 301."]);
    expect(lines[3]).toBe("The client then sends 200 bytes starting at seq 101; the server acknowledges 301 (101 + 200).");
    expect(WORKED.dataAck).toBe(301);
  });

  it("walks both sides through the real TCP states, every step a legal transition", () => {
    expect(stateTrail("client")).toEqual(ACTIVE_OPEN_CLOSE.slice(0, 6).concat("CLOSED"));
    expect(stateTrail("server")).toEqual(PASSIVE_OPEN_CLOSE.slice(1));
    for (const side of ["client", "server"] as const) {
      const trail = side === "client" ? stateTrail(side) : ["CLOSED" as const, ...stateTrail(side)];
      trail.slice(1).forEach((to, i) => expect(TCP_TRANSITIONS.some(([from, , t]) => from === trail[i] && t === to)).toBe(true));
    }
    expect(TCP_FLOW.filter((e) => e.phase === "open")).toHaveLength(3);
    expect(TCP_FLOW.filter((e) => e.phase === "close")).toHaveLength(4);
  });

  it("sends 12 packets with Go-Back-N and 9 with Selective Repeat when packet 2 of 8 is lost in a window of 4", () => {
    expect(WORKED.gbnSends.map((s) => s.pkt)).toEqual([0, 1, 2, 3, 4, 5, 2, 3, 4, 5, 6, 7]);
    expect(WORKED.srSends.map((s) => s.pkt)).toEqual([0, 1, 2, 3, 4, 5, 2, 6, 7]);
    expect([WORKED.gbnSends.length, WORKED.srSends.length]).toEqual([WORKED.gbnCount, WORKED.srCount]);
    // every packet is delivered, and the lost one is the only one dropped by the network
    for (const proto of ["gbn", "sr"] as const) {
      const sends = windowSends(proto);
      expect(sends.filter((s) => s.kind === "lost")).toHaveLength(1);
      expect(new Set(sends.map((s) => s.pkt)).size).toBe(WINDOW_DEMO.packets);
    }
  });

  it("matches K&R's utilisation numbers: 0.00027 stop-and-wait, three times that with a window of 3", () => {
    expect(WORKED.uStop).toBeCloseTo(0.00027, 5);
    expect(WORKED.uThree).toBeCloseTo(3 * WORKED.uStop, 12);
    expect(WORKED.pipeWindow).toBe(3751);
    const lines = lessonsFor(5).find((l) => l.id === "sliding-window")!.example!.lines;
    expect(lines[2]).toContain("stop-and-wait 0.027%, window of 3 0.080%");
  });

  it("plots Reno's cwnd: 1, 2, 4, 8, then +1 to 13, halve to 6, timeout to 1", () => {
    expect(WORKED.cw.cwnd).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 13, 6, 7, 8, 9, 10, 1, 2, 4, 5]);
    const lines = lessonsFor(5).find((l) => l.id === "congestion-control")!.example!.lines;
    expect(lines[0]).toBe("Slow start: cwnd = 1, 2, 4, 8 MSS, capped at ssthresh 8.");
    expect(lines[1]).toBe("Additive increase: 9, 10, 11, 12, 13 MSS, one more each RTT.");
    expect(lines[2]).toBe("Triple duplicate ACK at cwnd 13: ssthresh = 6, cwnd = 6.");
    expect(lines[3]).toBe("Timeout at cwnd 10: ssthresh = 5, cwnd = 1, then slow start again.");
  });

  it("opens the lessons before a gym only until they've been seen once", () => {
    expect(showLessonsFirst(1, [])).toBe(true);
    expect(showLessonsFirst(1, markLessonsSeen([], 1))).toBe(false);
    expect(showLessonsFirst(2, [1])).toBe(true);
    expect(showLessonsFirst(2, [1, 2])).toBe(false);
    expect(showLessonsFirst(3, [1, 2])).toBe(true);
    expect(showLessonsFirst(4, [1, 2, 3])).toBe(true);
    expect(showLessonsFirst(9, [])).toBe(false); // no cards yet
    expect(markLessonsSeen([3, 1], 1)).toEqual([1, 3]);
  });
});

describe("lesson figures", () => {
  it("are valid sprites with an outline colour and several shades", () => {
    for (const def of [layerStackFigure(), switchingFigure(), delaysFigure(), crcFigure(), hammingFigure(), csmaFigure(), macLearningFigure(), subnetFigure(), vlsmFigure(), lpmFigure(), fragFigure(), dijkstraFigure(), bellmanFordFigure(), countToInfinityFigure(), bgpFigure(), tcpFlowFigure(), windowFigure(), cwndFigure()]) {
      const g = parseSprite(def);
      expect(g.width).toBeGreaterThan(60);
      expect(g.width).toBeLessThanOrEqual(160); // fits an iPhone at 2× scale
      expect(Object.values(def.palette)).toContain("#140f26");
      expect(new Set(g.pixels.filter(Boolean)).size).toBeGreaterThanOrEqual(8);
    }
  });

  it("sends the same burst both ways: packet switching fills the link back to back and finishes first", () => {
    const order = packetOrder();
    expect(order).toHaveLength(BURST.reduce((a, b) => a + b, 0));
    BURST.forEach((n, u) => expect(order.filter((x) => x === u)).toHaveLength(n));
    // TDM needs a slot for every user in every frame, so idle slots go out empty
    expect(order.length).toBeLessThan(TDM_FRAMES * BURST.length);
  });
});

describe("animated TCP state machine", () => {
  const steps = tcpSteps();
  const legal = (from: string, to: string) => TCP_TRANSITIONS.some(([f, , t]) => f === from && t === to);

  it("starts at CLOSED / LISTEN and ends with the client's TIME_WAIT timeout", () => {
    expect(steps[0]).toMatchObject({ client: "CLOSED", server: "LISTEN", seg: null });
    expect(steps[steps.length - 2]).toMatchObject({ client: "TIME_WAIT", server: "CLOSED" });
    expect(steps[steps.length - 1]).toMatchObject({ client: "CLOSED", server: "CLOSED", seg: null });
    expect(steps).toHaveLength(TCP_FLOW.length + 2);
  });

  it("only makes transitions the TCP state machine allows", () => {
    for (let i = 1; i < steps.length; i++)
      for (const side of ["client", "server"] as const)
        if (steps[i][side] !== steps[i - 1][side]) expect(legal(steps[i - 1][side], steps[i][side]), `${side} step ${i}`).toBe(true);
  });

  it("walks each side through exactly the textbook state lists", () => {
    for (const side of ["client", "server"] as const) {
      const seen = steps.map((s) => s[side]).filter((s, i, a) => i === 0 || s !== a[i - 1]);
      expect(seen).toEqual(side === "client" ? ACTIVE_OPEN_CLOSE : PASSIVE_OPEN_CLOSE.slice(1));
    }
  });

  it("explains every step and the lesson links to the page", () => {
    for (const s of steps) expect(s.note.length).toBeGreaterThan(30);
    expect(lessonsFor(5).find((l) => l.id === "tcp-connection")?.tool?.href).toBe("/tcp");
  });
});
