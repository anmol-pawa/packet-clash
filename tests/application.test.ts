import { describe, expect, it } from "vitest";
import { DHCP_DORA, accessDelay, cacheAverageDelay, dhcpTimers, dnsCost, linkUtilization, pageLoadRtts } from "@/lib/net/application";
import { APPLICATION_GENERATORS, accessLinkGen, cacheGen, dhcpGen, dnsGen, httpLoadGen } from "@/content/questions/applicationGenerators";
import { GENERATORS } from "@/content/questions/generators";
import type { NumericQuestion } from "@/game/engine/questions";

describe("DNS resolution cost", () => {
  it("K&R Figs. 2.18/2.19: a cold lookup is 8 messages either way", () => {
    expect(dnsCost("iterative", "none").messages).toBe(8);
    expect(dnsCost("recursive", "none").messages).toBe(8);
  });
  it("the local server sends 3 queries iteratively, 1 recursively", () => {
    expect(dnsCost("iterative", "none").localQueries).toBe(3);
    expect(dnsCost("recursive", "none").localQueries).toBe(1);
  });
  it("caches shorten the walk; a cached answer needs no servers", () => {
    expect(dnsCost("iterative", "tld").serversContacted).toBe(2);
    expect(dnsCost("iterative", "auth").serversContacted).toBe(1);
    expect(dnsCost("iterative", "answer")).toEqual({ serversContacted: 0, localQueries: 0, messages: 2 });
  });
  it("an extra delegation adds a server (K&R's dns.cs.nyu.edu example)", () => {
    expect(dnsCost("iterative", "none", 1).serversContacted).toBe(4);
    expect(dnsCost("iterative", "auth", 1).serversContacted).toBe(2);
  });
});

describe("HTTP page-load time", () => {
  it("base page + 10 objects: non-persistent 22 RTT, persistent 12, pipelined 3", () => {
    expect(pageLoadRtts("non-persistent", 10)).toBe(22);
    expect(pageLoadRtts("persistent", 10)).toBe(12);
    expect(pageLoadRtts("pipelined", 10)).toBe(3);
  });
  it("parallel connections divide the embedded objects: 10 objects over 5 → 2 rounds", () => {
    expect(pageLoadRtts("non-persistent", 10, 5)).toBe(6);
    expect(pageLoadRtts("non-persistent", 7, 5)).toBe(6);
  });
  it("a page with no objects is one handshake and one request", () => {
    for (const m of ["non-persistent", "persistent", "pipelined"] as const) expect(pageLoadRtts(m, 0)).toBe(2);
  });
});

describe("web cache and access link", () => {
  it("K&R §2.2.5: 15 req/s × 1 Mbit over 15 Mbps = 1.0 utilisation; a 40% hit rate drops it to 0.6", () => {
    expect(linkUtilization(15, 1e6, 15e6)).toBeCloseTo(1);
    expect(linkUtilization(15, 1e6, 15e6) * (1 - 0.4)).toBeCloseTo(0.6);
  });
  it("K&R §2.2.5: 100 kB-ish objects, 15 req/s on a 15 Mbps link → utilisation 0.8 → Δ/(1−Δβ)", () => {
    const bits = 8e5; // 100 kB
    expect(linkUtilization(15, bits, 15e6)).toBeCloseTo(0.8);
    // Δ = 8e5 / 15e6 s, β = 15/s, so Δβ = 0.8 and the delay is Δ / 0.2 = 0.2667 s
    expect(accessDelay(bits, 15e6, 15)).toBeCloseTo(0.8 / 15 / 0.2, 6);
  });
  it("the average with a 60% hit rate: 0.6 × 10 + 0.4 × 200 = 86 ms", () => {
    expect(cacheAverageDelay(0.6, 10, 200)).toBeCloseTo(86);
  });
});

describe("DHCP", () => {
  it("T1 = 50% and T2 = 87.5% of the lease (RFC 2131)", () => {
    expect(dhcpTimers(86400)).toEqual({ t1: 43200, t2: 75600 });
  });
  it("DORA order", () => {
    expect(DHCP_DORA.map((m) => m[0]).join("")).toBe("DORA");
  });
});

describe("application generators", () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

  it("are registered on gym 6's chapter", () => {
    expect(APPLICATION_GENERATORS).toHaveLength(5);
    for (const g of APPLICATION_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("application");
    }
  });

  it("DNS answers are recomputed from the id", () => {
    for (const s of SEEDS) {
      const q = dnsGen.generate(s) as NumericQuestion;
      const [, mode, cache, extra, ask] = q.id.split(":");
      const servers = { none: 3, tld: 2, auth: 1, answer: 0 }[cache]! + (cache === "answer" ? 0 : Number(extra));
      const total = 2 * (servers + 1);
      const local = servers === 0 ? 0 : mode === "iterative" ? servers : 1;
      expect(q.answer).toBe(ask === "local" ? local : total);
    }
  });

  it("HTTP answers are recomputed from the id", () => {
    for (const s of SEEDS) {
      const q = httpLoadGen.generate(s) as NumericQuestion;
      const [, mode, objects, parallel, rtt] = q.id.split(":");
      const n = Number(objects);
      const rtts = mode === "non-persistent" ? 2 + 2 * Math.ceil(n / Number(parallel)) : mode === "persistent" ? 2 + n : 3;
      expect(q.answer).toBe(rtts * Number(rtt));
      expect(q.prompt).toContain(`${n} small embedded objects`);
    }
  });

  it("cache answers are the weighted average", () => {
    for (const s of SEEDS) {
      const q = cacheGen.generate(s) as NumericQuestion;
      const [, hit, c, o] = q.id.split(":");
      expect(q.answer).toBeCloseTo(Number(hit) * Number(c) + (1 - Number(hit)) * Number(o), 6);
    }
  });

  it("access-link answers match rate × size ÷ link, and stay below 1", () => {
    for (const s of SEEDS) {
      const q = accessLinkGen.generate(s) as NumericQuestion;
      const [, mbps, kb, rate, hit, when] = q.id.split(":");
      const u = (Number(rate) * Number(kb) * 8000) / (Number(mbps) * 1e6);
      expect(u).toBeLessThan(1);
      expect(q.answer).toBeCloseTo(when === "after" ? (1 - Number(hit)) * u : u, 9);
    }
  });

  it("DHCP answers are 50% / 87.5% of the lease in minutes", () => {
    for (const s of SEEDS) {
      const q = dhcpGen.generate(s) as NumericQuestion;
      const [, hours, which] = q.id.split(":");
      expect(q.answer).toBe(Number(hours) * 60 * (which === "t1" ? 0.5 : 0.875));
    }
  });
});
