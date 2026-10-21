/**
 * Gym 2's switching problems: the self-learning switch (how many frames flood,
 * where the last frame goes), STP root election and blocked links, and VLAN
 * broadcast domains. Every answer comes from `lib/net/switching`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { BROADCAST, blockedLinks, electRoot, simulateSwitch, vlanDomains, type Frame } from "@/lib/net/switching";
import { randInt, rng } from "@/lib/rng";

const HOSTS = ["A", "B", "C", "D"] as const;
const portsText = (ps: number[]) => (ps.length === 0 ? "No port (dropped)" : ps.length === 1 ? `Port ${ps[0]} only` : `Ports ${ps.join(", ")}`);

/** Random hosts → ports (sharing allowed, as behind a hub) and 4 frames between them. */
function scenario(r: () => number): { ports: number; frames: Frame[]; where: Record<string, number> } {
  const ports = 4;
  const where: Record<string, number> = {};
  for (const h of HOSTS) where[h] = randInt(r, 1, ports);
  const frames: Frame[] = [];
  for (let i = 0; i < 4; i++) {
    const src = HOSTS[randInt(r, 0, 3)];
    let dst: string = HOSTS[randInt(r, 0, 3)];
    if (dst === src) dst = HOSTS[(HOSTS.indexOf(src) + 1) % 4];
    if (r() < 0.12) dst = BROADCAST;
    frames.push({ src, dst, inPort: where[src] });
  }
  return { ports, frames, where };
}

const describe = (where: Record<string, number>) => HOSTS.map((h) => `${h} on port ${where[h]}`).join(", ");
const seq = (frames: Frame[]) => frames.map((f, i) => `${i + 1}. ${f.src} → ${f.dst === BROADCAST ? "broadcast" : f.dst}`).join("; ");

export const macFloodGen: Generator = {
  id: "gen-mac-flood",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const { ports, frames, where } = scenario(r);
    const steps = simulateSwitch(ports, frames);
    const flooded = steps.filter((s) => s.action === "flood").length;
    return {
      id: `gen-mac-flood:${seed}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `A 4-port learning switch starts with an empty MAC table. Hosts: ${describe(where)}. Frames arrive in order: ${seq(frames)}. How many of the 4 frames does the switch flood?`,
      answer: flooded,
      explain: steps
        .map((s, i) => `Frame ${i + 1}: learns ${s.frame.src} → port ${s.frame.inPort}; ${s.action === "flood" ? `${s.frame.dst === BROADCAST ? "broadcast" : `${s.frame.dst} is unknown`}, so it floods` : s.action === "forward" ? `${s.frame.dst} is on port ${s.outPorts[0]}, so it forwards there` : `${s.frame.dst} is on the arrival port, so it filters`}.`)
        .join(" ") + ` Flooded: ${flooded}.`,
    } satisfies Question;
  },
};

export const macLastFrameGen: Generator = {
  id: "gen-mac-last-frame",
  topic: "link",
  type: "LINK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const { ports, frames, where } = scenario(r);
    const steps = simulateSwitch(ports, frames);
    const last = steps[steps.length - 1];
    const answer = portsText(last.outPorts);
    const options = new Set<string>();
    for (let p = 1; p <= ports; p++) options.add(portsText([p]));
    options.add(portsText([1, 2, 3, 4].filter((p) => p !== last.frame.inPort)));
    options.add(portsText([]));
    const distractors = [...options].filter((o) => o !== answer);
    const mcq = mcqChoices(r, answer, distractors.slice(0, 3));
    return {
      id: `gen-mac-last-frame:${seed}`,
      kind: "mcq",
      topic: "link",
      type: "LINK",
      difficulty: 3,
      prompt: `A 4-port learning switch starts with an empty MAC table. Hosts: ${describe(where)}. Frames arrive in order: ${seq(frames)}. Where does the switch send frame 4?`,
      ...mcq,
      explain: `After learning, the table is ${Object.entries(last.table).map(([m, p]) => `${m}→${p}`).join(", ")}. Frame 4 is ${last.frame.src} → ${last.frame.dst === BROADCAST ? "broadcast" : last.frame.dst} arriving on port ${last.frame.inPort}: ${last.action === "flood" ? "broadcast or unknown destinations flood out every port except the arrival port" : last.action === "forward" ? "a known destination gets the frame on its own port only" : "the destination is behind the arrival port, so the switch filters (drops) the frame"}.`,
    } satisfies Question;
  },
};

export const stpRootGen: Generator = {
  id: "gen-stp-root",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 4, 5);
    const priorities = [4096, 8192, 16384, 32768];
    const names = ["S1", "S2", "S3", "S4", "S5"].slice(0, n);
    const macs = new Set<string>();
    while (macs.size < n) macs.add(Array.from({ length: 4 }, () => randInt(r, 0x10, 0xff).toString(16).padStart(2, "0")).join(""));
    const bridges = [...macs].map((m) => ({ priority: priorities[randInt(r, 0, 3)], mac: m }));
    const root = electRoot(bridges);
    const list = names.map((s, i) => `${s} (priority ${bridges[i].priority}, MAC …${bridges[i].mac})`).join("; ");
    const mcq = mcqChoices(r, names[root], names.filter((_, i) => i !== root));
    return {
      id: `gen-stp-root:${seed}`,
      kind: "mcq",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `Spanning Tree runs on these switches: ${list}. Which becomes the root bridge?`,
      ...mcq,
      explain: `The root is the switch with the lowest bridge ID, which is the priority first and the MAC address as the tie-breaker. Here that is ${names[root]} (priority ${bridges[root].priority}, MAC …${bridges[root].mac}). Priority is a multiple of 4096 with default 32768.`,
    } satisfies Question;
  },
};

export const stpBlockedGen: Generator = {
  id: "gen-stp-blocked",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 3, 8);
    const extra = randInt(r, 1, 4);
    const links = n - 1 + extra;
    const blocked = blockedLinks(n, links);
    return {
      id: `gen-stp-blocked:${n}:${links}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `${n} switches are connected by ${links} links (every switch can reach every other). After Spanning Tree converges, how many links carry no traffic because a port is blocking?`,
      answer: blocked,
      explain: `STP builds a loop-free tree. A tree over ${n} switches uses ${n} − 1 = ${n - 1} links, so the other ${links} − ${n - 1} = ${blocked} links are blocked (each has one blocking port, ready to take over if an active link fails).`,
    } satisfies Question;
  },
};

export const vlanGen: Generator = {
  id: "gen-vlan-domains",
  topic: "link",
  type: "LINK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const vlans = [10, 20, 30, 40, 50];
    const sw = [0, 1].map(() => Array.from({ length: randInt(r, 3, 6) }, () => vlans[randInt(r, 0, 3)]));
    const answer = vlanDomains(sw);
    return {
      id: `gen-vlan-domains:${sw.map((s) => s.join(".")).join("|")}`,
      kind: "numeric",
      topic: "link",
      type: "LINK",
      difficulty: 2,
      prompt: `Two switches are joined by an 802.1Q trunk. Switch 1's access ports are in VLANs ${sw[0].join(", ")}; switch 2's are in VLANs ${sw[1].join(", ")}. Nothing routes between VLANs. How many broadcast domains exist?`,
      answer,
      explain: `Each VLAN is its own broadcast domain, and the trunk carries them (tagged) without merging them, so the count is the number of distinct VLAN IDs across both switches: ${[...new Set(sw.flat())].sort((a, b) => a - b).join(", ")} → ${answer}. Hosts in different VLANs need a router (or layer-3 switch) to talk.`,
    } satisfies Question;
  },
};

export const SWITCH_GENERATORS: readonly Generator[] = [macFloodGen, macLastFrameGen, stpRootGen, stpBlockedGen, vlanGen];
