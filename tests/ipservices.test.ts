import { describe, expect, it } from "vitest";
import { IPSERVICES_BANK } from "@/content/questions/ipservicesBank";
import { IPSERVICES_GENERATORS, dscpGen, hsrpElectGen, hsrpMacGen, natPoolGen, natTermGen, syslogGen } from "@/content/questions/ipservicesGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { afDscp, csDscp, dynamicNatDenied, hsrpActive, hsrpAfterRecovery, hsrpVirtualMac, natEntry, natPoolSize, syslogSent, tosByte, vrrpVirtualMac } from "@/lib/net/ipservices";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 11);

describe("NAT", () => {
  it("names the four address terms", () => {
    const e = natEntry("192.168.1.10", 51000, "203.0.113.1", "93.184.216.34", 443);
    expect(e).toEqual({
      insideLocal: "192.168.1.10:51000",
      insideGlobal: "203.0.113.1:51000",
      outsideLocal: "93.184.216.34:443",
      outsideGlobal: "93.184.216.34:443",
    });
  });
  it("sizes pools and counts denied hosts", () => {
    expect(natPoolSize("198.51.100.10", "198.51.100.14")).toBe(5);
    expect(natPoolSize("198.51.100.255", "198.51.101.0")).toBe(2);
    expect(() => natPoolSize("10.0.0.5", "10.0.0.4")).toThrow();
    expect(dynamicNatDenied(3, 4)).toBe(1);
    expect(dynamicNatDenied(5, 2)).toBe(0);
  });
});

describe("syslog and QoS values", () => {
  it("applies the severity threshold", () => {
    expect(syslogSent(4, 0)).toBe(true);
    expect(syslogSent(4, 4)).toBe(true);
    expect(syslogSent(4, 5)).toBe(false);
    expect(syslogSent(6, 7)).toBe(false);
  });
  it("computes DSCP (RFC 2597/3246 values)", () => {
    expect(afDscp(1, 1)).toBe(10);
    expect(afDscp(2, 1)).toBe(18);
    expect(afDscp(3, 1)).toBe(26);
    expect(afDscp(4, 1)).toBe(34);
    expect(afDscp(4, 3)).toBe(38);
    expect(csDscp(3)).toBe(24);
    expect(tosByte(46)).toBe(0xb8);
    expect(() => afDscp(5, 1)).toThrow();
  });
});

describe("FHRP", () => {
  const r = (name: string, priority: number, ip: string) => ({ name, priority, ip });
  it("elects by priority, then highest IP", () => {
    expect(hsrpActive([r("A", 100, "10.0.0.2"), r("B", 100, "10.0.0.3")]).name).toBe("B");
    expect(hsrpActive([r("A", 110, "10.0.0.2"), r("B", 100, "10.0.0.3")]).name).toBe("A");
    expect(hsrpActive([r("A", 100, "10.0.0.9"), r("B", 100, "10.0.0.10")]).name).toBe("B");
  });
  it("pre-empts only when configured", () => {
    const cur = r("R2", 100, "10.0.0.3");
    const back = r("R1", 110, "10.0.0.2");
    expect(hsrpAfterRecovery(cur, back, false).name).toBe("R2");
    expect(hsrpAfterRecovery(cur, back, true).name).toBe("R1");
  });
  it("builds virtual MACs", () => {
    expect(hsrpVirtualMac(1, 1)).toBe("0000.0c07.ac01");
    expect(hsrpVirtualMac(10, 1)).toBe("0000.0c07.ac0a");
    expect(hsrpVirtualMac(255, 1)).toBe("0000.0c07.acff");
    expect(hsrpVirtualMac(1, 2)).toBe("0000.0c9f.f001");
    expect(hsrpVirtualMac(4095, 2)).toBe("0000.0c9f.ffff");
    expect(vrrpVirtualMac(1)).toBe("0000.5e00.0101");
    expect(() => hsrpVirtualMac(256, 1)).toThrow();
  });
});

describe("IP services cards and generators", () => {
  it("pin every card answer", () => {
    const expected: Record<string, string> = {
      "nat-types": "PAT (NAT overload)",
      "nat-inside-local": "The private address configured on the inside host, as seen on the inside network",
      "nat-inside-global": "Inside global",
      "nat-overload": "ip nat inside source list 1 interface GigabitEthernet0/1 overload",
      "nat-interfaces": "`ip nat inside` on the LAN-facing interface and `ip nat outside` on the Internet-facing one",
      "nat-pool-exhaust": "Three hosts are translated and the fourth is dropped until an entry times out",
      "ntp-stratum": "3",
      "ntp-port": "UDP 123",
      "dhcp-relay": "It forwards the clients' broadcast DHCP messages to the server as unicast",
      "dhcp-giaddr": "From the giaddr field the relay agent fills in",
      "dns-client": "ip name-server 8.8.8.8",
      "snmp-versions": "SNMPv3",
      "snmp-ports": "Agent listens on 161 for polls; manager listens on 162 for traps",
      "snmp-mib": "The tree of managed objects on a device, each identified by an object ID",
      "syslog-levels": "Warning",
      "syslog-trap": "Levels 0 to 4 (Emergency through Warning)",
      "qos-marking": "DSCP in the IP header (6 bits); CoS in the 802.1Q tag (3 bits)",
      "qos-ef": "EF (Expedited Forwarding, DSCP 46)",
      "qos-af": "Class 3 (queue), drop precedence 1; DSCP = 8×3 + 2×1 = 26",
      "qos-police-shape": "Policing drops or re-marks excess traffic; shaping buffers and delays it",
      "fhrp-purpose": "Hosts keep a working default gateway when one router fails",
      "fhrp-which": "HSRP and GLBP are Cisco proprietary; VRRP is an open standard",
      "hsrp-election": "The one with the higher interface IP address",
      "hsrp-preempt": "R2, until it fails or R1 is configured with preempt",
      "hsrp-vmac": "0000.0c07.ac0a",
      "hsrp-multicast": "224.0.0.102",
      "glbp-roles": "The active virtual gateway (AVG)",
    };
    expect(IPSERVICES_BANK.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of IPSERVICES_BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
    for (const q of IPSERVICES_BANK) {
      expect(grade(q, correctResponse(q)), q.id).toBe(true);
      expect(new Set((q as McqQuestion).choices).size, q.id).toBe(4);
    }
  });

  it("are registered", () => {
    for (const g of IPSERVICES_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("NAT term answer is re-solved from the prompt", () => {
    for (const s of seeds) {
      const q = natTermGen.generate(s) as McqQuestion;
      const m = /host ([\d.]+) sends from port (\d+) to the server ([\d.]+):(\d+)\. .* address ([\d.]+) and .* which entry is the (.+) address\?/.exec(q.prompt)!;
      const e = natEntry(m[1], Number(m[2]), m[5], m[3], Number(m[4]));
      const want = { "Inside local": e.insideLocal, "Inside global": e.insideGlobal, "Outside global": e.outsideGlobal }[m[6]];
      expect(q.choices[q.answer]).toBe(want);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("NAT pool answer is re-solved from the prompt", () => {
    for (const s of seeds) {
      const q = natPoolGen.generate(s) as NumericQuestion;
      const m = /pool ([\d.]+) - ([\d.]+)\. (\d+) inside/.exec(q.prompt)!;
      expect(q.answer).toBe(Math.max(0, Number(m[3]) - natPoolSize(m[1], m[2])));
    }
  });

  it("syslog answer is the one severity above the threshold", () => {
    for (const s of seeds) {
      const q = syslogGen.generate(s) as McqQuestion;
      const level = Number(/\(level (\d)\)/.exec(q.prompt)![1]);
      const sevs = q.choices.map((c) => Number(c[0]));
      sevs.forEach((v, i) => expect(syslogSent(level, v), q.prompt).toBe(i !== q.answer));
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("DSCP answer is re-solved from the AF name", () => {
    for (const s of seeds) {
      const q = dscpGen.generate(s) as NumericQuestion;
      const [, c, d] = /AF(\d)(\d)\?/.exec(q.prompt)!;
      expect(q.answer).toBe(afDscp(Number(c), Number(d)));
    }
  });

  it("HSRP election is re-solved from the printed routers", () => {
    for (const s of seeds) {
      const q = hsrpElectGen.generate(s) as McqQuestion;
      const routers = [...q.prompt.matchAll(/(R\d) priority (\d+), (\d+\.\d+\.\d+\.\d+)/g)].map((m) => ({ name: m[1], priority: Number(m[2]), ip: m[3] }));
      expect(routers).toHaveLength(4);
      expect(q.choices[q.answer]).toBe(hsrpActive(routers).name);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("HSRP MAC answer is re-solved from the version and group", () => {
    for (const s of seeds) {
      const q = hsrpMacGen.generate(s) as McqQuestion;
      const [, v, g] = /version (\d) group (\d+)\?/.exec(q.prompt)!;
      expect(q.choices[q.answer]).toBe(hsrpVirtualMac(Number(g), Number(v) as 1 | 2));
      expect(new Set(q.choices).size).toBe(4);
    }
  });
});
