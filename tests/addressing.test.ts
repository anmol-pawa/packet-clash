import { describe, expect, it } from "vitest";
import { aggregate, aggregateIsExact, fragment, longestPrefixMatch, prefixForHosts, splitSubnets, vlsmAllocate } from "@/lib/net/addressing";
import { ADDRESS_GENERATORS, aggregateGen, fragmentGen, lpmGen, nthSubnetGen, subnetCountGen, vlsmGen } from "@/content/questions/addressGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { blockSize, broadcastOf, formatCidr, formatIp, overlaps, parseCidr, parseIp, usableHosts } from "@/lib/net/ipv4";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const field = (id: string, i: number) => id.split(":")[i];

describe("addressing solvers", () => {
  it("splits a block (Forouzan: 14.24.74.0/24 into 4 → /26)", () => {
    expect(splitSubnets(parseCidr("14.24.74.0/24"), 26).map(formatCidr)).toEqual(["14.24.74.0/26", "14.24.74.64/26", "14.24.74.128/26", "14.24.74.192/26"]);
    expect(() => splitSubnets(parseCidr("10.0.0.0/24"), 20)).toThrow();
  });

  it("sizes subnets for host counts", () => {
    expect([prefixForHosts(2), prefixForHosts(30), prefixForHosts(31), prefixForHosts(100), prefixForHosts(254), prefixForHosts(255)]).toEqual([30, 27, 26, 25, 24, 23]);
  });

  it("allocates VLSM largest-first without overlap (hand-derived)", () => {
    // 192.168.1.0/24 for 100, 50, 25 hosts and a 2-host link.
    const a = vlsmAllocate(parseCidr("192.168.1.0/24"), [25, 100, 50, 2])!;
    expect(a.map((x) => formatCidr(x.subnet))).toEqual(["192.168.1.192/27", "192.168.1.0/25", "192.168.1.128/26", "192.168.1.224/30"]);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(overlaps(a[i].subnet, a[j].subnet)).toBe(false);
    expect(vlsmAllocate(parseCidr("192.168.1.0/24"), [200, 100])).toBeNull();
  });

  it("aggregates routes (Kurose & Ross-style contiguous /24s)", () => {
    const four = splitSubnets(parseCidr("200.23.16.0/22"), 24);
    expect(formatCidr(aggregate(four))).toBe("200.23.16.0/22");
    expect(aggregateIsExact(four)).toBe(true);
    // 192.168.0.0/24 + 192.168.3.0/24 span /22 but leave a hole.
    const gap = [parseCidr("192.168.0.0/24"), parseCidr("192.168.3.0/24")];
    expect(formatCidr(aggregate(gap))).toBe("192.168.0.0/22");
    expect(aggregateIsExact(gap)).toBe(false);
  });

  it("matches the longest prefix (Kurose & Ross §4.3 example)", () => {
    const table = [
      { prefix: parseCidr("224.0.0.0/8"), nextHop: "0" },
      { prefix: parseCidr("224.0.0.0/18"), nextHop: "1" },
      { prefix: parseCidr("224.64.0.0/10"), nextHop: "2" },
    ];
    expect(longestPrefixMatch(table, parseIp("224.0.5.1"))?.nextHop).toBe("1");
    expect(longestPrefixMatch(table, parseIp("224.70.0.1"))?.nextHop).toBe("2");
    expect(longestPrefixMatch(table, parseIp("224.200.0.1"))?.nextHop).toBe("0");
    expect(longestPrefixMatch(table, parseIp("10.0.0.1"))).toBeUndefined();
  });

  it("fragments (Kurose & Ross: 4000-byte datagram, MTU 1500 → 3 fragments)", () => {
    expect(fragment(4000, 1500)).toEqual([
      { totalLength: 1500, offset: 0, more: true },
      { totalLength: 1500, offset: 185, more: true },
      { totalLength: 1040, offset: 370, more: false },
    ]);
    // Data bytes are conserved.
    const f = fragment(5000, 576);
    expect(f.reduce((n, x) => n + x.totalLength - 20, 0)).toBe(4980);
    expect(f.slice(0, -1).every((x) => (x.totalLength - 20) % 8 === 0 && x.more)).toBe(true);
  });
});

describe("addressing generators", () => {
  it("are on gym 3's chapter and in the main list", () => {
    for (const g of ADDRESS_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("network");
    }
  });

  it("count and place subnets", () => {
    for (const seed of SEEDS) {
      const c = subnetCountGen.generate(seed) as NumericQuestion;
      expect(c.answer).toBe(2 ** (Number(field(c.id, 2)) - parseCidr(field(c.id, 1)).prefix));
      const q = nthSubnetGen.generate(seed) as McqQuestion;
      const [ip, len] = q.id.split(":")[1].split("/");
      const to = Number(field(q.id, 2));
      const k = Number(field(q.id, 3));
      const start = parseIp(ip) + (k - 1) * blockSize(to);
      expect(answerText(q)).toBe(formatIp(start + blockSize(to) - 1));
      expect(Number(len)).toBeLessThan(to);
    }
  });

  it("allocate VLSM subnets that fit and don't overlap", () => {
    for (const seed of SEEDS) {
      const q = vlsmGen.generate(seed) as McqQuestion;
      const sizes = field(q.id, 2).split(",").map(Number);
      const target = Number(field(q.id, 3));
      const got = parseCidr(answerText(q));
      expect(usableHosts(got.prefix)).toBeGreaterThanOrEqual(sizes[target]);
      expect(usableHosts(got.prefix + 1)).toBeLessThan(sizes[target]);
      expect(got.network & ((blockSize(got.prefix) - 1) | 0)).toBe(0);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("summarise contiguous blocks exactly", () => {
    for (const seed of SEEDS) {
      const q = aggregateGen.generate(seed) as McqQuestion;
      const first = parseCidr(field(q.id, 1));
      const count = Number(field(q.id, 2));
      const sup = parseCidr(answerText(q));
      expect(sup.network).toBe(first.network);
      expect(blockSize(sup.prefix)).toBe(count * blockSize(first.prefix));
      expect(broadcastOf(sup)).toBe(first.network + count * blockSize(first.prefix) - 1);
    }
  });

  it("route by longest prefix", () => {
    for (const seed of SEEDS) {
      const q = lpmGen.generate(seed) as McqQuestion;
      const [, outer, mid, inner, ip] = q.id.split(":");
      const o = parseCidr(outer);
      const table = [
        { prefix: { network: 0, prefix: 0 }, nextHop: "R0 (default)" },
        { prefix: o, nextHop: "R1" },
        { prefix: { network: parseIp(mid), prefix: 20 }, nextHop: "R2" },
        { prefix: { network: parseIp(inner), prefix: 24 }, nextHop: "R3" },
      ];
      expect(answerText(q)).toBe(longestPrefixMatch(table, parseIp(ip))!.nextHop);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("count fragments and offsets", () => {
    for (const seed of SEEDS) {
      const q = fragmentGen.generate(seed) as NumericQuestion;
      const [, total, mtu, what] = q.id.split(":");
      const data = Number(total) - 20;
      const per = Math.floor((Number(mtu) - 20) / 8) * 8;
      if (what === "count") expect(q.answer).toBe(Math.ceil(data / per));
      else expect(q.answer * 8).toBe((Math.ceil(data / per) - 1) * per);
    }
  });
});
