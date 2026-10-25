/**
 * CCNA 4.1 problems: PoE budgets, which cable a link needs, runt/giant frames,
 * and reading ping and traceroute output. Every answer comes from
 * `lib/net/devices`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import {
  POE_STANDARDS,
  cableFor,
  frameClass,
  maxPingPayload,
  parsePing,
  parseTraceroute,
  pingTranscript,
  poeDevices,
  tracerouteTranscript,
  type Cable,
  type CableDevice,
  type FrameClass,
} from "@/lib/net/devices";
import { randInt, rng, shuffled } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

export const poeGen: Generator = {
  id: "gen-poe",
  topic: "ccna",
  type: "PHYSICAL",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const std = pick(r, POE_STANDARDS.slice(0, 3));
    const budget = pick(r, [123, 185, 240, 370, 480, 740]);
    const n = poeDevices(budget, std.id);
    return {
      id: `gen-poe:${std.id}:${budget}`,
      kind: "numeric",
      topic: "ccna",
      type: "PHYSICAL",
      difficulty: 2,
      prompt: `A switch has a ${budget} W PoE budget. Each port can source up to ${std.pse} W (${std.name}). How many devices can it power if every one draws its port's full maximum?`,
      answer: n,
      explain: `The budget is shared out in PSE watts, the power the port sources: ${budget} ÷ ${std.pse} = ${(budget / std.pse).toFixed(2)}, so ${n} devices (round down: a fraction of a port powers nothing). The device itself gets less (${std.pd} W) because the cable wastes some on the way.`,
    } satisfies Question;
  },
};

const CABLE_DEVICES: readonly CableDevice[] = ["PC", "Server", "Router", "Wireless AP", "Switch", "Hub"];

export const cableGen: Generator = {
  id: "gen-cable",
  topic: "ccna",
  type: "PHYSICAL",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const [a, b] = shuffled(r, CABLE_DEVICES);
    const cable: Cable = cableFor(a, b);
    const other: Cable = cable === "crossover" ? "straight-through" : "crossover";
    const { choices, answer } = mcqChoices(r, cable, [other, "rollover (console)", "coaxial"]);
    const sendsA = ["PC", "Server", "Router", "Wireless AP"].includes(a);
    const sendsB = ["PC", "Server", "Router", "Wireless AP"].includes(b);
    return {
      id: `gen-cable:${a}:${b}`,
      kind: "mcq",
      topic: "ccna",
      type: "PHYSICAL",
      difficulty: 1,
      prompt: `Which UTP cable connects a ${a} to a ${b} when neither port has auto-MDI/MDIX?`,
      choices,
      answer,
      explain: `PCs, servers, routers and access points transmit on pins 1,2; switches and hubs transmit on pins 3,6. The ${a} transmits on ${sendsA ? "1,2" : "3,6"} and the ${b} on ${sendsB ? "1,2" : "3,6"}. ${cable === "crossover" ? "Like devices both transmit on the same pair, so a crossover swaps the pairs." : "Unlike devices already transmit on opposite pairs, so a straight-through cable lines them up."} Modern ports with auto-MDI/MDIX make the choice moot.`,
    } satisfies Question;
  },
};

const FRAME_NAME: Readonly<Record<FrameClass, string>> = { runt: "a runt", normal: "a normal frame", giant: "a giant" };

export const frameGen: Generator = {
  id: "gen-frame-class",
  topic: "ccna",
  type: "LINK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const want = pick(r, ["runt", "normal", "giant"] as const);
    const bytes = want === "runt" ? randInt(r, 20, 63) : want === "normal" ? randInt(r, 64, 1518) : randInt(r, 1600, 9000);
    const cls = frameClass(bytes);
    const { choices, answer } = mcqChoices(r, FRAME_NAME[cls], [FRAME_NAME.runt, FRAME_NAME.normal, FRAME_NAME.giant, "a jumbo frame (always valid)"]);
    return {
      id: `gen-frame-class:${bytes}`,
      kind: "mcq",
      topic: "ccna",
      type: "LINK",
      difficulty: 1,
      prompt: `An Ethernet interface (MTU 1500, no jumbo frames) receives a ${bytes}-byte frame. The switch counts it as:`,
      choices,
      answer,
      explain: `A legal Ethernet frame is 64 to 1518 bytes including header and FCS. Below 64 is a runt (typically a collision fragment, so think duplex mismatch); above 1518 is a giant (a sender with a larger MTU or a jumbo frame). ${bytes} bytes is ${FRAME_NAME[cls]}.`,
    } satisfies Question;
  },
};

const SYMBOLS = ["!", ".", "U"] as const;

export const pingRateGen: Generator = {
  id: "gen-ping-rate",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const n = pick(r, [5, 10]);
    let line = "";
    for (let i = 0; i < n; i++) line += r() < 0.65 ? "!" : pick(r, SYMBOLS.slice(1));
    if (!line.includes("!")) line = "!" + line.slice(1);
    const res = parsePing(line);
    const target = `10.${randInt(r, 0, 250)}.${randInt(r, 0, 250)}.${randInt(r, 1, 254)}`;
    return {
      id: `gen-ping-rate:${n}:${line}`,
      kind: "numeric",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 1,
      prompt: `${pingTranscript(target, line).split("\n").slice(0, 4).join("\n")}\n\nWhat success rate (percent) does IOS print on the last line?`,
      answer: res.successPercent,
      unit: "%",
      explain: `Each \`!\` is an echo reply; \`.\` is a timeout and \`U\` means a router answered destination unreachable. ${res.replies} of ${res.sent} replied, so the success rate is ${res.replies}/${res.sent} = ${res.successPercent} percent.`,
    } satisfies Question;
  },
};

export const tracerouteGen: Generator = {
  id: "gen-traceroute",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const good = randInt(r, 1, 5);
    const silent = randInt(r, 2, 3);
    const path = Array.from({ length: good }, (_, i) => `10.${i + 1}.${randInt(r, 1, 9)}.${randInt(r, 1, 3)}`);
    const dest = `192.168.${randInt(r, 10, 99)}.${randInt(r, 10, 99)}`;
    const text = tracerouteTranscript(dest, path, silent);
    const res = parseTraceroute(text, dest);
    return {
      id: `gen-traceroute:${dest}:${path.join(",")}:${silent}`,
      kind: "numeric",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `${text}\n\nThe trace never reaches the destination. What is the number of the last hop that answered?`,
      answer: res.lastResponding,
      explain: `Each line is one TTL value. Hops 1 to ${res.lastResponding} sent back ICMP time-exceeded; after that every probe timed out (\`* * *\`). The break is just past hop ${res.lastResponding}: a missing route there or on the way back, a filter dropping the probes, or a device that does not send ICMP errors. Check hop ${res.lastResponding}'s routing table first.`,
    } satisfies Question;
  },
};

export const pingPayloadGen: Generator = {
  id: "gen-ping-payload",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mtu = pick(r, [1500, 1492, 1480, 1400, 1280, 9000]);
    const size = maxPingPayload(mtu);
    return {
      id: `gen-ping-payload:${mtu}`,
      kind: "numeric",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `You ping across a path whose smallest MTU is ${mtu} bytes with the Don't Fragment bit set. What is the largest ICMP data size (bytes) that still gets through?`,
      answer: size,
      unit: "B",
      explain: `The MTU limits the whole IP packet: ${mtu} − 20 bytes of IPv4 header − 8 bytes of ICMP header = ${size} bytes of data. One byte more and a router must drop it and answer "fragmentation needed" (IOS shows \`M\`).`,
    } satisfies Question;
  },
};

export const CCNA_GENERATORS: readonly Generator[] = [poeGen, cableGen, frameGen, pingRateGen, tracerouteGen, pingPayloadGen];
