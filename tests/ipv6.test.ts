import { describe, expect, it } from "vitest";
import { compressIpv6, expandIpv6, parseIpv6 } from "@/lib/net/ipv6";
import { IPV6_GENERATORS, ipv6CompressGen } from "@/content/questions/ipv6Generators";
import { GENERATORS } from "@/content/questions/generators";
import type { McqQuestion } from "@/game/engine/questions";

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe("IPv6 text forms", () => {
  it("expands shorthand to eight groups", () => {
    expect(expandIpv6("::1")).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
    expect(expandIpv6("fe80::1")).toBe("fe80:0000:0000:0000:0000:0000:0000:0001");
    expect(expandIpv6("2001:DB8::")).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
    expect(parseIpv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("rejects malformed addresses", () => {
    for (const s of ["1::2::3", "1:2:3", "1:2:3:4:5:6:7:8:9", "12345::", "g::1", "1:2:3:4:5:6:7::8"]) {
      expect(() => parseIpv6(s), s).toThrow();
    }
  });

  it("compresses per RFC 5952", () => {
    expect(compressIpv6("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe("2001:db8::1");
    // RFC 5952 §4.2.3: the leftmost of equal-length runs is compressed.
    expect(compressIpv6("2001:db8:0:0:1:0:0:1")).toBe("2001:db8::1:0:0:1");
    // §4.2.2: a lone zero group is not shortened to "::".
    expect(compressIpv6("2001:db8:0:1:1:1:1:1")).toBe("2001:db8:0:1:1:1:1:1");
    expect(compressIpv6("0:0:0:0:0:0:0:0")).toBe("::");
    expect(compressIpv6("0:0:0:0:0:0:0:1")).toBe("::1");
    expect(compressIpv6("fe80:0:0:0:0:0:0:0")).toBe("fe80::");
  });

  it("round-trips", () => {
    for (const s of ["::", "::1", "fe80::1", "2001:db8::1:0:0:1", "1:2:3:4:5:6:7:8"]) {
      expect(compressIpv6(expandIpv6(s))).toBe(compressIpv6(s));
      expect(parseIpv6(compressIpv6(s))).toEqual(parseIpv6(s));
    }
  });
});

describe("IPv6 generator", () => {
  it("is on gym 3's chapter and in the main list", () => {
    for (const g of IPV6_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("network");
    }
  });

  it("asks for the shortest form, and the answer is the unique valid compression", () => {
    for (const seed of SEEDS) {
      const q = ipv6CompressGen.generate(seed) as McqQuestion;
      const full = q.id.slice("gen-ipv6-compress:".length);
      const right = q.choices[q.answer];
      expect(right).toBe(compressIpv6(full));
      expect(parseIpv6(right)).toEqual(parseIpv6(full));
      expect(right.split("::").length).toBe(2);
      // Every distractor is either not the same address, not canonical, or invalid.
      q.choices.forEach((c, i) => {
        if (i === q.answer) return;
        let same = false;
        try {
          same = parseIpv6(c).join() === parseIpv6(full).join();
        } catch {
          same = false;
        }
        expect(same && c === compressIpv6(c), c).toBe(false);
      });
      expect(ipv6CompressGen.generate(seed)).toEqual(q);
    }
  });
});
