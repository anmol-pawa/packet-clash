/**
 * Seeded problem generators. Every answer is computed by a solver in
 * `lib/net` (tested against textbook worked examples), and distractors are the
 * mistakes people really make: off-by-one block, forgetting ×8, mixing up the
 * network and broadcast addresses.
 */
import { mcqChoices, formatNumber, type Generator } from "@/game/engine/questions";
import { propagationDelay, transmissionDelay } from "@/lib/net/basics";
import { blockSize, broadcastOf, formatIp, maskOf, usableHosts, type Cidr } from "@/lib/net/ipv4";
import { randInt, rng } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** Relative tolerance for answers players may round: 0.5%. */
const rounded = (answer: number) => Math.abs(answer) * 0.005;

/** A random unicast address in one of the private ranges. */
function randomIp(r: () => number): number {
  const a = pick(r, [10, 172, 192] as const);
  const b = a === 10 ? randInt(r, 0, 255) : a === 172 ? randInt(r, 16, 31) : 168;
  return ((a << 24) | (b << 16) | (randInt(r, 0, 255) << 8) | randInt(r, 1, 254)) >>> 0;
}

const cidrOf = (ip: number, prefix: number): Cidr => ({ network: (ip & maskOf(prefix)) >>> 0, prefix });

export const txDelay: Generator = {
  id: "gen-tx-delay",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const bytes = pick(r, [100, 500, 1000, 1250, 1500, 2000, 4000]);
    const mbps = pick(r, [1, 2, 4, 5, 8, 10, 100]);
    const ms = transmissionDelay(bytes, mbps * 1e6) * 1000;
    return {
      id: `gen-tx-delay:${bytes}:${mbps}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 1,
      prompt: `How long does it take to push a ${bytes.toLocaleString("en-US")}-byte packet onto a ${mbps} Mbps link? (transmission delay, in ms)`,
      answer: ms,
      tolerance: rounded(ms),
      unit: "ms",
      explain: `Transmission delay is L/R: ${bytes} bytes × 8 = ${(bytes * 8).toLocaleString("en-US")} bits, ÷ ${mbps.toLocaleString("en-US")},000,000 bit/s = ${formatNumber(ms)} ms. It depends on the packet and the link rate, not on the distance.`,
    };
  },
};

export const propDelay: Generator = {
  id: "gen-prop-delay",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const km = pick(r, [100, 300, 600, 1200, 2400, 3000, 6000, 12000]);
    const speed = pick(r, [2e8, 2.4e8, 2.5e8, 3e8]);
    const ms = propagationDelay(km * 1000, speed) * 1000;
    return {
      id: `gen-prop-delay:${km}:${speed}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 1,
      prompt: `A signal travels ${km.toLocaleString("en-US")} km at ${speed / 1e8}×10⁸ m/s. What is the propagation delay, in ms? (round to 3 significant figures)`,
      answer: ms,
      tolerance: rounded(ms),
      unit: "ms",
      explain: `Propagation delay is d/s: ${(km * 1000).toLocaleString("en-US")} m ÷ ${speed / 1e8}×10⁸ m/s = ${Number(ms.toPrecision(3))} ms. It depends on distance and the medium, not on the packet size or link rate.`,
    };
  },
};

export const bandwidthDelay: Generator = {
  id: "gen-bdp",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mbps = pick(r, [1, 10, 20, 50, 100]);
    const rtt = pick(r, [10, 20, 40, 80, 100]);
    const kbit = mbps * rtt;
    return {
      id: `gen-bdp:${mbps}:${rtt}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 2,
      prompt: `A ${mbps} Mbps path has a ${rtt} ms round-trip time. How many kilobits must be in flight to keep it full for one RTT? (bandwidth-delay product, in kbit)`,
      answer: kbit,
      unit: "kbit",
      explain: `Bandwidth × RTT = ${mbps}×10⁶ bit/s × ${rtt}×10⁻³ s = ${(kbit * 1000).toLocaleString("en-US")} bits = ${kbit.toLocaleString("en-US")} kbit. A sender's window smaller than this leaves the pipe partly empty.`,
    };
  },
};

export const subnetHosts: Generator = {
  id: "gen-subnet-hosts",
  topic: "network",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const prefix = randInt(r, 18, 30);
    const hosts = usableHosts(prefix);
    return {
      id: `gen-subnet-hosts:${prefix}`,
      kind: "numeric",
      topic: "network",
      type: "NETWORK",
      difficulty: 1,
      prompt: `How many usable host addresses does a /${prefix} subnet have?`,
      answer: hosts,
      explain: `/${prefix} leaves ${32 - prefix} host bits: 2^${32 - prefix} = ${blockSize(prefix).toLocaleString("en-US")} addresses, minus the network and broadcast addresses = ${hosts.toLocaleString("en-US")}.`,
    };
  },
};

export const prefixForHosts: Generator = {
  id: "gen-prefix-for-hosts",
  topic: "network",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const need = randInt(r, 3, 4000);
    let prefix = 30;
    while (usableHosts(prefix) < need) prefix--;
    return {
      id: `gen-prefix-for-hosts:${need}`,
      kind: "numeric",
      topic: "network",
      type: "NETWORK",
      difficulty: 2,
      prompt: `A LAN needs ${need.toLocaleString("en-US")} host addresses. What is the longest prefix length (smallest subnet) that fits? Enter the number after the "/".`,
      answer: prefix,
      explain: `/${prefix} gives 2^${32 - prefix} − 2 = ${usableHosts(prefix).toLocaleString("en-US")} hosts, enough for ${need.toLocaleString("en-US")}; /${prefix + 1} gives only ${usableHosts(prefix + 1).toLocaleString("en-US")}.`,
    };
  },
};

export const networkAddress: Generator = {
  id: "gen-network-address",
  topic: "network",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const ip = randomIp(r);
    const prefix = randInt(r, 17, 29);
    const c = cidrOf(ip, prefix);
    const size = blockSize(prefix);
    const answer = formatIp(c.network);
    const mcq = mcqChoices(r, answer, [
      formatIp(broadcastOf(c)),
      formatIp((c.network + size) >>> 0),
      formatIp((ip & 0xffffff00) >>> 0),
      formatIp(cidrOf(ip, prefix + 1).network),
      formatIp((c.network - size) >>> 0),
      formatIp((c.network + 1) >>> 0),
    ]);
    return {
      id: `gen-network-address:${formatIp(ip)}/${prefix}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 2,
      prompt: `What is the network address of ${formatIp(ip)}/${prefix}?`,
      ...mcq,
      explain: `AND the address with the /${prefix} mask ${formatIp(maskOf(prefix))}: blocks are ${size.toLocaleString("en-US")} addresses long, so ${formatIp(ip)} falls in the block that starts at ${answer} and ends at ${formatIp(broadcastOf(c))}.`,
    };
  },
};

export const broadcastAddress: Generator = {
  id: "gen-broadcast-address",
  topic: "network",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const ip = randomIp(r);
    const prefix = randInt(r, 17, 29);
    const c = cidrOf(ip, prefix);
    const size = blockSize(prefix);
    const bcast = broadcastOf(c);
    const answer = formatIp(bcast);
    const mcq = mcqChoices(r, answer, [
      formatIp(c.network),
      formatIp((bcast - 1) >>> 0),
      formatIp((ip | 0xff) >>> 0),
      formatIp(broadcastOf(cidrOf(ip, prefix + 1))),
      formatIp((bcast + size) >>> 0),
      formatIp((c.network + size) >>> 0),
    ]);
    return {
      id: `gen-broadcast-address:${formatIp(ip)}/${prefix}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 2,
      prompt: `What is the broadcast address of ${formatIp(ip)}/${prefix}?`,
      ...mcq,
      explain: `Set every host bit to 1: the /${prefix} block holding ${formatIp(ip)} runs ${formatIp(c.network)}–${answer} (${size.toLocaleString("en-US")} addresses), so the broadcast is the last one, ${answer}. The last usable host is one below it.`,
    };
  },
};

export const GENERATORS: readonly Generator[] = [
  txDelay,
  propDelay,
  bandwidthDelay,
  subnetHosts,
  prefixForHosts,
  networkAddress,
  broadcastAddress,
];
