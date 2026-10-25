import { describe, expect, it } from "vitest";
import { ACL_BANK } from "@/content/questions/aclBank";
import { ACL_GENERATORS, aclLineGen, aclVerdictGen, wildcardCountGen, wildcardGen } from "@/content/questions/aclGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import {
  aclKindOfNumber,
  evaluateAcl,
  formatAclLine,
  isContiguousWildcard,
  matchesAddr,
  parseAclLine,
  placement,
  prefixOfWildcard,
  wildcardMatchCount,
  wildcardOf,
} from "@/lib/net/acl";
import { formatIp, parseIp } from "@/lib/net/ipv4";

const seeds = Array.from({ length: 80 }, (_, i) => i * 6007 + 11);
const ip = parseIp;

describe("wildcard masks", () => {
  it("are the inverse of the subnet mask (Odom, CCNA 200-301 OCG)", () => {
    expect(formatIp(wildcardOf(24))).toBe("0.0.0.255");
    expect(formatIp(wildcardOf(26))).toBe("0.0.0.63");
    expect(formatIp(wildcardOf(20))).toBe("0.0.15.255");
    expect(formatIp(wildcardOf(0))).toBe("255.255.255.255");
    expect(formatIp(wildcardOf(32))).toBe("0.0.0.0");
  });

  it("know when they stand for a prefix", () => {
    expect(isContiguousWildcard(ip("0.0.15.255"))).toBe(true);
    expect(isContiguousWildcard(ip("0.0.16.255"))).toBe(false);
    expect(prefixOfWildcard(ip("0.0.0.255"))).toBe(24);
    expect(prefixOfWildcard(ip("0.0.0.0"))).toBe(32);
    expect(prefixOfWildcard(ip("255.255.255.255"))).toBe(0);
    expect(prefixOfWildcard(ip("0.0.254.255"))).toBeNull();
  });

  it("count the addresses they match, including odd patterns", () => {
    expect(wildcardMatchCount(ip("0.0.0.255"))).toBe(256);
    expect(wildcardMatchCount(ip("0.0.3.255"))).toBe(1024);
    // 0.0.254.255 matches odd or even third octets: 7 + 8 = 15 free bits.
    expect(wildcardMatchCount(ip("0.0.254.255"))).toBe(2 ** 15);
  });

  it("odd-or-even wildcards pick every other subnet", () => {
    const m = { addr: ip("10.1.1.0"), wildcard: ip("0.0.254.255") };
    expect(matchesAddr(m, ip("10.1.3.9"))).toBe(true);
    expect(matchesAddr(m, ip("10.1.2.9"))).toBe(false);
  });
});

describe("ACL parsing and evaluation", () => {
  it("round-trips lines through the formatter", () => {
    for (const line of [
      "permit 192.168.1.0 0.0.0.255",
      "deny host 10.1.1.1",
      "permit tcp 10.1.0.0 0.0.255.255 host 10.9.9.10 eq www",
      "deny udp any any range 1000 2000",
      "permit icmp any any",
      "deny ip any any",
    ]) {
      expect(formatAclLine(parseAclLine(line))).toBe(line);
    }
  });

  it("rejects malformed lines", () => {
    expect(() => parseAclLine("allow ip any any")).toThrow();
    expect(() => parseAclLine("permit icmp any any eq 80")).toThrow();
    expect(() => parseAclLine("permit tcp any any eq 70000")).toThrow();
  });

  it("host matches one address and the bits behind the wildcard are ignored", () => {
    const e = parseAclLine("permit 192.168.1.77 0.0.0.255");
    expect(matchesAddr(e.src, ip("192.168.1.200"))).toBe(true);
    expect(matchesAddr(e.src, ip("192.168.2.1"))).toBe(false);
  });

  it("first match wins and falls through to the implicit deny", () => {
    const acl = ["permit ip 10.1.0.0 0.0.255.255 any", "deny tcp host 10.1.1.5 any eq 23"].map(parseAclLine);
    const telnet = { protocol: "tcp" as const, src: ip("10.1.1.5"), dst: ip("8.8.8.8"), dstPort: 23 };
    expect(evaluateAcl(acl, telnet)).toEqual({ action: "permit", line: 0 });
    expect(evaluateAcl([acl[1], acl[0]], telnet)).toEqual({ action: "deny", line: 0 });
    expect(evaluateAcl(acl, { ...telnet, src: ip("172.16.0.1") })).toEqual({ action: "deny", line: null });
  });

  it("extended lines check protocol, destination and port; standard lines the source only", () => {
    const web = parseAclLine("permit tcp any host 10.9.9.10 eq www");
    const p = { protocol: "tcp" as const, src: ip("1.2.3.4"), dst: ip("10.9.9.10"), dstPort: 80 };
    expect(evaluateAcl([web], p).action).toBe("permit");
    expect(evaluateAcl([web], { ...p, dstPort: 443 }).action).toBe("deny");
    expect(evaluateAcl([web], { ...p, protocol: "udp" }).action).toBe("deny");
    expect(evaluateAcl([web], { ...p, dst: ip("10.9.9.11") }).action).toBe("deny");
    const std = parseAclLine("permit 1.2.3.0 0.0.0.255");
    expect(evaluateAcl([std], { protocol: "icmp", src: ip("1.2.3.99"), dst: ip("9.9.9.9") }).action).toBe("permit");
    const range = parseAclLine("permit tcp any any range 8000 8100");
    expect(evaluateAcl([range], { ...p, dstPort: 8100 }).action).toBe("permit");
    expect(evaluateAcl([range], { ...p, dstPort: 8101 }).action).toBe("deny");
    expect(evaluateAcl([parseAclLine("permit tcp any any gt 1023")], { ...p, dstPort: 1023 }).action).toBe("deny");
  });

  it("applies the numbering ranges and placement rule", () => {
    expect(aclKindOfNumber(10)).toBe("standard");
    expect(aclKindOfNumber(1350)).toBe("standard");
    expect(aclKindOfNumber(100)).toBe("extended");
    expect(aclKindOfNumber(2005)).toBe("extended");
    expect(aclKindOfNumber(300)).toBeNull();
    expect(placement("extended")).toBe("source");
    expect(placement("standard")).toBe("destination");
  });
});

describe("ACL bank and generators", () => {
  it("is all ccna-topic with unique ids", () => {
    expect(ACL_BANK.length).toBeGreaterThanOrEqual(14);
    expect(new Set(ACL_BANK.map((q) => q.id)).size).toBe(ACL_BANK.length);
    for (const q of ACL_BANK) expect(q.topic).toBe("ccna");
  });

  it("the /20 card's wildcard really spans 172.16.32.0 to 172.16.47.255", () => {
    const q = ACL_BANK.find((x) => x.id === "acl-block-subnet")!;
    const w = ip(answerText(q).split(" ")[1]);
    const m = { addr: ip("172.16.32.0"), wildcard: w };
    expect(matchesAddr(m, ip("172.16.47.255"))).toBe(true);
    expect(matchesAddr(m, ip("172.16.48.0"))).toBe(false);
    expect(wildcardMatchCount(w)).toBe(4096);
  });

  it("generators are registered, deterministic and answerable", () => {
    for (const g of ACL_GENERATORS) {
      expect(GENERATORS).toContain(g);
      for (const s of seeds) {
        const q = g.generate(s);
        expect(g.generate(s)).toEqual(q);
        expect(grade(q, correctResponse(q)), `${g.id} ${s}`).toBe(true);
      }
    }
  });

  it("wildcard questions invert the mask of the network in the prompt", () => {
    for (const s of seeds) {
      const q = wildcardGen.generate(s) as McqQuestion;
      const prefix = Number(q.id.split("/")[1]);
      expect(answerText(q)).toBe(formatIp(wildcardOf(prefix)));
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("wildcard counts are re-solved from the prompt", () => {
    for (const s of seeds) {
      const q = wildcardCountGen.generate(s) as NumericQuestion;
      const w = q.id.split(":")[2];
      expect(q.answer).toBe(wildcardMatchCount(ip(w)));
    }
  });

  it("verdict and line questions agree with the evaluator on the listed ACL", () => {
    for (const s of seeds) {
      for (const g of [aclVerdictGen, aclLineGen]) {
        const q = g.generate(s) as McqQuestion;
        const lines = q.prompt.split("\n").filter((l) => /^\d+ {2}/.test(l)).map((l) => l.replace(/^\d+ {2}/, ""));
        const m = q.id.match(/:(\d+\.\d+\.\d+\.\d+):(\d+\.\d+\.\d+\.\d+):(.+)$/)!;
        const flows: Record<string, { protocol: "tcp" | "udp" | "icmp"; dstPort?: number }> = {
          TCP_to_port_80: { protocol: "tcp", dstPort: 80 },
          TCP_to_port_23: { protocol: "tcp", dstPort: 23 },
          UDP_to_port_53: { protocol: "udp", dstPort: 53 },
          an_ICMP_echo: { protocol: "icmp" },
        };
        const v = evaluateAcl(lines.map(parseAclLine), { ...flows[m[3]], src: ip(m[1]), dst: ip(m[2]) });
        if (g === aclVerdictGen) expect(answerText(q)).toBe(v.action === "permit" ? "Permitted" : "Denied");
        else expect(answerText(q)).toBe(v.line === null ? "None: the implicit deny" : `Line ${v.line + 1}`);
      }
    }
  });

  it("both outcomes and the implicit deny occur", () => {
    const verdicts = new Set(seeds.map((s) => answerText(aclVerdictGen.generate(s))));
    expect(verdicts).toEqual(new Set(["Permitted", "Denied"]));
    expect(seeds.some((s) => answerText(aclLineGen.generate(s)).startsWith("None"))).toBe(true);
  });
});
