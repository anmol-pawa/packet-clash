import { describe, expect, it } from "vitest";
import { IPROUTE_BANK } from "@/content/questions/iprouteBank";
import { IPROUTE_GENERATORS, adCompareGen, floatingAdGen, routeSelectGen } from "@/content/questions/iprouteGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion } from "@/game/engine/questions";
import { ADMIN_DISTANCE, floatingAd, installedFor, parseAdMetric, route, selectRoute, showRouteLine } from "@/lib/net/iproute";

const seeds = Array.from({ length: 80 }, (_, i) => i * 5003 + 7);

describe("administrative distance", () => {
  it("matches the Cisco defaults (Odom, CCNA 200-301 OCG)", () => {
    expect(ADMIN_DISTANCE).toMatchObject({ connected: 0, static: 1, ebgp: 20, eigrp: 90, ospf: 110, isis: 115, rip: 120, "eigrp-external": 170, ibgp: 200 });
  });
  it("floating static needs one more than the protocol it backs up", () => {
    expect(floatingAd("ospf")).toBe(111);
    expect(floatingAd("eigrp")).toBe(91);
  });
});

describe("route selection", () => {
  const routes = [
    route("10.0.0.0/8", "ospf", 20, { nextHop: "1.1.1.1" }),
    route("10.1.0.0/16", "rip", 3, { nextHop: "2.2.2.2" }),
    route("10.1.1.0/24", "static", 0, { nextHop: "3.3.3.3" }),
    route("0.0.0.0/0", "static", 0, { nextHop: "4.4.4.4" }),
  ];
  it("uses the longest matching prefix before AD", () => {
    expect(selectRoute(routes, "10.1.2.5")?.nextHop).toBe("2.2.2.2");
    expect(selectRoute(routes, "10.1.1.9")?.nextHop).toBe("3.3.3.3");
    expect(selectRoute(routes, "10.200.0.1")?.nextHop).toBe("1.1.1.1");
  });
  it("falls back to the default route and returns null without one", () => {
    expect(selectRoute(routes, "8.8.8.8")?.nextHop).toBe("4.4.4.4");
    expect(selectRoute(routes.slice(0, 3), "8.8.8.8")).toBeNull();
  });
  it("breaks equal-prefix ties by AD, then metric", () => {
    const t = [route("172.16.0.0/16", "rip", 1, { nextHop: "a" }), route("172.16.0.0/16", "ospf", 99, { nextHop: "b" })];
    expect(installedFor(t, "172.16.0.0/16")?.nextHop).toBe("b");
    const u = [route("172.16.0.0/16", "ospf", 50, { nextHop: "a" }), route("172.16.0.0/16", "ospf", 20, { nextHop: "b" })];
    expect(selectRoute(u, "172.16.1.1")?.nextHop).toBe("b");
  });
  it("a floating static (AD 130) is hidden by OSPF and used alone", () => {
    const f = route("192.168.9.0/24", "static", 0, { ad: 130, nextHop: "s" });
    const o = route("192.168.9.0/24", "ospf", 20, { nextHop: "o" });
    expect(selectRoute([f, o], "192.168.9.1")?.nextHop).toBe("o");
    expect(selectRoute([f], "192.168.9.1")?.nextHop).toBe("s");
  });
});

describe("show ip route lines", () => {
  it("prints codes and [AD/metric]", () => {
    expect(showRouteLine(route("10.2.0.0/16", "ospf", 20, { nextHop: "10.0.0.2" }))).toBe("O   10.2.0.0/16 [110/20] via 10.0.0.2");
    expect(showRouteLine(route("0.0.0.0/0", "static", 0, { nextHop: "203.0.113.1" }))).toBe("S*  0.0.0.0/0 [1/0] via 203.0.113.1");
    expect(parseAdMetric("O   10.2.0.0/16 [110/20] via 10.0.0.2")).toEqual({ ad: 110, metric: 20 });
  });
});

describe("IP routing cards and generators", () => {
  it("pin every card answer", () => {
    const expected: Record<string, string> = {
      "iprt-ad-order": "1. Connected (0)  2. Static (1)  3. EIGRP (90)  4. OSPF (110)  5. RIP (120)",
      "iprt-longest-prefix": "10.1.0.0/16 via RIP",
      "iprt-ad-tie": "OSPF, because 110 < 120",
      "iprt-floating": "ip route 192.168.9.0 255.255.255.0 10.0.0.2 130",
      "iprt-route-codes": "Learned dynamically: O  (OSPF), D  (EIGRP), R  (RIP); Configured or directly attached: S  (static), C  (connected), L  (local)",
      "iprt-local-route": "C 192.168.1.0/24 and L 192.168.1.1/32",
      "iprt-default-route": "ip route 0.0.0.0 0.0.0.0 203.0.113.1",
      "iprt-gateway-last-resort": "A default route exists; packets with no more specific match go to 10.0.0.2",
      "iprt-brackets": "Administrative distance and OSPF cost (metric)",
      "iprt-no-route": "Drops it and sends an ICMP destination unreachable to the sender",
      "iprt-equal-cost": "Installs both and load-balances (ECMP)",
      "iprt-ip-route-parts": "The static route is removed from the routing table",
    };
    expect(IPROUTE_BANK.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of IPROUTE_BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
    for (const q of IPROUTE_BANK) expect(grade(q, correctResponse(q)), q.id).toBe(true);
  });

  it("are registered", () => {
    for (const g of IPROUTE_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("route-select answer is re-solved from the table printed in the prompt", () => {
    for (const s of seeds) {
      const q = routeSelectGen.generate(s) as McqQuestion;
      const lines = q.prompt.split("\n\n")[1].split("\n");
      const dest = /for ([\d.]+)\?/.exec(q.prompt)![1];
      const routes = lines.map((l) => {
        const m = /^(\S+)\s+([\d./]+) \[(\d+)\/(\d+)\] via ([\d.]+)$/.exec(l)!;
        const src = ({ S: "static", R: "rip", D: "eigrp", O: "ospf" } as const)[m[1] as "S"];
        return route(m[2], src, Number(m[4]), { ad: Number(m[3]), nextHop: m[5] });
      });
      const best = selectRoute(routes, dest)!;
      expect(q.choices[q.answer]).toBe(`${best.prefix.prefix === 0 ? "0.0.0.0" : lines.find((l) => l.includes(best.nextHop!))!.split(/\s+/)[1]} via ${best.nextHop}`);
    }
  });

  it("ad-compare and floating-ad answers follow the AD table", () => {
    for (const s of seeds) {
      const q = adCompareGen.generate(s) as McqQuestion;
      const m = /^(\w+) and (\w+) both/.exec(q.prompt)!;
      const ad = (n: string) => ADMIN_DISTANCE[({ static: "static", EIGRP: "eigrp", OSPF: "ospf", RIP: "rip", "IS-IS": "isis", eBGP: "ebgp" } as const)[n as "static"]];
      expect(q.choices[q.answer]).toBe(ad(m[1]) <= ad(m[2]) ? m[1] : m[2]);
      const f = floatingAdGen.generate(s) as McqQuestion;
      const name = /^([\w-]+) is the primary/.exec(f.prompt)![1];
      expect(Number(f.choices[f.answer])).toBe(ad(name) + 1);
    }
  });
});
