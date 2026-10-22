import { describe, expect, it } from "vitest";
import { acceptsAsPath, afterLinkChange, asPaths, bellmanFordRounds, convergenceRounds, dijkstra, dijkstraSteps, distanceVector, leastCostPathCounts, nextHop, pathTo, withCost, type Graph } from "@/lib/net/routing";
import { ROUTING_GENERATORS, countToInfinityGen, dvRoundsGen, firstHopGen, hopLimitedGen, leastCostGen, settleOrderGen } from "@/content/questions/routingGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, type McqQuestion, type NumericQuestion, type OrderQuestion } from "@/game/engine/questions";
// Kurose & Ross Fig. 5.3 (§5.2): nodes u v w x y z.
const KR: Graph = {
  nodes: ["u", "v", "w", "x", "y", "z"],
  edges: [["u", "v", 2], ["u", "x", 1], ["u", "w", 5], ["v", "x", 2], ["v", "w", 3], ["w", "x", 3], ["w", "y", 1], ["x", "y", 1], ["y", "z", 2], ["w", "z", 5]],
};

// Kurose & Ross Fig. 5.6 (§5.2.2): x–y 2, x–z 7, y–z 1.
const XYZ: Graph = { nodes: ["x", "y", "z"], edges: [["x", "y", 2], ["x", "z", 7], ["y", "z", 1]] };

// A – B – C in a line, every link cost 1.
const LINE: Graph = { nodes: ["A", "B", "C"], edges: [["A", "B", 1], ["B", "C", 1]] };

describe("Dijkstra", () => {
  it("matches the Kurose & Ross least-cost tree from u", () => {
    const d = dijkstra(KR, "u");
    expect(d.dist).toEqual({ u: 0, v: 2, w: 3, x: 1, y: 2, z: 4 });
    expect(pathTo(d, "u", "z")).toEqual(["u", "x", "y", "z"]);
    expect(pathTo(d, "u", "w")).toEqual(["u", "x", "y", "w"]);
    expect(nextHop(d, "u", "z")).toBe("x");
    expect(nextHop(d, "u", "u")).toBeNull();
  });

  it("settles nodes in non-decreasing distance order", () => {
    const d = dijkstra(KR, "u");
    expect(d.order[0]).toBe("u");
    expect(d.order.map((n) => d.dist[n])).toEqual([0, 1, 2, 2, 3, 4]);
    expect(d.order.at(-1)).toBe("z");
  });

  it("reports unreachable nodes as Infinity with no path", () => {
    const g: Graph = { nodes: ["a", "b", "c"], edges: [["a", "b", 3]] };
    const d = dijkstra(g, "a");
    expect(d.dist.c).toBe(Infinity);
    expect(pathTo(d, "a", "c")).toBeNull();
    expect(d.order).toEqual(["a", "b"]);
  });

  it("counts least-cost paths (ties make the next hop ambiguous)", () => {
    const counts = leastCostPathCounts(KR, "u");
    expect(counts.x).toBe(1);
    expect(counts.y).toBe(1); // u–x–y = 2; u–v–x–y = 5
    expect(counts.z).toBe(1);
    const diamond: Graph = { nodes: ["a", "b", "c", "d"], edges: [["a", "b", 1], ["a", "c", 1], ["b", "d", 1], ["c", "d", 1]] };
    expect(leastCostPathCounts(diamond, "a").d).toBe(2);
  });
});

describe("Bellman-Ford rounds", () => {
  it("reproduces Kurose & Ross's x–y–z distance-vector example", () => {
    const rounds = bellmanFordRounds(XYZ, "z");
    expect(rounds[0]).toEqual({ x: Infinity, y: Infinity, z: 0 });
    expect(rounds[1]).toEqual({ x: 7, y: 1, z: 0 }); // one link: direct costs only
    expect(rounds[2]).toEqual({ x: 3, y: 1, z: 0 }); // x learns y's cost: 2 + 1 = 3 < 7
    expect(convergenceRounds(XYZ, "z")).toBe(2);
  });

  it("round h is the least cost using at most h links", () => {
    const r = bellmanFordRounds(KR, "z");
    expect(r[1].y).toBe(2);
    expect(r[1].u).toBe(Infinity);
    expect(r[2].x).toBe(3); // x–y–z
    expect(r[3].u).toBe(4); // u–x–y–z
    expect(r.at(-2)).toEqual({ u: 4, v: 5, w: 3, x: 3, y: 2, z: 0 });
  });

  it("agrees with Dijkstra at convergence", () => {
    for (const dest of KR.nodes) {
      const last = bellmanFordRounds(KR, dest).at(-1)!;
      expect(last).toEqual(dijkstra(KR, dest).dist);
    }
  });

  it("converges in as many rounds as the longest least-cost path has links (a line of 3)", () => {
    expect(convergenceRounds(LINE, "A")).toBe(2);
    expect(convergenceRounds(LINE, "B")).toBe(1);
  });
});

describe("distance vector and count-to-infinity", () => {
  it("settles on the shortest routes with next hops", () => {
    const { history } = distanceVector(XYZ, "z");
    const last = history.at(-1)!;
    expect(last.dist).toEqual({ x: 3, y: 1, z: 0 });
    expect(last.next).toEqual({ x: "y", y: "z", z: null });
  });

  it("withCost changes or removes a link", () => {
    expect(withCost(LINE, "A", "B", 5).edges[0]).toEqual(["A", "B", 5]);
    expect(withCost(LINE, "B", "A", Infinity).edges).toEqual([["B", "C", 1]]);
  });

  it("counts to infinity when A–B fails (hand-derived rounds, RIP infinity 16)", () => {
    const { history, changes } = afterLinkChange(LINE, "A", "A", "B", Infinity);
    // before: B=1, C=2. Each round uses the neighbours' previous values.
    expect(history.slice(0, 5).map((s) => [s.dist.B, s.dist.C])).toEqual([[1, 2], [3, 2], [3, 4], [5, 4], [5, 6]]);
    expect(history.at(-1)!.dist).toEqual({ A: 0, B: 16, C: 16 });
    expect(history.at(-1)!.next).toEqual({ A: null, B: null, C: null });
    expect(changes).toBe(15);
  });

  it("poisoned reverse stops the two-node loop in two rounds", () => {
    const { history, changes } = afterLinkChange(LINE, "A", "A", "B", Infinity, { poison: true });
    expect(history[1].dist).toEqual({ A: 0, B: 16, C: 2 }); // C advertised infinity to B
    expect(history.at(-1)!.dist).toEqual({ A: 0, B: 16, C: 16 });
    expect(changes).toBe(2);
  });

  it("good news travels fast: a cheaper link is learned in a round per hop", () => {
    const g: Graph = { nodes: ["A", "B", "C"], edges: [["A", "B", 9], ["B", "C", 1]] };
    const { history, changes } = afterLinkChange(g, "A", "A", "B", 1);
    expect(history.at(-1)!.dist).toEqual({ A: 0, B: 1, C: 2 });
    expect(changes).toBe(2);
  });
});

describe("routing generators", () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
  const parseGraph = (prompt: string): Graph => {
    const edges = [...prompt.matchAll(/([A-F])–([A-F]) \((\d)\)/g)].map((m): [string, string, number] => [m[1], m[2], Number(m[3])]);
    return { nodes: ["A", "B", "C", "D", "E", "F"], edges };
  };

  it("are registered on gym 4's chapter", () => {
    expect(ROUTING_GENERATORS.map((g) => g.id)).toHaveLength(6);
    for (const g of ROUTING_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("routing");
    }
  });

  it("least cost is recomputed independently from the printed graph", () => {
    for (const s of SEEDS) {
      const q = leastCostGen.generate(s) as NumericQuestion;
      const dest = q.id.split(":")[2];
      const g = parseGraph(q.prompt);
      expect(bellmanFordRounds(g, "A").at(-1)![dest]).toBe(q.answer);
    }
  });

  it("first hop is unambiguous and is the first node of the unique cheapest path", () => {
    for (const s of SEEDS) {
      const q = firstHopGen.generate(s) as McqQuestion;
      const dest = q.id.split(":")[2];
      const g = parseGraph(q.prompt);
      expect(leastCostPathCounts(g, "A")[dest]).toBe(1);
      const hop = q.choices[q.answer];
      const cost = g.edges.find(([a, b]) => (a === "A" && b === hop) || (b === "A" && a === hop))![2];
      expect(cost + dijkstra(g, hop).dist[dest]).toBe(dijkstra(g, "A").dist[dest]);
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it("settle order has strictly increasing distances", () => {
    for (const s of SEEDS) {
      const q = settleOrderGen.generate(s) as OrderQuestion;
      const d = dijkstra(parseGraph(q.prompt), "A").dist;
      const ds = q.steps.map((n) => d[n]);
      expect(ds).toEqual([...ds].sort((a, b) => a - b));
      expect(new Set(ds).size).toBe(6);
      expect(q.steps[0]).toBe("A");
    }
  });

  it("hop-limited cost is a true at-most-2-links minimum (brute force) and improves later", () => {
    for (const s of SEEDS) {
      const q = hopLimitedGen.generate(s) as NumericQuestion;
      const from = q.id.split(":")[2];
      const g = parseGraph(q.prompt);
      const w = (a: string, b: string) => g.edges.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2];
      let best = Infinity;
      if (w(from, "A")) best = w(from, "A")!;
      for (const m of g.nodes) if (w(from, m) && w(m, "A")) best = Math.min(best, w(from, m)! + w(m, "A")!);
      expect(q.answer).toBe(best);
      expect(bellmanFordRounds(g, "A").at(-1)![from]).toBeLessThan(best);
    }
  });

  it("distance-vector rounds equal the most links on any node's cheapest path", () => {
    for (const s of SEEDS) {
      const q = dvRoundsGen.generate(s) as NumericQuestion;
      const dest = q.id.split(":")[2];
      const g = parseGraph(q.prompt);
      // exhaustive search: the most links any node needs on its fewest-link least-cost path
      const dist = dijkstra(g, dest).dist;
      const fewest: Record<string, number> = {};
      const walk = (n: string, path: string[], cost: number) => {
        if (n === dest) {
          if (cost === dist[path[0]]) fewest[path[0]] = Math.min(fewest[path[0]] ?? Infinity, path.length - 1);
          return;
        }
        for (const [a, b, c] of g.edges) {
          const m = a === n ? b : b === n ? a : null;
          if (m && !path.includes(m)) walk(m, [...path, m], cost + c);
        }
      };
      for (const n of g.nodes) if (n !== dest) walk(n, [n], 0);
      expect(q.answer).toBe(Math.max(...Object.values(fewest)));
      expect(q.answer).toBe(convergenceRounds(g, dest));
      expect(q.answer).toBeGreaterThanOrEqual(2);
    }
  });

  it("count-to-infinity: poisoned reverse takes 2 rounds, plain takes many more", () => {
    for (const s of SEEDS) {
      const q = countToInfinityGen.generate(s) as NumericQuestion;
      if (q.id.endsWith(":pr")) expect(q.answer).toBe(2);
      else expect(q.answer).toBeGreaterThanOrEqual(5);
      expect(answerText(q)).toBe(String(q.answer));
    }
  });
});

describe("Dijkstra table and AS paths", () => {
  it("reproduces the Kurose & Ross Table 5.1 rows (the v/y tie settles v first)", () => {
    const steps = dijkstraSteps(KR, "u");
    expect(steps.map((s) => s.settled.join(""))).toEqual(["u", "ux", "uxv", "uxvy", "uxvyw", "uxvywz"]);
    expect(steps[0].dist).toEqual({ u: 0, v: 2, w: 5, x: 1, y: Infinity, z: Infinity });
    expect(steps[1].dist).toMatchObject({ v: 2, w: 4, y: 2, z: Infinity });
    expect(steps[1].prev).toMatchObject({ w: "x", y: "x" });
    expect(steps[3].dist).toMatchObject({ w: 3, z: 4 });
    expect(steps[3].prev).toMatchObject({ w: "y", z: "y" });
    expect(steps.at(-1)!.dist).toEqual(dijkstra(KR, "u").dist);
  });

  it("builds the AS_PATH by prepending and rejects a path containing the receiver's own AS", () => {
    expect(asPaths([1, 2, 3, 4])).toEqual([[1], [2, 1], [3, 2, 1], [4, 3, 2, 1]]);
    expect(acceptsAsPath(4, [3, 2, 1])).toBe(true);
    expect(acceptsAsPath(1, [4, 3, 2, 1])).toBe(false);
  });
});
