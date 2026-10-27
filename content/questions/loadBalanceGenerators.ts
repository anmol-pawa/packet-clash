/**
 * 5.1 load-balancing problems: weighted round robin picks, least connections,
 * IP hash, and how many keys move when modulo hashing or a consistent-hash ring
 * gains a node. Answers come from `lib/net/loadbalance`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { ipHash, leastConnections, modMoved, ringMoved, weightedRoundRobin } from "@/lib/net/loadbalance";
import { randInt, rng } from "@/lib/rng";

const base = { topic: "interview", type: "APPLICATION" } as const;
const NAMES = ["A", "B", "C", "D"] as const;

export const wrrGen: Generator = {
  id: "gen-sde-wrr",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 2, 3);
    const weights = Array.from({ length: n }, () => randInt(r, 1, 5));
    const total = weights.reduce((a, b) => a + b, 0);
    const seq = weightedRoundRobin(weights, total);
    const counts = weights.map((_, j) => seq.filter((x) => x === j).length);
    const j = randInt(r, 0, n - 1);
    const spec = weights.map((w, i) => `${NAMES[i]}=${w}`).join(", ");
    return {
      id: `gen-sde-wrr:${spec}:${j}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A weighted round-robin balancer has backends with weights ${spec}. Over one full cycle of ${total} requests, how many go to backend ${NAMES[j]}?`,
      answer: counts[j],
      explain: `Over a full cycle each backend receives exactly its weight in requests: ${NAMES[j]} gets ${counts[j]} of ${total}. (Smooth WRR only changes the order, e.g. ${seq.map((x) => NAMES[x]).join("")}, so the heavy backend is not hit in one burst.)`,
    } satisfies Question;
  },
};

export const leastConnGen: Generator = {
  id: "gen-sde-leastconn",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 3, 4);
    let active: number[];
    do active = Array.from({ length: n }, () => randInt(r, 0, 40));
    while (new Set(active).size !== n);
    const best = leastConnections(active);
    const right = `Backend ${NAMES[best]}`;
    const wrong = NAMES.slice(0, n).filter((_, i) => i !== best).map((x) => `Backend ${x}`);
    const { choices, answer } = mcqChoices(r, right, [...wrong, "Round robin decides, so any of them"]);
    return {
      id: `gen-sde-leastconn:${active.join(",")}:${choices.join("|")}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `A least-connections balancer sees these active connections: ${active.map((c, i) => `${NAMES[i]}=${c}`).join(", ")}. Where does the next new connection go?`,
      choices,
      answer,
      explain: `Least connections picks the backend with the fewest active connections: ${right} (${active[best]}). It adapts to long-lived or uneven requests, which plain round robin ignores.`,
    } satisfies Question;
  },
};

export const ipHashGen: Generator = {
  id: "gen-sde-iphash",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 3, 5);
    const ip = `10.${randInt(r, 0, 30)}.${randInt(r, 0, 99)}.${randInt(r, 1, 250)}`;
    const idx = ipHash(ip, n);
    return {
      id: `gen-sde-iphash:${ip}:${n}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `An IP-hash balancer with ${n} backends numbered 0 to ${n - 1} uses (sum of the four octets) mod ${n}. Which backend gets a client at ${ip}?`,
      answer: idx,
      explain: `${ip.split(".").join(" + ")} = ${ip.split(".").reduce((a, o) => a + Number(o), 0)}, and that mod ${n} is ${idx}. The same client always lands on the same backend (a cheap form of stickiness), but changing ${n} remaps most clients.`,
    } satisfies Question;
  },
};

export const modMovedGen: Generator = {
  id: "gen-sde-modmoved",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const from = randInt(r, 3, 6);
    const keys = from * (from + 1) * randInt(r, 1, 3);
    const moved = modMoved(keys, from, from + 1);
    return {
      id: `gen-sde-modmoved:${keys}:${from}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `Keys 0 to ${keys - 1} are placed on servers with key mod N. A server is added, so N goes from ${from} to ${from + 1}. How many keys now map to a different server?`,
      answer: moved,
      explain: `Counting keys where k mod ${from} ≠ k mod ${from + 1} gives ${moved} of ${keys}. Only about 1/${from + 1} of keys keep their server, which is why modulo hashing makes caches go cold on resize; a consistent-hash ring moves only about 1/${from + 1} of them.`,
    } satisfies Question;
  },
};

export const ringMovedGen: Generator = {
  id: "gen-sde-ringmoved",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 3, 5);
    const nodes = Array.from({ length: n }, (_, i) => `s${i + 1}`);
    const keys = Array.from({ length: 200 }, (_, i) => `key-${seed % 1000}-${i}`);
    const moved = ringMoved(keys, nodes, [...nodes, `s${n + 1}`], 50);
    const mod = modMoved(200, n, n + 1);
    const right = moved < mod ? "The ring" : "Modulo hashing";
    const { choices, answer } = mcqChoices(r, right, ["Both move the same number of keys", right === "The ring" ? "Modulo hashing" : "The ring", "Neither: adding a server never moves keys", "Only the new server's keys, for both"]);
    return {
      id: `gen-sde-ringmoved:${seed}:${n}`,
      kind: "mcq",
      ...base,
      difficulty: 3,
      prompt: `200 keys sit on ${n} servers, then a ${n + 1}th joins. Which scheme moves fewer keys: a consistent-hash ring (50 virtual nodes each) or key mod N?`,
      choices,
      answer,
      explain: `Simulated: the ring moved ${moved} of 200 keys, mod N moved ${mod}. On a ring a new node only takes the arcs just before its points (about 1/${n + 1} of the keys, all moving *to* the new node); with mod N almost every key changes server.`,
    } satisfies Question;
  },
};

export const LOADBALANCE_GENERATORS: readonly Generator[] = [wrrGen, leastConnGen, ipHashGen, modMovedGen, ringMovedGen];
