import { describe, expect, it } from "vitest";
import { ENCAP_STEPS, LESSONS, WORKED, lessonsFor, markLessonsSeen, showLessonsFirst } from "@/content/lessons";
import { TOWNS } from "@/content/world";
import { BURST, CRC_DEMO, HAMMING_DEMO, OSI_LAYERS, TCPIP_LAYERS, TDM_FRAMES, crcFigure, csmaFigure, delaysFigure, hammingFigure, layerStackFigure, macLearningFigure, packetOrder, switchingFigure } from "@/game/art/lessons";
import { totalBytes } from "@/game/engine/encap";
import { bandwidthDelayProduct } from "@/lib/net/basics";
import { hammingSyndrome } from "@/lib/net/errors";
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

  it("opens the lessons before a gym only until they've been seen once", () => {
    expect(showLessonsFirst(1, [])).toBe(true);
    expect(showLessonsFirst(1, markLessonsSeen([], 1))).toBe(false);
    expect(showLessonsFirst(2, [1])).toBe(true);
    expect(showLessonsFirst(2, [1, 2])).toBe(false);
    expect(showLessonsFirst(9, [])).toBe(false); // no cards yet
    expect(markLessonsSeen([3, 1], 1)).toEqual([1, 3]);
  });
});

describe("lesson figures", () => {
  it("are valid sprites with an outline colour and several shades", () => {
    for (const def of [layerStackFigure(), switchingFigure(), delaysFigure(), crcFigure(), hammingFigure(), csmaFigure(), macLearningFigure()]) {
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
