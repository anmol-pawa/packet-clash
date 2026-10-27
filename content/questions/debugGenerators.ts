/**
 * 5.8 debugging problems: curl timing phases, traceroute jumps, MSS, PMTUD and ss queues.
 * Answers come from `lib/net/debug`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { PHASE_NAMES, biggestJumpHop, mssForMtu, pmtudOutcome, slowestPhase, ssDiagnosis, timeToFirstByteMs, type RequestPhases } from "@/lib/net/debug";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "APPLICATION" } as const;
const PHASE_LABELS = ["DNS", "TCP connect", "TLS", "Server wait", "Download"];

export const slowPhaseGen: Generator = {
  id: "gen-sde-slowphase",
  ...base,
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    // Distinct values, so the slowest phase is unambiguous.
    const pool = [5, 15, 25, 40, 60, 85, 120, 250, 400, 900, 1400];
    const vals: number[] = [];
    while (vals.length < 5) vals.push(...pool.splice(randInt(r, 0, pool.length - 1), 1));
    const [dns, connect, tls, server, download] = vals;
    const p: RequestPhases = { dns, connect, tls, server, download };
    // Four choices: the dominant phase plus three others, in seeded order.
    const right = PHASE_NAMES.indexOf(slowestPhase(p));
    const others = PHASE_LABELS.map((_, i) => i).filter((i) => i !== right);
    const choiceIdx = [right];
    while (choiceIdx.length < 4) choiceIdx.push(...others.splice(randInt(r, 0, others.length - 1), 1));
    choiceIdx.sort((a, b) => a - b);
    return {
      id: `gen-sde-slowphase:${vals.join("-")}`,
      kind: "mcq",
      ...base,
      difficulty: 1,
      prompt: `A request took: DNS ${dns} ms, TCP connect ${connect} ms, TLS ${tls} ms, server wait ${server} ms, download ${download} ms. Which phase dominates?`,
      choices: choiceIdx.map((i) => PHASE_LABELS[i]),
      answer: choiceIdx.indexOf(right),
      explain: "Fix the biggest slice first. A large server wait means app or database time; a large connect or TLS means distance (round trips); a large DNS means resolver or TTL trouble; a large download means bandwidth or payload size.",
    } satisfies Question;
  },
};

export const ttfbGen: Generator = {
  id: "gen-sde-ttfb-curl",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const p: RequestPhases = {
      dns: pick(r, [10, 20, 30, 50]),
      connect: pick(r, [20, 40, 80, 120]),
      tls: pick(r, [40, 80, 120, 160]),
      server: pick(r, [50, 100, 200, 500]),
      download: pick(r, [30, 60, 90, 300]),
    };
    const t = timeToFirstByteMs(p);
    return {
      id: `gen-sde-ttfb-curl:${p.dns}-${p.connect}-${p.tls}-${p.server}-${p.download}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `curl reports DNS ${p.dns} ms, connect ${p.connect} ms, TLS ${p.tls} ms, server wait ${p.server} ms and download ${p.download} ms. What is the time to first byte (time_starttransfer)?`,
      answer: t,
      unit: "ms",
      explain: `Time to first byte = DNS + connect + TLS + server wait = ${p.dns} + ${p.connect} + ${p.tls} + ${p.server} = ${t} ms. The download phase comes after the first byte.`,
    } satisfies Question;
  },
};

export const jumpHopGen: Generator = {
  id: "gen-sde-jumphop",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    // Four hops with distinct per-hop increments, so the biggest jump is unique.
    const steps = [1, 2, 3, 5, 8, 13, 21, 55, 89, 140];
    const incs: number[] = [];
    while (incs.length < 4) incs.push(...steps.splice(randInt(r, 0, steps.length - 1), 1));
    const rtts = incs.map((_, i) => incs.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const hop = biggestJumpHop(rtts);
    return {
      id: `gen-sde-jumphop:${rtts.join(",")}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `traceroute shows cumulative RTTs of ${rtts.map((v, i) => `hop ${i + 1}: ${v} ms`).join(", ")}. Which hop adds the most latency over the one before it?`,
      choices: rtts.map((_, i) => `Hop ${i + 1}`),
      answer: hop,
      explain: "Subtract each hop's RTT from the next: the largest difference marks the long or congested segment (a persistent step). A one-hop spike that disappears later is only a slow ICMP responder.",
    } satisfies Question;
  },
};

export const mssGen: Generator = {
  id: "gen-sde-mss",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const [name, mtu] = pick(r, [["Ethernet", 1500], ["PPPoE", 1492], ["a VXLAN underlay-limited path", 1450], ["a GRE tunnel", 1476], ["an IPsec tunnel", 1400], ["jumbo frames", 9000]] as const);
    const mss = mssForMtu(mtu);
    return {
      id: `gen-sde-mss:${mtu}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A link (${name}) has an MTU of ${mtu} bytes. What TCP MSS should an IPv4 endpoint advertise, with no IP or TCP options?`,
      answer: mss,
      unit: "bytes",
      explain: `MSS = MTU − 20 (IPv4) − 20 (TCP) = ${mtu} − 40 = ${mss} bytes. MSS clamping rewrites this value in SYNs so tunnels never see oversize segments.`,
    } satisfies Question;
  },
};

export const pmtudGen: Generator = {
  id: "gen-sde-pmtud",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const sender = pick(r, [1500, 9000]);
    const path = pick(r, [1280, 1400, 1450, 1500, 9000]);
    const icmp = pick(r, [true, false]);
    const outcome = pmtudOutcome(sender, path, icmp);
    return {
      id: `gen-sde-pmtud:${sender}:${path}:${icmp}`,
      kind: "mcq",
      ...base,
      difficulty: 3,
      prompt: `A sender uses a ${sender}-byte MTU with the DF bit set. The smallest MTU on the path is ${path} bytes, and routers ${icmp ? "do" : "do not"} return ICMP 'fragmentation needed'. What happens to full-size segments?`,
      choices: ["They fit and are delivered", "The sender learns the path MTU and shrinks its segments", "They are silently dropped and the transfer stalls (black hole)", "They are fragmented and reassembled"],
      answer: outcome === "fits" ? 0 : outcome === "adapts" ? 1 : 2,
      explain: "With DF set a router can't fragment: it drops the packet and signals ICMP type 3 code 4 (IPv6: Packet Too Big). If that ICMP is filtered the sender never shrinks, so small packets work and bulk transfers hang.",
    } satisfies Question;
  },
};

export const ssGen: Generator = {
  id: "gen-sde-ss",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const recvQ = pick(r, [0, 0, 120_000, 500_000]);
    const sendQ = pick(r, [0, 0, 80_000, 300_000]);
    if (recvQ === 0 && sendQ === 0) return ssGen.generate(seed + 1);
    const d = ssDiagnosis(recvQ, sendQ);
    return {
      id: `gen-sde-ss:${recvQ}:${sendQ}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `\`ss -tn\` on a server shows an ESTABLISHED socket with Recv-Q ${recvQ.toLocaleString("en-US")} and Send-Q ${sendQ.toLocaleString("en-US")}. Where is the likely bottleneck?`,
      choices: ["The local application is not reading from the socket", "The peer or the network is slow to ACK what we sent", "The listen backlog is full", "The DNS resolver"],
      answer: d === "app-not-reading" ? 0 : 1,
      explain: "Recv-Q = bytes received but not yet read by the app (an app problem). Send-Q = bytes sent or queued but not yet acknowledged (a peer, window or network problem). When both are non-zero, the larger queue points at the dominant side.",
    } satisfies Question;
  },
};

export const DEBUG_GENERATORS: readonly Generator[] = [slowPhaseGen, ttfbGen, jumpHopGen, mssGen, pmtudGen, ssGen];
