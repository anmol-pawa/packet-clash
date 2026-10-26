/**
 * CCNA 4.4 problems: STP root election, blocked port and root path cost on a
 * small topology, EtherChannel mode pairs. Every answer comes from `lib/net/stp`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { rng, randInt, shuffled } from "@/lib/rng";
import { computeStp, effectivePriority, etherChannelForms, stpPortCost, type EtherChannelMode, type StpBridge, type StpLink } from "@/lib/net/stp";

const NAMES = ["SW1", "SW2", "SW3", "SW4"];
const SPEEDS = [10, 100, 1000] as const;

function macOf(r: () => number): string {
  return Array.from({ length: 6 }, () => randInt(r, 0, 255).toString(16).padStart(2, "0")).join("");
}

const dotted = (mac: string) => `${mac.slice(0, 4)}.${mac.slice(4, 8)}.${mac.slice(8)}`;

export const stpRootGen: Generator = {
  id: "gen-ccna-stp-root",
  topic: "ccna",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = 4;
    const vlan = [1, 10, 20, 99][randInt(r, 0, 3)];
    const bridges: StpBridge[] = NAMES.slice(0, n).map((name) => ({
      name,
      priority: effectivePriority([4096, 8192, 32768, 32768][randInt(r, 0, 3)], vlan),
      mac: macOf(r),
    }));
    const root = computeStp(bridges, bridges.slice(1).map((b, i) => ({ a: bridges[i].name, b: b.name, cost: 19 }))).root;
    const lines = bridges.map((b) => `${b.name}: priority ${b.priority}, MAC ${dotted(b.mac)}`).join("\n");
    const { choices, answer } = mcqChoices(r, root, bridges.map((b) => b.name));
    return {
      id: `gen-ccna-stp-root:${vlan}:${bridges.map((b) => `${b.priority}-${b.mac}`).join("|")}`,
      kind: "mcq",
      topic: "ccna",
      type: "LINK",
      difficulty: 2,
      prompt: `These switches run STP in VLAN ${vlan}:\n${lines}\nWhich becomes the root bridge?`,
      choices,
      answer,
      explain: `The lowest bridge ID wins: compare priority first, then MAC. ${root} has the lowest.`,
    } satisfies Question;
  },
};

interface Ring {
  bridges: StpBridge[];
  links: StpLink[];
  speeds: number[];
}

/** A ring of `n` switches; SW1 is always the lowest-priority root. */
function makeRing(r: () => number, n: number): Ring {
  const names = NAMES.slice(0, n);
  const macs = shuffled(r, Array.from({ length: n }, (_, i) => i + 1)).map((v) => `0000000000${v.toString(16)}`.slice(-12));
  const bridges: StpBridge[] = names.map((name, i) => ({ name, priority: i === 0 ? 4096 : 32768, mac: macs[i] }));
  const speeds = names.map(() => SPEEDS[randInt(r, 0, 2)]);
  const links: StpLink[] = names.map((a, i) => ({ a, b: names[(i + 1) % n], cost: stpPortCost(speeds[i]) }));
  return { bridges, links, speeds };
}

const ringText = (ring: Ring) => ring.links.map((l, i) => `${l.a} — ${l.b}: ${ring.speeds[i] >= 1000 ? "Gigabit" : ring.speeds[i] === 100 ? "FastEthernet" : "Ethernet"}`).join("\n");

export const stpBlockedGen: Generator = {
  id: "gen-ccna-stp-port",
  topic: "ccna",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const ring = makeRing(r, 3);
    const res = computeStp(ring.bridges, ring.links);
    const blocked = res.ports.filter((p) => p.role === "blocked");
    if (blocked.length !== 1) throw new Error("a triangle blocks exactly one port");
    const b = blocked[0];
    const label = (p: { bridge: string; peer: string }) => `${p.bridge}'s port toward ${p.peer}`;
    const all = res.ports.map(label);
    const { choices, answer } = mcqChoices(r, label(b), all);
    return {
      id: `gen-ccna-stp-port:${ring.speeds.join("-")}:${ring.bridges.map((x) => x.mac).join("|")}`,
      kind: "mcq",
      topic: "ccna",
      type: "LINK",
      difficulty: 3,
      prompt: `Three switches form a triangle. SW1 has priority 4096 (the rest default). Costs follow 802.1D short values.\n${ringText(ring)}\nWhich port does STP block?`,
      choices,
      answer,
      explain: `SW1 is root. Root path costs: ${ring.bridges.map((x) => `${x.name} ${res.pathCost[x.name]}`).join(", ")}. On the one non-tree link the end with the higher root path cost (then higher bridge ID) loses: ${label(b)}.`,
    } satisfies Question;
  },
};

export const stpPathCostGen: Generator = {
  id: "gen-ccna-stp-pathcost",
  topic: "ccna",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const ring = makeRing(r, 4);
    const res = computeStp(ring.bridges, ring.links);
    const target = ring.bridges[randInt(r, 1, 3)].name;
    return {
      id: `gen-ccna-stp-pathcost:${target}:${ring.speeds.join("-")}:${ring.bridges.map((x) => x.mac).join("|")}`,
      kind: "numeric",
      topic: "ccna",
      type: "LINK",
      difficulty: 3,
      prompt: `Four switches form a ring; SW1 is the root. Costs: 10 Mbps = 100, 100 Mbps = 19, 1 Gbps = 4.\n${ringText(ring)}\nWhat is ${target}'s root path cost?`,
      answer: res.pathCost[target],
      explain: `Compare the two ways round the ring and take the cheaper sum of port costs: ${target}'s root path cost is ${res.pathCost[target]}.`,
    } satisfies Question;
  },
};

const MODES: readonly EtherChannelMode[] = ["active", "passive", "desirable", "auto", "on"];

export const etherChannelGen: Generator = {
  id: "gen-ccna-etherchannel",
  topic: "ccna",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const wantForm = r() < 0.5;
    const pairs: [EtherChannelMode, EtherChannelMode][] = [];
    for (const a of MODES) for (const b of MODES) if (etherChannelForms(a, b) === wantForm) pairs.push([a, b]);
    const [a, b] = pairs[randInt(r, 0, pairs.length - 1)];
    const ok = etherChannelForms(a, b);
    const why = ok
      ? "the protocols match and at least one side negotiates (or both are `on`)"
      : "either the protocols differ (LACP vs PAgP), only one side is `on`, or neither side starts negotiation";
    const { choices, answer } = mcqChoices(r, ok ? "Yes, the channel forms" : "No, the channel does not form", [
      ok ? "No, the channel does not form" : "Yes, the channel forms",
      "Yes, but only after STP unblocks a port",
      "Only if the speeds are different",
    ]);
    return {
      id: `gen-ccna-etherchannel:${a}:${b}`,
      kind: "mcq",
      topic: "ccna",
      type: "LINK",
      difficulty: 2,
      prompt: `Switch A's member ports use channel-group mode ${a}; Switch B's use ${b}. Speed, duplex and VLAN settings match. Does an EtherChannel form?`,
      choices,
      answer,
      explain: `${a}/${b}: ${why}. (active/passive = LACP, desirable/auto = PAgP.)`,
    } satisfies Question;
  },
};

export const SWITCHING_GENERATORS: readonly Generator[] = [stpRootGen, stpBlockedGen, stpPathCostGen, etherChannelGen];
