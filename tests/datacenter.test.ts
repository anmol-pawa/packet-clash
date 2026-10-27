import { describe, expect, it } from "vitest";
import { DC_BANK } from "@/content/questions/dcBank";
import { DC_GENERATORS, fatTreeGen, leafSpineGen, oversubGen, podCidrGen, vpcGen, vxlanGen } from "@/content/questions/dcGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { cloudUsableIps, fatTree, leafSpine, natFlows, oversubscription, podCidrNodes, podIpsPerNode, vxlanInnerMtu, vxlanUnderlayMtu, VXLAN_VNIS } from "@/lib/net/datacenter";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

describe("datacenter solver", () => {
  it("oversubscription: 48x10G over 4x40G is 3:1; 1:1 is non-blocking", () => {
    expect(oversubscription(48, 10, 4, 40)).toBe(3);
    expect(oversubscription(32, 25, 8, 100)).toBe(1);
  });
  it("leaf-spine: 4 spines of 32 ports, 48-port leaves", () => {
    expect(leafSpine(48, 4, 32)).toEqual({ downPerLeaf: 44, leaves: 32, servers: 1408, pathsBetweenLeaves: 4 });
  });
  it("fat tree (Al-Fares et al.): k=4 has 16 hosts and 20 switches; k=48 has 27,648 hosts", () => {
    expect(fatTree(4)).toEqual({ hosts: 16, switches: 20, core: 4, pods: 4 });
    expect(fatTree(48).hosts).toBe(27648);
  });
  it("VXLAN adds 50 bytes: 1500 needs 1550 and a 9000 underlay carries 8950", () => {
    expect(vxlanUnderlayMtu(1500)).toBe(1550);
    expect(vxlanInnerMtu(9000)).toBe(8950);
    expect(VXLAN_VNIS).toBe(16_777_216);
  });
  it("cloud subnets reserve five addresses", () => {
    expect(cloudUsableIps(24)).toBe(251);
    expect(cloudUsableIps(28)).toBe(11);
  });
  it("Kubernetes pod CIDRs", () => {
    expect(podCidrNodes(16, 24)).toBe(256);
    expect(podIpsPerNode(24)).toBe(254);
    expect(podCidrNodes(14, 25)).toBe(2048);
  });
  it("NAT: one public IP gives 64,512 source ports per destination", () => {
    expect(natFlows(1)).toBe(64512);
    expect(natFlows(2)).toBe(129024);
  });
});

describe("datacenter bank", () => {
  it("has well-formed MCQs", () => {
    expect(DC_BANK.length).toBeGreaterThanOrEqual(20);
    for (const q of DC_BANK as McqQuestion[]) {
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(grade(q, correctResponse(q))).toBe(true);
    }
  });
});

describe("datacenter generators", () => {
  it("are registered", () => {
    for (const g of DC_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const seed of seeds) {
      const o = oversubGen.generate(seed) as NumericQuestion;
      const om = o.prompt.match(/has (\d+) server ports at (\d+) Gbit\/s and (\d+) uplinks at (\d+)/)!;
      expect(o.answer).toBeCloseTo(oversubscription(+om[1], +om[2], +om[3], +om[4]), 2);

      const l = leafSpineGen.generate(seed) as NumericQuestion;
      const lm = l.prompt.match(/has (\d+) spine switches with (\d+) ports each. Every leaf has (\d+) ports/)!;
      expect(l.answer).toBe(leafSpine(+lm[3], +lm[1], +lm[2]).servers);

      const f = fatTreeGen.generate(seed) as NumericQuestion;
      expect(f.answer).toBe(fatTree(+f.prompt.match(/from identical (\d+)-port/)![1]).hosts);

      const v = vxlanGen.generate(seed) as NumericQuestion;
      expect(v.answer).toBe(vxlanUnderlayMtu(+v.prompt.match(/MTU of ([\d,]+) bytes/)![1].replace(/,/g, "")));

      const c = vpcGen.generate(seed) as NumericQuestion;
      expect(c.answer).toBe(cloudUsableIps(+c.prompt.match(/is a \/(\d+)/)![1]));

      const p = podCidrGen.generate(seed) as NumericQuestion;
      const pm = p.prompt.match(/10\.0\.0\.0\/(\d+) and hands each node its own \/(\d+)/)!;
      expect(p.answer).toBe(podCidrNodes(+pm[1], +pm[2]));
    }
  });
});
