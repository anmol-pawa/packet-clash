/**
 * Gym 4's routing problems: Dijkstra (least cost, first hop, settle order),
 * Bellman-Ford rounds, distance-vector convergence and count-to-infinity.
 * Every answer comes from `lib/net/routing`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import {
  RIP_INFINITY,
  afterLinkChange,
  bellmanFordRounds,
  convergenceRounds,
  dijkstra,
  leastCostPathCounts,
  nextHop,
  pathTo,
  type Edge,
  type Graph,
} from "@/lib/net/routing";
import { randInt, rng } from "@/lib/rng";

const LABELS = ["A", "B", "C", "D", "E", "F"] as const;

/** A connected 6-node graph: a random spanning tree plus 3 extra links, costs 1–9. */
function randomGraph(r: () => number): Graph {
  const edges: Edge[] = [];
  const has = (a: string, b: string) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 1; i < LABELS.length; i++) edges.push([LABELS[randInt(r, 0, i - 1)], LABELS[i], randInt(r, 1, 9)]);
  for (let extra = 0, tries = 0; extra < 3 && tries < 40; tries++) {
    const a = LABELS[randInt(r, 0, 5)];
    const b = LABELS[randInt(r, 0, 5)];
    if (a !== b && !has(a, b)) {
      edges.push([a, b, randInt(r, 1, 9)]);
      extra++;
    }
  }
  edges.sort((p, q) => (p[0] + p[1] < q[0] + q[1] ? -1 : 1));
  return { nodes: LABELS, edges };
}

/** Draw graphs until `ok` holds, so a question has exactly one right answer. */
function graphWhere(seed: number, ok: (g: Graph) => boolean): { g: Graph; r: () => number } {
  for (let attempt = 0; ; attempt++) {
    const r = rng(seed * 101 + attempt);
    const g = randomGraph(r);
    if (ok(g) || attempt > 400) return { g, r };
  }
}

const describeGraph = (g: Graph) => g.edges.map(([a, b, c]) => `${a}–${b} (${c})`).join(", ");
const pathText = (p: string[]) => p.join(" → ");

const noTies = (g: Graph) => Object.values(leastCostPathCounts(g, "A")).every((n) => n === 1);

export const leastCostGen: Generator = {
  id: "gen-least-cost",
  topic: "routing",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const { g, r } = graphWhere(seed, noTies);
    const dest = LABELS[randInt(r, 3, 5)];
    const d = dijkstra(g, "A");
    return {
      id: `gen-least-cost:${seed}:${dest}`,
      kind: "numeric",
      topic: "routing",
      type: "NETWORK",
      difficulty: 1,
      prompt: `Link costs: ${describeGraph(g)}. What is the least-cost path cost from A to ${dest}?`,
      answer: d.dist[dest],
      explain: `Dijkstra from A settles the nodes in order ${d.order.join(", ")}. The cheapest route to ${dest} is ${pathText(pathTo(d, "A", dest)!)}, total ${d.dist[dest]}.`,
    } satisfies Question;
  },
};

export const firstHopGen: Generator = {
  id: "gen-first-hop",
  topic: "routing",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const { g, r } = graphWhere(seed, (x) => noTies(x) && ["D", "E", "F"].some((n) => dijkstra(x, "A").dist[n] > 0));
    const dest = LABELS[randInt(r, 3, 5)];
    const d = dijkstra(g, "A");
    const answer = nextHop(d, "A", dest)!;
    const direct = g.edges.filter(([a, b]) => a === "A" || b === "A").map(([a, b]) => (a === "A" ? b : a));
    const mcq = mcqChoices(r, answer, direct.filter((n) => n !== answer).concat(LABELS.filter((n) => n !== "A" && !direct.includes(n))));
    return {
      id: `gen-first-hop:${seed}:${dest}`,
      kind: "mcq",
      topic: "routing",
      type: "NETWORK",
      difficulty: 2,
      prompt: `Link costs: ${describeGraph(g)}. Router A runs a link-state protocol. What is its next hop (forwarding-table entry) for traffic to ${dest}?`,
      ...mcq,
      explain: `The least-cost path A → ${dest} is ${pathText(pathTo(d, "A", dest)!)} (cost ${d.dist[dest]}), so A forwards to ${answer}. A forwarding table keeps only that first hop, not the whole path.`,
    } satisfies Question;
  },
};

export const settleOrderGen: Generator = {
  id: "gen-dijkstra-order",
  topic: "routing",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    // Distinct distances, so the settle order has no tie to break.
    const { g } = graphWhere(seed, (x) => {
      const dist = Object.values(dijkstra(x, "A").dist);
      return new Set(dist).size === dist.length;
    });
    const d = dijkstra(g, "A");
    return {
      id: `gen-dijkstra-order:${seed}`,
      kind: "order",
      topic: "routing",
      type: "NETWORK",
      difficulty: 3,
      prompt: `Link costs: ${describeGraph(g)}. Dijkstra runs from A. Put the nodes in the order they join the settled set N'.`,
      steps: d.order,
      explain: `Each step settles the unsettled node with the smallest tentative distance: ${d.order.map((n) => `${n} (${d.dist[n]})`).join(", ")}. Distances never decrease along the order, because every link cost is positive.`,
    } satisfies Question;
  },
};

export const hopLimitedGen: Generator = {
  id: "gen-hop-limited",
  topic: "routing",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    // A destination where one extra link of look-ahead beats the 2-link route.
    const { g, r } = graphWhere(seed, (x) => {
      const rounds = bellmanFordRounds(x, "A");
      return rounds.length > 3 && x.nodes.some((n) => rounds[2][n] < Infinity && rounds[2][n] > rounds[3][n]);
    });
    const rounds = bellmanFordRounds(g, "A");
    const pool = g.nodes.filter((n) => rounds[2][n] < Infinity && rounds[2][n] > rounds[3][n]);
    const from = pool.length ? pool[randInt(r, 0, pool.length - 1)] : "F";
    return {
      id: `gen-hop-limited:${seed}:${from}`,
      kind: "numeric",
      topic: "routing",
      type: "NETWORK",
      difficulty: 3,
      prompt: `Link costs: ${describeGraph(g)}. Bellman-Ford towards A, one round per extra link. What is ${from}'s cost to A after round 2 (paths of at most 2 links)?`,
      answer: rounds[2][from],
      explain: `Round h gives the cheapest cost using at most h links. After round 2 ${from} has ${rounds[2][from]}; round 3 improves it to ${rounds[3][from]}, and the tables settle at ${rounds.at(-1)![from]}.`,
    } satisfies Question;
  },
};

export const dvRoundsGen: Generator = {
  id: "gen-dv-rounds",
  topic: "routing",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const dest = LABELS[seed % LABELS.length];
    const { g } = graphWhere(seed, (x) => convergenceRounds(x, dest) >= 2);
    const rounds = bellmanFordRounds(g, dest);
    const n = convergenceRounds(g, dest);
    return {
      id: `gen-dv-rounds:${seed}:${dest}`,
      kind: "numeric",
      topic: "routing",
      type: "NETWORK",
      difficulty: 2,
      prompt: `Link costs: ${describeGraph(g)}. Routers run distance vector towards ${dest}, exchanging vectors with all neighbours in lock-step. Starting from "only ${dest} knows the way", in how many rounds does some router's distance still change (the tables settle after that many)?`,
      answer: n,
      explain: `Round by round the number of routers that know a route grows and costs shrink; the last change happens in round ${n}: ${rounds.slice(1, n + 1).map((s, i) => `round ${i + 1}: ${g.nodes.map((m) => `${m}=${s[m] === Infinity ? "∞" : s[m]}`).join(" ")}`).join("; ")}. A further round changes nothing.`,
    } satisfies Question;
  },
};

export const countToInfinityGen: Generator = {
  id: "gen-count-to-infinity",
  topic: "routing",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const w = randInt(r, 1, 3);
    const g: Graph = { nodes: ["A", "B", "C"], edges: [["A", "B", 1], ["B", "C", w]] };
    const poison = r() < 0.5;
    const out = afterLinkChange(g, "A", "A", "B", Infinity, { poison });
    return {
      id: `gen-count-to-infinity:${w}:${poison ? "pr" : "plain"}`,
      kind: "numeric",
      topic: "routing",
      type: "NETWORK",
      difficulty: 3,
      prompt: `Routers A, B and C run RIP (infinity = ${RIP_INFINITY}) in a line: A–B costs 1, B–C costs ${w}. The tables have converged on routes to A, then the A–B link fails. Updates are exchanged in lock-step${poison ? ", with poisoned reverse" : " (no split horizon)"}. In how many rounds does any table still change before B and C both show ${RIP_INFINITY}?`,
      answer: out.changes,
      explain: poison
        ? `With poisoned reverse C tells B that its route to A costs ${RIP_INFINITY} (it goes through B), so B has no loop to believe: B drops to ${RIP_INFINITY} in round 1 and C follows in round 2. ${out.changes} rounds.`
        : `Without split horizon B believes C's stale route to A (via B itself), and the two feed each other: B and C raise their cost by ${1 + w} every two rounds until the value reaches ${RIP_INFINITY}. That is the count-to-infinity problem, ${out.changes} rounds here.`,
    } satisfies Question;
  },
};

export const ROUTING_GENERATORS: readonly Generator[] = [leastCostGen, firstHopGen, settleOrderGen, hopLimitedGen, dvRoundsGen, countToInfinityGen];
