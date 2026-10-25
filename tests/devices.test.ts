import { describe, expect, it } from "vitest";
import { UTP_MAX_METERS, cableFor, frameClass, maxPingPayload, parsePing, parseTraceroute, pingTranscript, poeDevices, tracerouteTranscript } from "@/lib/net/devices";

describe("Ethernet cabling and frames", () => {
  it("picks straight-through for unlike devices and crossover for like ones (Odom ch. 2)", () => {
    expect(cableFor("PC", "Switch")).toBe("straight-through");
    expect(cableFor("Router", "Switch")).toBe("straight-through");
    expect(cableFor("Router", "Hub")).toBe("straight-through");
    expect(cableFor("Wireless AP", "Switch")).toBe("straight-through");
    expect(cableFor("Switch", "Switch")).toBe("crossover");
    expect(cableFor("Switch", "Hub")).toBe("crossover");
    expect(cableFor("PC", "PC")).toBe("crossover");
    expect(cableFor("Router", "PC")).toBe("crossover");
    expect(cableFor("Router", "Router")).toBe("crossover");
  });

  it("limits copper to 100 m", () => expect(UTP_MAX_METERS).toBe(100));

  it("classes frames by size: <64 runt, 64–1518 normal, >1518 giant", () => {
    expect(frameClass(63)).toBe("runt");
    expect(frameClass(64)).toBe("normal");
    expect(frameClass(1518)).toBe("normal");
    expect(frameClass(1519)).toBe("giant");
    expect(() => frameClass(0)).toThrow();
  });

  it("budgets PoE by the per-port maximum a switch sources", () => {
    expect(poeDevices(370, "af")).toBe(24); // 370 / 15.4 = 24.03
    expect(poeDevices(740, "at")).toBe(24);
    expect(poeDevices(30, "af")).toBe(1);
    expect(poeDevices(185, "af")).toBe(12); // 12 × 15.4 = 184.8
    expect(poeDevices(1000, "bt4")).toBe(10);
  });

  it("leaves 1472 bytes of ping payload on a 1500-byte MTU", () => {
    expect(maxPingPayload(1500)).toBe(1472);
    expect(maxPingPayload(1492)).toBe(1464);
  });
});

describe("reading ping output", () => {
  it("counts replies, timeouts and unreachables", () => {
    expect(parsePing("!!!!!")).toMatchObject({ sent: 5, replies: 5, successPercent: 100 });
    expect(parsePing(".!!!!")).toMatchObject({ sent: 5, replies: 4, timeouts: 1, successPercent: 80 });
    expect(parsePing("UUUUU")).toMatchObject({ replies: 0, unreachables: 5, successPercent: 0 });
    expect(parsePing("!.!.!.!.!.").successPercent).toBe(50);
    expect(() => parsePing("hello")).toThrow();
  });

  it("builds the IOS transcript Cisco prints", () => {
    const t = pingTranscript("10.0.0.2", ".!!!!");
    expect(t).toContain("Success rate is 80 percent (4/5), round-trip min/avg/max = 1/2/4 ms");
    expect(pingTranscript("10.0.0.2", "UUUUU")).toContain("Success rate is 0 percent (0/5)");
  });
});

describe("reading traceroute output", () => {
  it("finds the last router that answered", () => {
    const t = tracerouteTranscript("10.9.9.9", ["10.1.1.2", "10.2.2.2", "10.3.3.2"], 2);
    const r = parseTraceroute(t, "10.9.9.9");
    expect(r.hops).toHaveLength(5);
    expect(r.lastResponding).toBe(3);
    expect(r.reached).toBe(false);
  });

  it("recognises a trace that reached the destination", () => {
    const t = tracerouteTranscript("10.9.9.9", ["10.1.1.2", "10.9.9.9"], 0);
    expect(parseTraceroute(t, "10.9.9.9")).toMatchObject({ lastResponding: 2, reached: true });
  });

  it("copes with a trace where nothing answered", () => {
    expect(parseTraceroute(tracerouteTranscript("10.9.9.9", [], 3), "10.9.9.9").lastResponding).toBe(0);
  });
});
