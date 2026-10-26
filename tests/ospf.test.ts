import { describe, expect, it } from "vitest";
import { OSPF_BANK } from "@/content/questions/ospfBank";
import { OSPF_GENERATORS, drElectionGen, eigrpMetricGen, ospfCostGen } from "@/content/questions/ospfGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { EIGRP_INTERFACES, adjacencyState, eigrpMetric, electDr, ospfCost, pathCost, pickRouterId } from "@/lib/net/ospf";

const seeds = Array.from({ length: 80 }, (_, i) => i * 4099 + 3);

describe("OSPF cost", () => {
  it("matches the Cisco defaults (reference 100 Mbps)", () => {
    expect(ospfCost(10)).toBe(10);
    expect(ospfCost(100)).toBe(1);
    expect(ospfCost(1000)).toBe(1);
    expect(ospfCost(1.544)).toBe(64);
  });
  it("follows a raised reference bandwidth", () => {
    expect(ospfCost(1000, 10000)).toBe(10);
    expect(ospfCost(10000, 10000)).toBe(1);
    expect(ospfCost(100, 10000)).toBe(100);
  });
  it("sums outgoing interface costs along a path", () => {
    expect(pathCost([ospfCost(100), ospfCost(10), ospfCost(1.544)])).toBe(1 + 10 + 64);
  });
});

describe("DR/BDR election", () => {
  const r = (name: string, id: string, priority: number) => ({ name, routerId: id, priority });
  it("highest priority wins, then highest router ID", () => {
    const e = electDr([r("A", "1.1.1.1", 1), r("B", "3.3.3.3", 1), r("C", "2.2.2.2", 100)]);
    expect([e.dr?.name, e.bdr?.name]).toEqual(["C", "B"]);
  });
  it("priority 0 is ineligible", () => {
    const e = electDr([r("A", "9.9.9.9", 0), r("B", "1.1.1.1", 1)]);
    expect([e.dr?.name, e.bdr]).toEqual(["B", null]);
    expect(electDr([r("A", "1.1.1.1", 0)])).toEqual({ dr: null, bdr: null });
  });
  it("compares router IDs numerically, not as text", () => {
    const e = electDr([r("A", "9.0.0.1", 1), r("B", "10.0.0.1", 1)]);
    expect(e.dr?.name).toBe("B");
  });
  it("only the DR/BDR reach Full", () => {
    expect(adjacencyState(false, false)).toBe("2-Way");
    expect(adjacencyState(true, false)).toBe("Full");
  });
});

describe("router ID", () => {
  it("manual, then highest loopback, then highest interface", () => {
    expect(pickRouterId({ manual: "1.1.1.1", loopbacks: ["9.9.9.9"], interfaces: ["8.8.8.8"] })).toBe("1.1.1.1");
    expect(pickRouterId({ loopbacks: ["10.0.0.9", "10.0.0.10"], interfaces: ["192.168.1.1"] })).toBe("10.0.0.10");
    expect(pickRouterId({ interfaces: ["192.168.1.1", "10.0.0.1"] })).toBe("192.168.1.1");
    expect(pickRouterId({})).toBeNull();
  });
});

describe("EIGRP metric", () => {
  it("matches the well-known single-link values", () => {
    const g = EIGRP_INTERFACES.GigabitEthernet;
    const f = EIGRP_INTERFACES.FastEthernet;
    expect(eigrpMetric([g.bandwidthKbps], [g.delayUs])).toBe(2816);
    expect(eigrpMetric([f.bandwidthKbps], [f.delayUs])).toBe(28160);
  });
  it("uses the lowest bandwidth and the summed delay (T1 + FastEthernet, worked by hand)", () => {
    const m = eigrpMetric([1544, 100000], [20000, 100]);
    expect(m).toBe(256 * (Math.floor(1e7 / 1544) + 2010));
    // 10^7 / 1544 = 6476, delay (20000 + 100) / 10 = 2010, 256 * 8486.
    expect(m).toBe(2_172_416);
  });
});

describe("OSPF/EIGRP cards and generators", () => {
  it("pin every card answer", () => {
    const expected: Record<string, string> = {
      "ospf-cost-formula": "10",
      "ospf-gig-cost": "The reference bandwidth is 100 Mbps, so anything faster rounds up to the minimum cost of 1",
      "ospf-ref-bw": "auto-cost reference-bandwidth 10000",
      "ospf-states": "1. Down  2. Init  3. 2-Way  4. ExStart  5. Exchange  6. Loading  7. Full",
      "ospf-dr-election": "Highest interface priority, then highest router ID",
      "ospf-dr-nonpreempt": "Nothing: the election is not pre-emptive, the existing DR stays until it fails or OSPF restarts",
      "ospf-priority-zero": "The router can never become DR or BDR on that segment",
      "ospf-router-id": "Manual router-id, then highest loopback IP, then highest active interface IP",
      "ospf-twoway": "2-Way",
      "ospf-hello-match": "Area ID, Hello and dead timers, Subnet and mask on the link",
      "ospf-passive": "The network is still advertised, but no hellos are sent so no neighbours form on it",
      "ospf-multicast": "224.0.0.5",
      "ospf-area0": "Area 0, the backbone",
      "eigrp-metric-inputs": "Minimum bandwidth along the path and cumulative delay",
      "eigrp-successor": "A backup next hop whose reported distance is lower than the successor's feasible distance",
      "eigrp-config": "Autonomous system number and K values",
    };
    expect(OSPF_BANK.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of OSPF_BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
    for (const q of OSPF_BANK) expect(grade(q, correctResponse(q)), q.id).toBe(true);
  });

  it("are registered", () => {
    for (const g of OSPF_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("path-choice answer is re-solved from the paths printed in the prompt", () => {
    const bw = (n: string) => (n === "Ethernet" ? 10 : n === "FastE" ? 100 : 1000);
    for (const s of seeds) {
      const q = ospfCostGen.generate(s) as McqQuestion;
      const ref = Number(/bandwidth is (\d+) Mbps/.exec(q.prompt)![1]);
      const cost = (label: string) => pathCost(label.split(" + ").map((n) => ospfCost(bw(n), ref)));
      const a = cost(/Path A: (.+)/.exec(q.prompt)![1]);
      const b = cost(/Path B: (.+)/.exec(q.prompt)![1]);
      expect(a).not.toBe(b);
      expect(q.choices[q.answer]).toBe(a < b ? "Path A" : "Path B");
    }
  });

  it("DR answer is re-solved from the routers printed in the prompt", () => {
    for (const s of seeds) {
      const q = drElectionGen.generate(s) as McqQuestion;
      const routers = [...q.prompt.matchAll(/^(R\d): router ID ([\d.]+), priority (\d+)$/gm)].map((m) => ({ name: m[1], routerId: m[2], priority: Number(m[3]) }));
      const e = electDr(routers);
      const asks = /becomes the (DR|BDR)\?/.exec(q.prompt)![1];
      const w = (asks === "DR" ? e.dr : e.bdr)?.name ?? "No router: all are ineligible";
      expect(q.choices[q.answer]).toBe(w);
    }
  });

  it("EIGRP metric answer is re-solved from the links named in the prompt", () => {
    for (const s of seeds) {
      const q = eigrpMetricGen.generate(s) as NumericQuestion;
      const hops = /crosses ([\w, ]+) links/.exec(q.prompt)![1].split(", ") as (keyof typeof EIGRP_INTERFACES)[];
      expect(q.answer).toBe(eigrpMetric(hops.map((h) => EIGRP_INTERFACES[h].bandwidthKbps), hops.map((h) => EIGRP_INTERFACES[h].delayUs)));
    }
  });
});
