/**
 * Seeded problem generators. Every answer is computed by a solver in
 * `lib/net` (tested against textbook worked examples), and distractors are the
 * mistakes people really make: off-by-one block, forgetting ×8, mixing up the
 * network and broadcast addresses.
 */
import { mcqChoices, formatNumber, type Generator } from "@/game/engine/questions";
import {
  bottleneck,
  circuitFileTime,
  circuitUsers,
  propagationDelay,
  storeAndForwardTime,
  trafficIntensity,
  transmissionDelay,
} from "@/lib/net/basics";
import { blockSize, broadcastOf, formatIp, maskOf, usableHosts, type Cidr } from "@/lib/net/ipv4";
import { randInt, rng, shuffled } from "@/lib/rng";
import { ACL_GENERATORS } from "./aclGenerators";
import { IPROUTE_GENERATORS } from "./iprouteGenerators";
import { OSPF_GENERATORS } from "./ospfGenerators";
import { IPV6_ADDR_GENERATORS } from "./ipv6AddrGenerators";
import { IPSERVICES_GENERATORS } from "./ipservicesGenerators";
import { WIRELESS_GENERATORS } from "./wirelessGenerators";
import { AUTOMATION_GENERATORS } from "./automationGenerators";
import { LOADBALANCE_GENERATORS } from "./loadBalanceGenerators";
import { DC_GENERATORS } from "./dcGenerators";
import { SOCKET_GENERATORS } from "./socketGenerators";
import { WEBSEC_GENERATORS } from "./webSecGenerators";
import { DEBUG_GENERATORS } from "./debugGenerators";
import { RATELIMIT_GENERATORS } from "./rateLimitGenerators";
import { PERF_GENERATORS } from "./perfGenerators";
import { REALTIME_GENERATORS } from "./realtimeGenerators";
import { SWITCHING_GENERATORS } from "./switchingGenerators";
import { CCNA_GENERATORS } from "./ccnaGenerators";
import { ADDRESS_GENERATORS } from "./addressGenerators";
import { IPV6_GENERATORS } from "./ipv6Generators";
import { ERROR_GENERATORS } from "./errorGenerators";
import { LINK_GENERATORS } from "./linkGenerators";
import { SWITCH_GENERATORS } from "./switchGenerators";
import { ROUTING_GENERATORS } from "./routingGenerators";
import { TRANSPORT_GENERATORS } from "./transportGenerators";
import { APPLICATION_GENERATORS } from "./applicationGenerators";
import { SECURITY_GENERATORS } from "./securityGenerators";
import { JOURNEY_GENERATORS } from "./journeyGenerators";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** A value for an explanation: 4 significant figures, no float noise. */
const sig = (x: number) => formatNumber(Number(x.toPrecision(4)));

/** `n` distinct items in seeded order. */
const shuffledPick = <T>(r: () => number, xs: readonly T[], n: number): T[] => shuffled(r, xs).slice(0, n);

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

export const nodalDelay: Generator = {
  id: "gen-nodal-delay",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const bytes = pick(r, [500, 1000, 1250, 1500, 2500]);
    const mbps = pick(r, [1, 2, 5, 10]);
    const km = pick(r, [200, 400, 1000, 2000, 4000]);
    const tx = transmissionDelay(bytes, mbps * 1e6) * 1000;
    const prop = propagationDelay(km * 1000, 2e8) * 1000;
    const ms = tx + prop;
    return {
      id: `gen-nodal-delay:${bytes}:${mbps}:${km}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 2,
      prompt: `A ${bytes.toLocaleString("en-US")}-byte packet crosses one ${km.toLocaleString("en-US")} km, ${mbps} Mbps link (signal speed 2×10⁸ m/s). Ignoring processing and queuing, how long from the first bit leaving to the last bit arriving? (in ms)`,
      answer: ms,
      tolerance: rounded(ms),
      unit: "ms",
      explain: `Transmission L/R = ${(bytes * 8).toLocaleString("en-US")} bits ÷ ${mbps}×10⁶ bit/s = ${formatNumber(tx)} ms, plus propagation d/s = ${(km * 1000).toLocaleString("en-US")} m ÷ 2×10⁸ m/s = ${formatNumber(prop)} ms, gives ${formatNumber(ms)} ms. The last bit can't leave until all L bits are pushed out, then it still has to travel the wire.`,
    };
  },
};

export const queuingIntensity: Generator = {
  id: "gen-traffic-intensity",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const bytes = pick(r, [125, 250, 500, 1000, 1250]);
    const pps = pick(r, [100, 200, 400, 500, 800, 1000, 1200]);
    const mbps = pick(r, [1, 2, 4, 5, 8, 10]);
    const rho = trafficIntensity(bytes, pps, mbps * 1e6);
    const verdict =
      rho > 1
        ? "Above 1, bits arrive faster than the link can send them, so the queue (and the queuing delay) grows without bound until packets are dropped."
        : rho === 1
          ? "At exactly 1 the link is busy all the time on average, so any burst has nowhere to drain: with random arrivals the queue grows without bound."
          : rho > 0.8
            ? "Close to 1, queuing delay shoots up even though the link is not quite full."
            : "Well below 1, most packets find a short queue.";
    return {
      id: `gen-traffic-intensity:${bytes}:${pps}:${mbps}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 2,
      prompt: `${pps.toLocaleString("en-US")} packets/s of ${bytes.toLocaleString("en-US")} bytes each arrive at a router queue feeding a ${mbps} Mbps link. What is the traffic intensity La/R? (to 2 decimal places)`,
      answer: rho,
      tolerance: 0.005,
      explain: `La/R = ${(bytes * 8).toLocaleString("en-US")} bits × ${pps.toLocaleString("en-US")}/s ÷ ${mbps}×10⁶ bit/s = ${formatNumber(rho)}. ${verdict}`,
    };
  },
};

export const storeForward: Generator = {
  id: "gen-store-forward",
  topic: "models",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const links = randInt(r, 2, 5);
    const packets = randInt(r, 1, 6);
    const bytes = pick(r, [500, 1000, 1250, 1500]);
    const mbps = pick(r, [1, 2, 5, 10]);
    const tx = transmissionDelay(bytes, mbps * 1e6) * 1000;
    const ms = storeAndForwardTime(bytes, mbps * 1e6, links, packets) * 1000;
    const pk = packets === 1 ? "one packet" : `${packets} packets back to back`;
    return {
      id: `gen-store-forward:${links}:${packets}:${bytes}:${mbps}`,
      kind: "numeric",
      topic: "models",
      type: "NETWORK",
      difficulty: 2,
      prompt: `A host sends ${pk} of ${bytes.toLocaleString("en-US")} bytes over ${links} store-and-forward links in a row (${links - 1} router${links > 2 ? "s" : ""}), every link ${mbps} Mbps. Ignoring propagation and queuing, when has the last packet fully arrived? (in ms)`,
      answer: ms,
      tolerance: rounded(ms),
      unit: "ms",
      explain: `L/R = ${formatNumber(tx)} ms per packet per link. The first packet needs N·L/R = ${links} × ${formatNumber(tx)} ms (each router must receive all of it before forwarding), and every later packet arrives one L/R behind it: (N + P − 1)·L/R = (${links} + ${packets} − 1) × ${formatNumber(tx)} = ${formatNumber(ms)} ms.`,
    };
  },
};

export const circuitTime: Generator = {
  id: "gen-circuit-time",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const kbit = pick(r, [320, 640, 960, 1280, 1920]);
    // Rates and slot counts that split into whole kbps per slot (a T1 is 1.536 Mbps of payload in 24 slots of 64 kbps).
    const [rate, label, slots] = pick(r, [
      [1.536e6, "1.536 Mbps", 24],
      [1.536e6, "1.536 Mbps", 12],
      [1.536e6, "1.536 Mbps", 8],
      [2.048e6, "2.048 Mbps", 32],
      [2.048e6, "2.048 Mbps", 16],
      [1e6, "1 Mbps", 10],
      [1e6, "1 Mbps", 8],
    ] as const);
    const setup = pick(r, [250, 500, 1000]);
    const s = circuitFileTime(kbit * 1000, rate, slots, setup / 1000);
    const share = rate / slots / 1000;
    return {
      id: `gen-circuit-time:${kbit}:${rate}:${slots}:${setup}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 2,
      prompt: `A ${kbit.toLocaleString("en-US")},000-bit file is sent over a circuit on a ${label} TDM link with ${slots} slots. Setting up the circuit takes ${setup} ms. How long until the whole file is sent? (in seconds, to 3 significant figures)`,
      answer: s,
      tolerance: rounded(s),
      unit: "s",
      explain: `Each circuit gets one slot: ${label} ÷ ${slots} = ${formatNumber(share)} kbps. The file takes ${(kbit * 1000).toLocaleString("en-US")} bits ÷ ${(share * 1000).toLocaleString("en-US")} bit/s = ${sig(s - setup / 1000)} s, plus ${setup / 1000} s of setup = ${sig(s)} s. The reserved slot sits idle when this call is silent, which is why packet switching shares links better.`,
    };
  },
};

export const circuitCapacity: Generator = {
  id: "gen-circuit-users",
  topic: "models",
  type: "PHYSICAL",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const mbps = pick(r, [1, 2, 10, 45, 100]);
    const kbps = pick(r, [64, 100, 128, 256, 500]);
    const users = circuitUsers(mbps * 1e6, kbps * 1e3);
    return {
      id: `gen-circuit-users:${mbps}:${kbps}`,
      kind: "numeric",
      topic: "models",
      type: "PHYSICAL",
      difficulty: 1,
      prompt: `A ${mbps} Mbps link is circuit-switched. Each user reserves ${kbps} kbps while connected. How many users can it carry at once?`,
      answer: users,
      explain: `Circuit switching reserves each user's full rate: ⌊${mbps.toLocaleString("en-US")},000 kbps ÷ ${kbps} kbps⌋ = ${users} users, even if most of them are idle. Packet switching only needs capacity for the users active right now, so it can admit many more.`,
    };
  },
};

export const pathThroughput: Generator = {
  id: "gen-throughput",
  topic: "models",
  type: "TRANSPORT",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const rates = shuffledPick(r, [0.5, 1, 2, 4, 8, 10, 20], 3);
    const mbit = pick(r, [4, 8, 16, 32, 40, 80]);
    const t = bottleneck(rates);
    const s = mbit / t;
    const fmt = (x: number) => `${formatNumber(x)} Mbps`;
    return {
      id: `gen-throughput:${rates.join("-")}:${mbit}`,
      kind: "numeric",
      topic: "models",
      type: "TRANSPORT",
      difficulty: 2,
      prompt: `A ${mbit} Mbit file is downloaded over a path of three links: ${fmt(rates[0])} from the server, ${fmt(rates[1])} across the core, ${fmt(rates[2])} to the client. Nobody else is using them. Roughly how long does the download take? (in seconds, ignoring delays)`,
      answer: s,
      tolerance: rounded(s),
      unit: "s",
      explain: `End-to-end throughput is the bottleneck link's rate: min(${rates.map(formatNumber).join(", ")}) = ${fmt(t)}. ${mbit} Mbit ÷ ${fmt(t)} = ${formatNumber(s)} s. Faster links elsewhere on the path don't help.`,
    };
  },
};

/** The 5-layer Internet model each protocol belongs to (only unambiguous ones: no ARP, BGP or QUIC). */
export const PROTOCOL_LAYERS: Readonly<Record<string, Layer5>> = {
  HTTP: "Application",
  DNS: "Application",
  SMTP: "Application",
  SSH: "Application",
  FTP: "Application",
  DHCP: "Application",
  TCP: "Transport",
  UDP: "Transport",
  SCTP: "Transport",
  IPv4: "Network",
  IPv6: "Network",
  ICMP: "Network",
  Ethernet: "Link",
  "Wi-Fi (802.11)": "Link",
  PPP: "Link",
  "Manchester line coding": "Physical",
  "1000BASE-T signalling": "Physical",
};

export const LAYERS_5 = ["Application", "Transport", "Network", "Link", "Physical"] as const;
export type Layer5 = (typeof LAYERS_5)[number];

export const protocolLayer: Generator = {
  id: "gen-protocol-layer",
  topic: "models",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const proto = pick(r, Object.keys(PROTOCOL_LAYERS));
    const layer = PROTOCOL_LAYERS[proto];
    const mcq = mcqChoices(r, layer, shuffled(r, LAYERS_5));
    const pdu: Record<Layer5, string> = {
      Application: "messages",
      Transport: "segments (or UDP datagrams)",
      Network: "packets (datagrams)",
      Link: "frames",
      Physical: "bits",
    };
    return {
      id: `gen-protocol-layer:${proto}`,
      kind: "mcq",
      topic: "models",
      type: "NETWORK",
      difficulty: 1,
      prompt: `In the 5-layer Internet model, which layer does ${proto} belong to?`,
      ...mcq,
      explain: `${proto} is ${layer === "Application" ? "an" : "a"} ${layer.toLowerCase()}-layer protocol, so it works with ${pdu[layer]}. The five layers, top down: Application, Transport, Network, Link, Physical.`,
    };
  },
};

/** Items per sort-into-layers set: one per layer, plus one more so a layer holds two. */
const SORT_ITEMS = 6;

export const sortLayers: Generator = {
  id: "gen-sort-layers",
  topic: "models",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const all = Object.keys(PROTOCOL_LAYERS);
    const one = LAYERS_5.map((l) => pick(r, all.filter((p) => PROTOCOL_LAYERS[p] === l)));
    const extra = pick(r, all.filter((p) => !one.includes(p)));
    const protos = shuffled(r, [...one, extra]).slice(0, SORT_ITEMS);
    const items = protos.map((label) => ({ label, bin: LAYERS_5.indexOf(PROTOCOL_LAYERS[label]) }));
    const line = (l: Layer5) => `${l}: ${protos.filter((p) => PROTOCOL_LAYERS[p] === l).join(", ")}`;
    return {
      id: `gen-sort-layers:${protos.join("|")}`,
      kind: "sort",
      topic: "models",
      type: "NETWORK",
      difficulty: 1,
      prompt: "Sort each protocol into its layer of the 5-layer Internet model.",
      bins: [...LAYERS_5],
      items,
      explain: `${LAYERS_5.map(line).join(". ")}. Each layer only talks to the layers right above and below it, so every protocol has one home.`,
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
  nodalDelay,
  queuingIntensity,
  storeForward,
  circuitTime,
  circuitCapacity,
  pathThroughput,
  protocolLayer,
  sortLayers,
  subnetHosts,
  prefixForHosts,
  networkAddress,
  broadcastAddress,
  ...ERROR_GENERATORS,
  ...LINK_GENERATORS,
  ...SWITCH_GENERATORS,
  ...ADDRESS_GENERATORS,
  ...ROUTING_GENERATORS,
  ...TRANSPORT_GENERATORS,
  ...APPLICATION_GENERATORS,
  ...SECURITY_GENERATORS,
  ...JOURNEY_GENERATORS,
  ...IPV6_GENERATORS,
  ...CCNA_GENERATORS,
  ...ACL_GENERATORS,
  ...IPROUTE_GENERATORS,
  ...OSPF_GENERATORS,
  ...IPV6_ADDR_GENERATORS,
  ...SWITCHING_GENERATORS,
  ...IPSERVICES_GENERATORS,
  ...WIRELESS_GENERATORS,
  ...AUTOMATION_GENERATORS,
  ...LOADBALANCE_GENERATORS,
  ...RATELIMIT_GENERATORS,
  ...PERF_GENERATORS,
  ...REALTIME_GENERATORS,
  ...DC_GENERATORS,
  ...SOCKET_GENERATORS,
  ...WEBSEC_GENERATORS,
  ...DEBUG_GENERATORS,
];
