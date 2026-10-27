import { describe, expect, it } from "vitest";
import { LAB_BUILDERS, labDeck } from "@/content/lab/scenarios";
import { grade } from "@/game/engine/questions";
import { evaluateAcl, parseAclLine } from "@/lib/net/acl";
import { parseIp } from "@/lib/net/ipv4";
import { diagnoseHost, etherChannelOutcome, parseVlanList } from "@/lib/net/lab";
import { etherChannelForms, type EtherChannelMode } from "@/lib/net/stp";
import { selectRoute, parseAdMetric } from "@/lib/net/iproute";
import { route } from "@/lib/net/iproute";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 5);

describe("lab checkers", () => {
  it("diagnoses host settings in order", () => {
    expect(diagnoseHost({ ip: "192.168.1.255", prefix: 24, gateway: "192.168.1.1" }, "192.168.1.1")).toBe("invalid-address");
    expect(diagnoseHost({ ip: "192.168.1.0", prefix: 24, gateway: "192.168.1.1" }, "192.168.1.1")).toBe("invalid-address");
    expect(diagnoseHost({ ip: "192.168.1.10", prefix: 25, gateway: "192.168.1.129" }, "192.168.1.129")).toBe("gateway-off-subnet");
    expect(diagnoseHost({ ip: "192.168.1.10", prefix: 24, gateway: "192.168.1.2" }, "192.168.1.1")).toBe("gateway-not-router");
    expect(diagnoseHost({ ip: "192.168.1.10", prefix: 24, gateway: "192.168.1.1" }, "192.168.1.1")).toBe("ok");
    expect(diagnoseHost({ ip: "10.0.0.0", prefix: 31, gateway: "10.0.0.1" }, "10.0.0.1")).toBe("ok");
  });

  it("expands IOS VLAN lists", () => {
    expect(parseVlanList("10-12,20")).toEqual([10, 11, 12, 20]);
    expect(parseVlanList("1,5, 7 - 8")).toEqual([1, 5, 7, 8]);
    expect(() => parseVlanList("9-3")).toThrow();
    expect(() => parseVlanList("a")).toThrow();
  });

  it("agrees with the EtherChannel rule table for every pair", () => {
    const modes: EtherChannelMode[] = ["active", "passive", "desirable", "auto", "on"];
    for (const a of modes) for (const b of modes) expect(etherChannelOutcome(a, b) === "forms").toBe(etherChannelForms(a, b));
    expect(etherChannelOutcome("active", "desirable")).toBe("protocol-mismatch");
    expect(etherChannelOutcome("passive", "passive")).toBe("nobody-initiates");
    expect(etherChannelOutcome("auto", "auto")).toBe("nobody-initiates");
    expect(etherChannelOutcome("on", "active")).toBe("on-needs-on");
    expect(etherChannelOutcome("on", "on")).toBe("forms");
  });
});

describe("lab scenarios", () => {
  it("has at least 12 scenario kinds with unique ids", () => {
    expect(LAB_BUILDERS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(LAB_BUILDERS.map((b) => b.id)).size).toBe(LAB_BUILDERS.length);
  });

  it("builds a well-formed, gradable question from every seed", () => {
    for (const b of LAB_BUILDERS)
      for (const seed of seeds) {
        const s = b.build(seed);
        const q = s.question;
        expect(s.exhibits.length).toBeGreaterThan(0);
        for (const e of s.exhibits) expect(e.text.trim().length).toBeGreaterThan(0);
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(4);
        expect(grade(q, { kind: "mcq", choice: q.answer })).toBe(true);
        for (let c = 0; c < 4; c++) if (c !== q.answer) expect(grade(q, { kind: "mcq", choice: c })).toBe(false);
        expect(q.explain.length).toBeGreaterThan(20);
        expect(b.build(seed)).toEqual(s);
      }
  });

  it("re-solves the ACL scenarios from the printed access list", () => {
    for (const id of ["acl-verdict", "acl-forward"]) {
      const b = LAB_BUILDERS.find((x) => x.id === id)!;
      for (const seed of seeds) {
        const s = b.build(seed);
        const lines = [...s.exhibits[0].text.matchAll(/^\s+(\d+) (permit|deny .*|permit .*)$/gm)].map((m) => ({ n: Number(m[1]), text: m[0].trim().replace(/^\d+ /, "") }));
        const m = /A (\w+) from ([\d.]+) to ([\d.]+)(?: port (\d+))?/.exec(s.question.prompt)!;
        const v = evaluateAcl(lines.map((l) => parseAclLine(l.text)), {
          protocol: m[1].toLowerCase() as "tcp",
          src: parseIp(m[2]),
          dst: parseIp(m[3]),
          dstPort: m[4] ? Number(m[4]) : undefined,
        });
        const right = s.question.choices[s.question.answer].toLowerCase();
        if (v.line === null) expect(right).toContain("implicit deny");
        else {
          expect(right).toContain(`line ${lines[v.line].n}`);
          expect(right).toContain(v.action === "permit" ? (id === "acl-forward" ? "forwarded" : "permitted") : id === "acl-forward" ? "dropped" : "denied");
        }
      }
    }
  });

  it("re-solves the next-hop scenario from the printed routing table", () => {
    const b = LAB_BUILDERS.find((x) => x.id === "route-nexthop")!;
    for (const seed of seeds) {
      const s = b.build(seed);
      const routes = s.exhibits[0].text.split("\n").map((line) => {
        const m = /(\S+\/\d+) \[(\d+)\/(\d+)\] via (\S+)/.exec(line)!;
        const am = parseAdMetric(line)!;
        return { ...route(m[1], "static", am.metric, { ad: am.ad, nextHop: m[4] }) };
      });
      const dest = /packet for (\d+\.\d+\.\d+\.\d+)/.exec(s.question.prompt)![1];
      expect(s.question.choices[s.question.answer]).toBe(selectRoute(routes, dest)!.nextHop);
    }
  });

  it("builds a deck with one scenario per kind, reproducible by seed", () => {
    const d = labDeck(42);
    expect(d).toHaveLength(LAB_BUILDERS.length);
    expect(new Set(d.map((s) => s.title)).size).toBe(LAB_BUILDERS.length);
    expect(labDeck(42).map((s) => s.id)).toEqual(d.map((s) => s.id));
  });
});

describe("lab scenario textbook cases", () => {
  it("STP: root is the lowest priority", () => {
    const b = LAB_BUILDERS.find((x) => x.id === "stp-root")!;
    for (const seed of seeds) {
      const s = b.build(seed);
      const rows = s.exhibits.map((e, i) => ({ name: `SW${i + 1}`, prio: Number(/Priority\s+(\d+)/.exec(e.text)![1]), mac: /Address\s+(\S+)/.exec(e.text)![1] }));
      rows.sort((x, y) => x.prio - y.prio || x.mac.localeCompare(y.mac));
      expect(s.question.choices[s.question.answer]).toBe(rows[0].name);
    }
  });

  it("OSPF cost: 100 Mbps reference, 10/100/1000 Mbps links", () => {
    const b = LAB_BUILDERS.find((x) => x.id === "ospf-cost")!;
    for (const seed of seeds) {
      const s = b.build(seed);
      const ref = /reference-bandwidth (\d+)/.exec(s.exhibits[0].text)?.[1] ?? "100";
      const mbps = [...s.exhibits[1].text.matchAll(/(\d+) Mbps/g)].map((m) => Number(m[1]));
      const total = mbps.reduce((a, m) => a + Math.max(1, Math.floor(Number(ref) / m)), 0);
      expect(s.question.choices[s.question.answer]).toBe(String(total));
    }
  });

  it("DHCP pool: /24 minus excluded range", () => {
    const b = LAB_BUILDERS.find((x) => x.id === "dhcp-pool")!;
    for (const seed of seeds) {
      const s = b.build(seed);
      const m = /excluded-address ([\d.]+) ([\d.]+)/.exec(s.exhibits[0].text)!;
      const mask = /network [\d.]+ ([\d.]+)/.exec(s.exhibits[0].text)![1];
      const hosts = 2 ** (32 - mask.split(".").reduce((n, o) => n + Number(o).toString(2).replaceAll("0", "").length, 0)) - 2;
      expect(s.question.choices[s.question.answer]).toBe(String(hosts - (parseIp(m[2]) - parseIp(m[1]) + 1)));
    }
  });
});
