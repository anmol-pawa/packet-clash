/**
 * Load-balancing algorithms (ROADMAP 5.1): the pickers behind round robin,
 * weighted round robin, least connections and IP hash, plus modulo hashing
 * versus a consistent-hash ring with virtual nodes.
 */

export interface Backend {
  name: string;
  weight: number;
}

/** Plain round robin: request i (0-based) goes to backend i mod n. */
export function roundRobin(n: number, requests: number): number[] {
  return Array.from({ length: requests }, (_, i) => i % n);
}

/**
 * Smooth weighted round robin (the nginx algorithm): every pick adds each
 * weight to its running score, takes the highest score and subtracts the total.
 * Ties go to the earlier backend. Returns the chosen backend indexes.
 */
export function weightedRoundRobin(weights: readonly number[], requests: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const score = weights.map(() => 0);
  const out: number[] = [];
  for (let i = 0; i < requests; i++) {
    weights.forEach((w, j) => (score[j] += w));
    let best = 0;
    for (let j = 1; j < score.length; j++) if (score[j] > score[best]) best = j;
    score[best] -= total;
    out.push(best);
  }
  return out;
}

/** Least connections: the backend with the fewest active connections (ties: first). */
export function leastConnections(active: readonly number[]): number {
  return active.reduce((best, c, i) => (c < active[best] ? i : best), 0);
}

/** Weighted least connections: lowest active/weight ratio (compared by cross-multiplying). */
export function weightedLeastConnections(active: readonly number[], weights: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < active.length; i++) if (active[i] * weights[best] < active[best] * weights[i]) best = i;
  return best;
}

/** Textbook-style IP hash: sum of the four octets modulo the number of backends. */
export function ipHash(ip: string, backends: number): number {
  const sum = ip.split(".").reduce((a, o) => a + Number(o), 0);
  return sum % backends;
}

/** Power of two choices: of two sampled backends, take the one with fewer connections (ties: first). */
export function powerOfTwo(active: readonly number[], a: number, b: number): number {
  return active[b] < active[a] ? b : a;
}

/** Keys that change owner when the modulo divisor goes from `from` to `to`, for keys 0..keys-1. */
export function modMoved(keys: number, from: number, to: number): number {
  let moved = 0;
  for (let k = 0; k < keys; k++) if (k % from !== k % to) moved++;
  return moved;
}

/** 32-bit FNV-1a. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** FNV-1a followed by the murmur3 finalizer, so similar names ("s5#0", "s5#1") land far apart on the ring. */
export function ringHash(s: string): number {
  let h = fnv1a(s);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export interface RingPoint {
  pos: number;
  node: string;
}

/** Build a ring with `vnodes` points per node (`node#i` hashed onto the ring). */
export function buildRing(nodes: readonly string[], vnodes: number): RingPoint[] {
  const ring: RingPoint[] = [];
  for (const node of nodes) for (let v = 0; v < vnodes; v++) ring.push({ pos: ringHash(`${node}#${v}`), node });
  return ring.sort((a, b) => a.pos - b.pos || a.node.localeCompare(b.node));
}

/** The node owning `key`: first ring point clockwise at or after the key's hash, wrapping around. */
export function ringLookup(ring: readonly RingPoint[], key: string): string {
  const h = ringHash(key);
  return (ring.find((p) => p.pos >= h) ?? ring[0]).node;
}

/** How many of `keys` change owner when `before` becomes `after` on a consistent-hash ring. */
export function ringMoved(keys: readonly string[], before: readonly string[], after: readonly string[], vnodes: number): number {
  const a = buildRing(before, vnodes);
  const b = buildRing(after, vnodes);
  return keys.filter((k) => ringLookup(a, k) !== ringLookup(b, k)).length;
}

/** Distribution of keys across nodes (for balance checks). */
export function ringLoad(keys: readonly string[], nodes: readonly string[], vnodes: number): Record<string, number> {
  const ring = buildRing(nodes, vnodes);
  const load: Record<string, number> = Object.fromEntries(nodes.map((n) => [n, 0]));
  for (const k of keys) load[ringLookup(ring, k)]++;
  return load;
}
