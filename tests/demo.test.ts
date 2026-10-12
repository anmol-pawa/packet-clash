import { describe, expect, it } from "vitest";
import { DEMO_QUESTIONS } from "@/content/demo";
import { propagationDelay, transmissionDelay, usableHosts } from "@/lib/net/basics";

describe("network calculators", () => {
  it("counts usable hosts per prefix", () => {
    expect(usableHosts(24)).toBe(254);
    expect(usableHosts(26)).toBe(62);
    expect(usableHosts(30)).toBe(2);
    expect(usableHosts(31)).toBe(2);
    expect(usableHosts(32)).toBe(1);
    expect(() => usableHosts(33)).toThrow();
  });

  it("computes transmission and propagation delay", () => {
    // Kurose & Ross: L = 1,000 bytes on R = 1 Mbps → 8 ms.
    expect(transmissionDelay(1000, 1e6)).toBeCloseTo(0.008, 12);
    // 2,500 km of fibre at 2.5×10⁸ m/s → 10 ms.
    expect(propagationDelay(2.5e6, 2.5e8)).toBeCloseTo(0.01, 12);
  });
});

describe("demo questions", () => {
  const expected: Record<string, string> = {
    "router-layer": "Network (L3)",
    arp: "ARP",
    "hosts-26": "62",
    "syn-reply": "SYN-ACK",
    "tx-delay": "8 ms",
    "tcp-pdu": "Segment",
  };

  it("every question has a tested answer", () => {
    expect(DEMO_QUESTIONS.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of DEMO_QUESTIONS) expect(q.options[q.answer], q.id).toBe(expected[q.id]);
  });

  it("options are distinct", () => {
    for (const q of DEMO_QUESTIONS) expect(new Set(q.options).size, q.id).toBe(4);
  });
});
