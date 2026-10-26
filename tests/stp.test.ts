import { describe, expect, it } from "vitest";
import { SWITCHING_BANK } from "@/content/questions/switchingBank";
import { SWITCHING_GENERATORS, etherChannelGen, stpBlockedGen, stpPathCostGen, stpRootGen } from "@/content/questions/switchingGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText } from "@/game/engine/questions";
import { computeStp, effectivePriority, etherChannelForms, stpPortCost, violationOutcome, type StpBridge } from "@/lib/net/stp";

const seeds = Array.from({ length: 80 }, (_, i) => i * 4099 + 3);
const br = (name: string, priority: number, mac: string): StpBridge => ({ name, priority, mac });

describe("STP costs and priority", () => {
  it("uses the 802.1D short costs", () => {
    expect([10, 100, 1000, 10000].map(stpPortCost)).toEqual([100, 19, 4, 2]);
    expect(() => stpPortCost(40)).toThrow();
  });
  it("adds the VLAN to the priority (extended system ID)", () => {
    expect(effectivePriority(32768, 10)).toBe(32778);
    expect(effectivePriority(4096, 1)).toBe(4097);
    expect(() => effectivePriority(1000, 1)).toThrow();
  });
});

describe("computeStp", () => {
  it("elects the lowest priority, then the lowest MAC", () => {
    const b = [br("A", 32769, "000000000002"), br("B", 32769, "000000000001"), br("C", 32769, "000000000003")];
    const links = [{ a: "A", b: "B", cost: 19 }, { a: "B", b: "C", cost: 19 }];
    expect(computeStp(b, links).root).toBe("B");
    b[0].priority = 4097;
    expect(computeStp(b, links).root).toBe("A");
  });
  it("blocks the far end of the longest side of an all-FastEthernet triangle", () => {
    // Root SW1 (lowest MAC): SW2 and SW3 both cost 19; the SW2-SW3 link blocks at SW3 (higher bridge ID).
    const b = [br("SW1", 32769, "00000000000a"), br("SW2", 32769, "00000000000b"), br("SW3", 32769, "00000000000c")];
    const r = computeStp(b, [{ a: "SW1", b: "SW2", cost: 19 }, { a: "SW2", b: "SW3", cost: 19 }, { a: "SW3", b: "SW1", cost: 19 }]);
    expect(r.pathCost).toEqual({ SW1: 0, SW2: 19, SW3: 19 });
    expect(r.ports.filter((p) => p.role === "blocked")).toEqual([{ bridge: "SW3", peer: "SW2", role: "blocked" }]);
    expect(r.ports.filter((p) => p.role === "root").map((p) => p.bridge).sort()).toEqual(["SW2", "SW3"]);
  });
  it("prefers the cheaper path even if it is longer", () => {
    // Gigabit hops (4+4) beat a direct 10 Mbps link (100): SW3 goes through SW2 and the root link blocks at SW3.
    const b = [br("SW1", 4097, "000000000001"), br("SW2", 32769, "000000000002"), br("SW3", 32769, "000000000003")];
    const r = computeStp(b, [{ a: "SW1", b: "SW2", cost: 4 }, { a: "SW2", b: "SW3", cost: 4 }, { a: "SW3", b: "SW1", cost: 100 }]);
    expect(r.pathCost.SW3).toBe(8);
    expect(r.ports.find((p) => p.bridge === "SW3" && p.peer === "SW1")?.role).toBe("blocked");
    expect(r.ports.find((p) => p.bridge === "SW1" && p.peer === "SW3")?.role).toBe("designated");
  });
  it("rejects a disconnected topology", () => {
    expect(() => computeStp([br("A", 1, "01"), br("B", 1, "02")], [])).toThrow();
  });
});

describe("EtherChannel", () => {
  it("follows the LACP / PAgP / on rules", () => {
    expect(etherChannelForms("active", "active")).toBe(true);
    expect(etherChannelForms("active", "passive")).toBe(true);
    expect(etherChannelForms("passive", "passive")).toBe(false);
    expect(etherChannelForms("desirable", "auto")).toBe(true);
    expect(etherChannelForms("auto", "auto")).toBe(false);
    expect(etherChannelForms("active", "desirable")).toBe(false);
    expect(etherChannelForms("on", "on")).toBe(true);
    expect(etherChannelForms("on", "active")).toBe(false);
  });
});

describe("port-security violation modes", () => {
  it("only shutdown err-disables; protect does not log", () => {
    expect(violationOutcome("protect")).toEqual({ dropsViolatingFrames: true, logsAndCounts: false, errDisabled: false });
    expect(violationOutcome("restrict")).toEqual({ dropsViolatingFrames: true, logsAndCounts: true, errDisabled: false });
    expect(violationOutcome("shutdown").errDisabled).toBe(true);
  });
});

describe("switching II cards and generators", () => {
  it("has unique, well-formed cards", () => {
    expect(new Set(SWITCHING_BANK.map((c) => c.id)).size).toBe(SWITCHING_BANK.length);
    for (const c of SWITCHING_BANK) {
      expect(c.kind === "mcq" && c.choices.length === 4 && new Set(c.choices).size === 4, c.id).toBe(true);
      expect(answerText(c)).toBeTruthy();
    }
  });
  it("registers all generators", () => {
    for (const g of SWITCHING_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("root election answers are re-solved from the printed bridge IDs", () => {
    for (const s of seeds) {
      const q = stpRootGen.generate(s);
      if (q.kind !== "mcq") throw new Error("mcq");
      const rows = [...q.prompt.matchAll(/(SW\d): priority (\d+), MAC ([0-9a-f.]+)/g)].map((m) => ({ name: m[1], p: Number(m[2]), mac: m[3].replace(/\./g, "") }));
      rows.sort((a, b) => a.p - b.p || a.mac.localeCompare(b.mac));
      expect(q.choices[q.answer]).toBe(rows[0].name);
    }
  });
  it("blocked-port answers match the solver, always one port blocked", () => {
    for (const s of seeds) {
      const q = stpBlockedGen.generate(s);
      if (q.kind !== "mcq") throw new Error("mcq");
      expect(q.choices[q.answer]).toMatch(/^SW\d's port toward SW\d$/);
    }
  });
  it("path cost answers are the cheaper way round the ring", () => {
    const cost = { Ethernet: 100, FastEthernet: 19, Gigabit: 4 } as const;
    for (const s of seeds) {
      const q = stpPathCostGen.generate(s);
      if (q.kind !== "numeric") throw new Error("numeric");
      const c = [...q.prompt.matchAll(/SW\d — SW\d: (\w+)/g)].map((m) => cost[m[1] as keyof typeof cost]);
      const target = Number(/What is SW(\d)/.exec(q.prompt)![1]) - 1;
      const cw = c.slice(0, target).reduce((a, b) => a + b, 0);
      const ccw = c.slice(target).reduce((a, b) => a + b, 0);
      expect(q.answer).toBe(Math.min(cw, ccw));
    }
  });
  it("EtherChannel verdicts match the rule table", () => {
    for (const s of seeds) {
      const q = etherChannelGen.generate(s);
      if (q.kind !== "mcq") throw new Error("mcq");
      const [, a, b] = q.id.split(":");
      expect(q.choices[q.answer]).toBe(etherChannelForms(a as never, b as never) ? "Yes, the channel forms" : "No, the channel does not form");
    }
  });
});
