/**
 * Routing solvers: Dijkstra (link state), Bellman-Ford rounds (distance
 * vector) and a synchronous distance-vector simulation with link changes,
 * count-to-infinity and poisoned reverse. `content/questions/routingGenerators.ts`
 * is answered by these; tests check them against Kurose & Ross §5.2–5.3.
 */

export type Edge = readonly [a: string, b: string, cost: number];

export interface Graph {
  nodes: readonly string[];
  /** Undirected links with positive costs. */
  edges: readonly Edge[];
}

/** RIP's "infinity": a route this costly is unreachable. */
export const RIP_INFINITY = 16;

export const neighbors = (g: Graph, n: string): { node: string; cost: number }[] =>
  g.edges.flatMap(([a, b, c]) => (a === n ? [{ node: b, cost: c }] : b === n ? [{ node: a, cost: c }] : [])).sort((x, y) => (x.node < y.node ? -1 : 1));

export interface Dijkstra {
  dist: Record<string, number>;
  /** Predecessor on the least-cost path (absent for the source and unreachable nodes). */
  prev: Record<string, string>;
  /** The order nodes join N' (the settled set); ties go to the lowest label. */
  order: string[];
}

/** Dijkstra's link-state algorithm from `source`. Unreachable nodes get `Infinity`. */
export function dijkstra(g: Graph, source: string): Dijkstra {
  const dist: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n, Infinity]));
  const prev: Record<string, string> = {};
  const done = new Set<string>();
  const order: string[] = [];
  dist[source] = 0;
  for (;;) {
    let u: string | null = null;
    for (const n of g.nodes) if (!done.has(n) && dist[n] < Infinity && (u === null || dist[n] < dist[u] || (dist[n] === dist[u] && n < u))) u = n;
    if (u === null) break;
    done.add(u);
    order.push(u);
    for (const { node, cost } of neighbors(g, u)) {
      if (!done.has(node) && dist[u] + cost < dist[node]) {
        dist[node] = dist[u] + cost;
        prev[node] = u;
      }
    }
  }
  return { dist, prev, order };
}

/** The least-cost path source → dest as node labels, or null when unreachable. */
export function pathTo(d: Dijkstra, source: string, dest: string): string[] | null {
  if (d.dist[dest] === Infinity) return null;
  const path = [dest];
  while (path[0] !== source) path.unshift(d.prev[path[0]]);
  return path;
}

/** The first hop out of `source` towards `dest` (the forwarding-table entry). */
export function nextHop(d: Dijkstra, source: string, dest: string): string | null {
  const p = pathTo(d, source, dest);
  return p && p.length > 1 ? p[1] : null;
}

/** How many distinct least-cost paths run source → each node (1 means the path is unique). */
export function leastCostPathCounts(g: Graph, source: string): Record<string, number> {
  const { dist, order } = dijkstra(g, source);
  const count: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n, 0]));
  count[source] = 1;
  for (const u of order) {
    for (const { node, cost } of neighbors(g, u)) if (dist[u] + cost === dist[node]) count[node] += count[u];
  }
  return count;
}

/**
 * Bellman-Ford as synchronous rounds: `rounds[h][n]` is the least cost from `n`
 * to `dest` using at most `h` links (round 0 knows only the destination).
 * Stops after the first round that changes nothing.
 */
export function bellmanFordRounds(g: Graph, dest: string): Record<string, number>[] {
  let cur: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n, n === dest ? 0 : Infinity]));
  const rounds = [cur];
  for (let h = 1; h <= g.nodes.length; h++) {
    const next = { ...cur };
    for (const n of g.nodes) {
      for (const { node, cost } of neighbors(g, n)) next[n] = Math.min(next[n], cost + cur[node]);
    }
    rounds.push(next);
    if (g.nodes.every((n) => next[n] === cur[n])) break;
    cur = next;
  }
  return rounds;
}

/** Rounds of exchange that still change some node's distance before the tables settle. */
export const convergenceRounds = (g: Graph, dest: string): number => bellmanFordRounds(g, dest).length - 2;

export interface DvState {
  dist: Record<string, number>;
  /** Each node's next hop towards the destination (null at the destination or when unreachable). */
  next: Record<string, string | null>;
}

export interface DvOptions {
  /** Poisoned reverse: tell a neighbour the route through it costs infinity. */
  poison?: boolean;
  infinity?: number;
  /** Start from this state instead of "only the destination is known". */
  start?: DvState;
  maxRounds?: number;
}

/**
 * Synchronous distance-vector towards one destination. Every round each node
 * recomputes dist[n] = min over neighbours m of cost(n,m) + advertised(m),
 * using the neighbours' previous-round values; anything ≥ infinity is
 * unreachable. Returns the state after every round (index 0 is the start) and
 * how many rounds changed something.
 */
export function distanceVector(g: Graph, dest: string, o: DvOptions = {}): { history: DvState[]; changes: number } {
  const INF = o.infinity ?? RIP_INFINITY;
  let cur: DvState = o.start ?? {
    dist: Object.fromEntries(g.nodes.map((n) => [n, n === dest ? 0 : INF])),
    next: Object.fromEntries(g.nodes.map((n) => [n, null])),
  };
  const history = [cur];
  let changes = 0;
  for (let r = 0; r < (o.maxRounds ?? 200); r++) {
    const dist = { ...cur.dist };
    const next = { ...cur.next };
    for (const n of g.nodes) {
      if (n === dest) continue;
      let best = INF;
      let via: string | null = null;
      for (const { node: m, cost } of neighbors(g, n)) {
        const adv = o.poison && cur.next[m] === n ? INF : cur.dist[m];
        const total = Math.min(INF, cost + adv);
        if (total < best || (total === best && total < INF && via !== null && cur.next[n] === m)) {
          best = total;
          via = m;
        }
      }
      dist[n] = best;
      next[n] = best >= INF ? null : via;
    }
    const changed = g.nodes.some((n) => dist[n] !== cur.dist[n] || next[n] !== cur.next[n]);
    if (!changed) break;
    changes++;
    cur = { dist, next };
    history.push(cur);
  }
  return { history, changes };
}

/** Change (or, with `cost` ≥ `Infinity`, remove) one link's cost. */
export function withCost(g: Graph, a: string, b: string, cost: number): Graph {
  const edges = g.edges.flatMap((e): Edge[] => {
    const hit = (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a);
    return !hit ? [e] : cost === Infinity ? [] : [[e[0], e[1], cost]];
  });
  return { nodes: g.nodes, edges };
}

/**
 * Converge on `g`, then change one link and keep exchanging: the classic
 * count-to-infinity set-up. `changes` is the number of rounds after the change
 * until every table is stable again.
 */
export function afterLinkChange(g: Graph, dest: string, a: string, b: string, cost: number, o: Omit<DvOptions, "start"> = {}): { history: DvState[]; changes: number } {
  const settled = distanceVector(g, dest, o).history.at(-1)!;
  return distanceVector(withCost(g, a, b, cost), dest, { ...o, start: settled });
}
