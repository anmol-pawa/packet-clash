/**
 * 5.5 datacenter and cloud problems: oversubscription, leaf-spine and fat-tree sizing, VXLAN MTU,
 * VPC subnet capacity and Kubernetes pod CIDR splits. Answers come from `lib/net/datacenter`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { cloudUsableIps, fatTree, leafSpine, oversubscription, podCidrNodes, podIpsPerNode, vxlanUnderlayMtu } from "@/lib/net/datacenter";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "NETWORK" } as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US");

export const oversubGen: Generator = {
  id: "gen-sde-oversub",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const down = pick(r, [24, 32, 48]);
    const dg = pick(r, [10, 25]);
    const up = pick(r, [2, 4, 6, 8]);
    const ug = pick(r, [40, 100]);
    const ratio = round2(oversubscription(down, dg, up, ug));
    return {
      id: `gen-sde-oversub:${down}:${dg}:${up}:${ug}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A leaf switch has ${down} server ports at ${dg} Gbit/s and ${up} uplinks at ${ug} Gbit/s. What is its oversubscription ratio (downlink : uplink), as a single number x for x:1 (2 decimal places)?`,
      answer: ratio,
      tolerance: 0.01,
      explain: `Down = ${down} × ${dg} = ${down * dg} Gbit/s; up = ${up} × ${ug} = ${up * ug} Gbit/s. ${down * dg} / ${up * ug} = ${ratio}, so ${ratio}:1. A ratio of 1 is non-blocking.`,
    } satisfies Question;
  },
};

export const leafSpineGen: Generator = {
  id: "gen-sde-leafspine",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const leafPorts = pick(r, [48, 64]);
    const spines = pick(r, [4, 6, 8]);
    const spinePorts = pick(r, [16, 32, 64]);
    const f = leafSpine(leafPorts, spines, spinePorts);
    return {
      id: `gen-sde-leafspine:${leafPorts}:${spines}:${spinePorts}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A two-tier leaf-spine fabric has ${spines} spine switches with ${spinePorts} ports each. Every leaf has ${leafPorts} ports and one uplink to each spine; the remaining ports face servers, and each spine port connects to a different leaf. How many servers can the fabric attach?`,
      answer: f.servers,
      unit: "servers",
      explain: `Each leaf uses ${spines} ports up, leaving ${f.downPerLeaf} for servers. Each spine has ${spinePorts} ports, so there can be ${f.leaves} leaves. ${f.downPerLeaf} × ${f.leaves} = ${fmt(f.servers)} servers, with ${spines} equal-cost paths between any two leaves.`,
    } satisfies Question;
  },
};

export const fatTreeGen: Generator = {
  id: "gen-sde-fattree",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const k = pick(r, [4, 6, 8, 16, 24, 48]);
    const f = fatTree(k);
    return {
      id: `gen-sde-fattree:${k}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A k-ary fat-tree built from identical ${k}-port switches has ${k} pods, each with ${k / 2} edge and ${k / 2} aggregation switches, plus core switches. How many hosts does it support (each edge switch connects ${k / 2} hosts)?`,
      answer: f.hosts,
      unit: "hosts",
      explain: `Edge switches: ${k} pods × ${k / 2} = ${k * k / 2}, each with ${k / 2} hosts: k³/4 = ${fmt(f.hosts)} hosts. Total switches 5k²/4 = ${fmt(f.switches)} (${f.core} core).`,
    } satisfies Question;
  },
};

export const vxlanGen: Generator = {
  id: "gen-sde-vxlan",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const inner = pick(r, [1280, 1400, 1500, 8900]);
    const mtu = vxlanUnderlayMtu(inner);
    return {
      id: `gen-sde-vxlan:${inner}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `Guests use an IP MTU of ${fmt(inner)} bytes inside a VXLAN overlay over IPv4. What is the smallest underlay IP MTU that carries those packets without fragmentation? (VXLAN adds the inner Ethernet header, an 8-byte VXLAN header, an 8-byte UDP header and a 20-byte outer IP header.)`,
      answer: mtu,
      unit: "bytes",
      explain: `${fmt(inner)} + 14 (inner Ethernet) + 8 (VXLAN) + 8 (UDP) + 20 (IPv4) = ${fmt(mtu)} bytes, i.e. 50 bytes of overhead. That is why overlays usually run on a 9000-byte jumbo underlay.`,
    } satisfies Question;
  },
};

export const vpcGen: Generator = {
  id: "gen-sde-vpcips",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const prefix = randInt(r, 20, 28);
    const n = cloudUsableIps(prefix);
    return {
      id: `gen-sde-vpcips:${prefix}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A cloud VPC subnet is a /${prefix}. The provider reserves 5 addresses in every subnet (network, router, DNS, one future use, broadcast). How many addresses can you assign to instances?`,
      answer: n,
      unit: "addresses",
      explain: `A /${prefix} has 2^${32 - prefix} = ${fmt(2 ** (32 - prefix))} addresses. Minus 5 reserved = ${fmt(n)}. (Classic subnetting subtracts only 2.)`,
    } satisfies Question;
  },
};

export const podCidrGen: Generator = {
  id: "gen-sde-podcidr",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const cluster = pick(r, [14, 16, 18]);
    const node = pick(r, [23, 24, 25]);
    const nodes = podCidrNodes(cluster, node);
    return {
      id: `gen-sde-podcidr:${cluster}:${node}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A Kubernetes cluster uses pod CIDR 10.0.0.0/${cluster} and hands each node its own /${node} block. How many nodes can the cluster have before it runs out of pod blocks?`,
      answer: nodes,
      unit: "nodes",
      explain: `${node} − ${cluster} = ${node - cluster} extra prefix bits, so 2^${node - cluster} = ${fmt(nodes)} node blocks. Each /${node} holds ${fmt(podIpsPerNode(node))} usable pod IPs (the kubelet default cap is 110 pods per node).`,
    } satisfies Question;
  },
};

export const DC_GENERATORS: readonly Generator[] = [oversubGen, leafSpineGen, fatTreeGen, vxlanGen, vpcGen, podCidrGen];
