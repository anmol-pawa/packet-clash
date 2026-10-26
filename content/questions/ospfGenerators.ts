/**
 * CCNA 4.3b problems: OSPF cost and path choice, DR election, EIGRP metric.
 * Every answer comes from `lib/net/ospf`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { EIGRP_INTERFACES, eigrpMetric, electDr, ospfCost, pathCost, type OspfRouter } from "@/lib/net/ospf";
import { randInt, rng, shuffled } from "@/lib/rng";

const LINKS = [
  { name: "Ethernet", mbps: 10 },
  { name: "FastEthernet", mbps: 100 },
  { name: "GigabitEthernet", mbps: 1000 },
] as const;

export const ospfCostGen: Generator = {
  id: "gen-ospf-path",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mk = (n: number) => Array.from({ length: n }, () => LINKS[randInt(r, 0, 2)]);
    const ref = [100, 1000, 10000][randInt(r, 0, 2)];
    let a = mk(randInt(r, 1, 3));
    let b = mk(randInt(r, 2, 4));
    // Tied paths make the question ambiguous; nudge one link until they differ.
    const cost = (p: readonly (typeof LINKS)[number][]) => pathCost(p.map((l) => ospfCost(l.mbps, ref)));
    for (let i = 0; cost(a) === cost(b) && i < 20; i++) b = [...b, LINKS[0]];
    if (cost(a) === cost(b)) a = [...a, LINKS[0]];
    const ca = cost(a);
    const cb = cost(b);
    const show = (p: readonly (typeof LINKS)[number][]) => p.map((l) => l.name.replace("GigabitEthernet", "GigE").replace("FastEthernet", "FastE")).join(" + ");
    const win = ca < cb ? "Path A" : "Path B";
    const { choices, answer } = mcqChoices(r, win, [win === "Path A" ? "Path B" : "Path A", "Both: equal-cost load balancing", "Neither: OSPF picks the path with fewest hops"]);
    return {
      id: `gen-ospf-path:${ref}:${show(a)}|${show(b)}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `OSPF reference bandwidth is ${ref} Mbps. Two paths reach a network.\nPath A: ${show(a)}\nPath B: ${show(b)}\nWhich does OSPF install?`,
      choices,
      answer,
      explain: `Each link costs ${ref} ÷ bandwidth (minimum 1): FastE ${ospfCost(100, ref)}, GigE ${ospfCost(1000, ref)}, Ethernet ${ospfCost(10, ref)}. Path A totals ${ca}, Path B totals ${cb}, and the lower total wins.`,
    } satisfies Question;
  },
};

const NAMES = ["R1", "R2", "R3", "R4", "R5"];

export const drElectionGen: Generator = {
  id: "gen-ospf-dr",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 3, 5);
    const ids = shuffled(r, Array.from({ length: 40 }, (_, i) => i + 1)).slice(0, n);
    const routers: OspfRouter[] = NAMES.slice(0, n).map((name, i) => ({
      name,
      routerId: `${ids[i]}.${ids[i]}.${ids[i]}.${ids[i]}`,
      priority: [0, 1, 1, 100, 200][randInt(r, 0, 4)],
    }));
    const { dr, bdr } = electDr(routers);
    const asks = r() < 0.5 && bdr ? "BDR" : "DR";
    const win = (asks === "DR" ? dr : bdr)?.name ?? "No router: all are ineligible";
    const lines = routers.map((x) => `${x.name}: router ID ${x.routerId}, priority ${x.priority}`).join("\n");
    const { choices, answer } = mcqChoices(r, win, [...routers.map((x) => x.name), "No router: all are ineligible"]);
    return {
      id: `gen-ospf-dr:${asks}:${lines.replace(/\n/g, "|")}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `These routers boot together on one Ethernet segment:\n${lines}\nWhich becomes the ${asks}?`,
      choices,
      answer,
      explain: `Priority 0 is ineligible. Among the rest the highest priority wins, with the highest router ID as the tie-break; the runner-up is the BDR. Result: DR ${dr?.name ?? "none"} (${dr?.routerId ?? "-"}), BDR ${bdr?.name ?? "none"}.`,
    } satisfies Question;
  },
};

const EIGRP_KINDS = ["Ethernet", "FastEthernet", "GigabitEthernet", "Serial"] as const;

export const eigrpMetricGen: Generator = {
  id: "gen-eigrp-metric",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const hops = Array.from({ length: randInt(r, 2, 3) }, () => EIGRP_KINDS[randInt(r, 0, 3)]);
    const bws = hops.map((h) => EIGRP_INTERFACES[h].bandwidthKbps);
    const delays = hops.map((h) => EIGRP_INTERFACES[h].delayUs);
    const metric = eigrpMetric(bws, delays);
    const minBw = Math.min(...bws);
    const totalDelay = delays.reduce((a, b) => a + b, 0);
    return {
      id: `gen-eigrp-metric:${hops.join("+")}`,
      kind: "numeric",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 3,
      prompt: `A path crosses ${hops.join(", ")} links (default bandwidth and delay: Ethernet 10000 kbps/1000 µs, FastEthernet 100000 kbps/100 µs, GigabitEthernet 1000000 kbps/10 µs, Serial 1544 kbps/20000 µs). What is the classic EIGRP metric with default K values?`,
      answer: metric,
      explain: `Lowest bandwidth ${minBw} kbps gives 10^7 ÷ ${minBw} = ${Math.floor(1e7 / minBw)}. Total delay ${totalDelay} µs ÷ 10 = ${Math.floor(totalDelay / 10)}. Metric = 256 × (${Math.floor(1e7 / minBw)} + ${Math.floor(totalDelay / 10)}) = ${metric}.`,
    } satisfies Question;
  },
};

export const OSPF_GENERATORS: readonly Generator[] = [ospfCostGen, drElectionGen, eigrpMetricGen];
