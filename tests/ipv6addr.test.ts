import { describe, expect, it } from "vitest";
import { IPV6_BANK } from "@/content/questions/ipv6Bank";
import { IPV6_ADDR_GENERATORS, eui64Gen, ipv6TypeGen, subnetIdGen } from "@/content/questions/ipv6AddrGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion } from "@/game/engine/questions";
import { eui64Text, ipv6Type, linkLocalFromMac, slaacAddress, solicitedNode, subnet64, subnetCount64 } from "@/lib/net/ipv6addr";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 5);

describe("IPv6 address types", () => {
  it("classifies by prefix", () => {
    expect(ipv6Type("fe80::1")).toBe("link-local");
    expect(ipv6Type("febf::1")).toBe("link-local");
    expect(ipv6Type("fec0::1")).toBe("other");
    expect(ipv6Type("fd12:3456::1")).toBe("unique-local");
    expect(ipv6Type("fc00::1")).toBe("unique-local");
    expect(ipv6Type("ff02::1")).toBe("multicast");
    expect(ipv6Type("2001:db8::1")).toBe("global-unicast");
    expect(ipv6Type("3fff::1")).toBe("global-unicast");
    expect(ipv6Type("4000::1")).toBe("other");
    expect(ipv6Type("::1")).toBe("loopback");
    expect(ipv6Type("::")).toBe("unspecified");
  });
});

describe("EUI-64", () => {
  it("matches the Cisco/RFC 4291 worked example", () => {
    // RFC 4291 Appendix A: MAC 34-56-78-9A-BC-DE → 3656:78FF:FE9A:BCDE.
    expect(eui64Text("34:56:78:9A:BC:DE")).toBe("3656:78ff:fe9a:bcde");
    expect(linkLocalFromMac("00:1A:2B:3C:4D:5E")).toBe("fe80::21a:2bff:fe3c:4d5e");
    expect(slaacAddress("2001:db8:acad:1", "00:1A:2B:3C:4D:5E")).toBe("2001:db8:acad:1:21a:2bff:fe3c:4d5e");
  });
  it("flips the bit back for a locally administered MAC", () => {
    expect(eui64Text("02:00:00:00:00:01")).toBe("0:ff:fe00:1");
  });
  it("rejects malformed MACs", () => {
    expect(() => eui64Text("00:1A:2B")).toThrow();
  });
});

describe("solicited-node and subnetting", () => {
  it("keeps the low 24 bits (RFC 4291 §2.7.1: 4037::01:800:200E:8C6C → FF02::1:FF0E:8C6C)", () => {
    expect(solicitedNode("4037::1:800:200e:8c6c")).toBe("ff02::1:ff0e:8c6c");
    expect(solicitedNode("2001:db8::1")).toBe("ff02::1:ff00:1");
  });
  it("carves /64 subnets from a /48", () => {
    expect(subnet64("2001:db8:acad", 0)).toBe("2001:db8:acad::/64");
    expect(subnet64("2001:db8:acad", 1)).toBe("2001:db8:acad:1::/64");
    expect(subnet64("2001:db8:acad", 255)).toBe("2001:db8:acad:ff::/64");
    expect(subnet64("2001:db8:acad", 65535)).toBe("2001:db8:acad:ffff::/64");
    expect(() => subnet64("2001:db8:acad", 65536)).toThrow();
  });
  it("counts /64 subnets", () => {
    expect(subnetCount64(48)).toBe(65536);
    expect(subnetCount64(56)).toBe(256);
    expect(subnetCount64(64)).toBe(1);
  });
});

describe("IPv6 cards and generators", () => {
  it("pin every card answer", () => {
    const expected: Record<string, string> = {
      "v6-gua-range": "2000::/3",
      "v6-link-local": "Only on the local link; routers never forward it",
      "v6-ula": "Unique local, fc00::/7 (in practice fd00::/8)",
      "v6-no-broadcast": "Multicast, such as ff02::1 (all nodes)",
      "v6-eui64": "Insert FFFE in the middle of the MAC and flip the 7th bit of the first byte",
      "v6-slaac": "The /64 prefix from a Router Advertisement; the host builds the 64-bit interface ID itself",
      "v6-dhcpv6-modes": "The host forms its address by SLAAC and DHCPv6 only supplies extra options such as DNS servers",
      "v6-ndp-messages": "Router Solicitation, Router Advertisement, Neighbor Solicitation, Neighbor Advertisement",
      "v6-solicited-node": "The solicited-node multicast address ff02::1:ffXX:XXXX built from the last 24 bits of the target address",
      "v6-dad": "Sending a Neighbor Solicitation for the host's own tentative address; any reply means the address is in use",
      "v6-slaac-steps":
        "1. Build a link-local address (fe80::/64 + interface ID)  2. Run DAD on that link-local address  3. Send a Router Solicitation to ff02::2  4. Receive a Router Advertisement with the prefix  5. Build a global address from the prefix and run DAD again",
      "v6-routing-enable": "ipv6 unicast-routing",
      "v6-static-route": "fe80:: addresses repeat on every link, so the router cannot tell which link the next hop is on",
      "v6-ospfv3": "It runs per link, uses link-local addresses for neighbours, and still needs a 32-bit router ID",
      "v6-dualstack": "A host that runs IPv4 and IPv6 at the same time on its interface",
      "v6-transition": "Tunnelling (for example 6in4 or GRE)",
    };
    expect(IPV6_BANK.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of IPV6_BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
    for (const q of IPV6_BANK) expect(grade(q, correctResponse(q)), q.id).toBe(true);
  });

  it("are registered", () => {
    for (const g of IPV6_ADDR_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("EUI-64 answer is re-solved from the MAC in the prompt, with distinct choices", () => {
    for (const s of seeds) {
      const q = eui64Gen.generate(s) as McqQuestion;
      const mac = /address ([0-9A-F:]{17})\./.exec(q.prompt)![1];
      expect(q.choices[q.answer]).toBe(linkLocalFromMac(mac));
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it("address-type answer is re-solved from the address in the prompt", () => {
    const label = { "link-local": "Link-local", "unique-local": "Unique local", multicast: "Multicast", "global-unicast": "Global unicast", loopback: "Loopback", unspecified: "Unspecified" } as Record<string, string>;
    for (const s of seeds) {
      const q = ipv6TypeGen.generate(s) as McqQuestion;
      const addr = /is ([0-9a-f:]+)\?/.exec(q.prompt)![1];
      expect(q.choices[q.answer]).toBe(label[ipv6Type(addr)]);
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it("subnet answer is re-solved from the prefix and number in the prompt", () => {
    for (const s of seeds) {
      const q = subnetIdGen.generate(s) as McqQuestion;
      const [, p, n] = /own ([0-9a-f:]+?)::\/48.*number (\d+) /.exec(q.prompt)!;
      expect(q.choices[q.answer]).toBe(subnet64(p, Number(n)));
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });
});
