/**
 * Gym 3's addressing problems: splitting a block, VLSM, route aggregation,
 * longest-prefix match and IPv4 fragmentation. Every answer comes from
 * `lib/net/addressing`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { fragment, longestPrefixMatch, splitSubnets, vlsmAllocate, aggregate, type Route } from "@/lib/net/addressing";
import { blockSize, broadcastOf, formatCidr, formatIp, maskOf, usableHosts, type Cidr } from "@/lib/net/ipv4";
import { randInt, rng } from "@/lib/rng";

const base = (r: () => number, prefix: number): Cidr => {
  const a = [10, 172, 192][randInt(r, 0, 2)];
  const b = a === 10 ? randInt(r, 0, 255) : a === 172 ? randInt(r, 16, 31) : 168;
  const ip = ((a << 24) | (b << 16) | (randInt(r, 0, 255) << 8)) >>> 0;
  return { network: (ip & maskOf(prefix)) >>> 0, prefix };
};

export const subnetCountGen: Generator = {
  id: "gen-subnet-count",
  topic: "network",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const from = randInt(r, 16, 26);
    const to = randInt(r, from + 1, Math.min(from + 5, 30));
    const block = base(r, from);
    const n = 2 ** (to - from);
    return {
      id: `gen-subnet-count:${formatCidr(block)}:${to}`,
      kind: "numeric",
      topic: "network",
      type: "NETWORK",
      difficulty: 1,
      prompt: `You split ${formatCidr(block)} into /${to} subnets. How many subnets do you get?`,
      answer: n,
      explain: `Borrowing ${to - from} host bits (/${from} → /${to}) gives 2^${to - from} = ${n} subnets. Each has ${blockSize(to).toLocaleString("en-US")} addresses (${usableHosts(to).toLocaleString("en-US")} usable).`,
    } satisfies Question;
  },
};

export const nthSubnetGen: Generator = {
  id: "gen-nth-subnet",
  topic: "network",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const from = randInt(r, 16, 24);
    const to = randInt(r, from + 2, Math.min(from + 6, 30));
    const block = base(r, from);
    const subs = splitSubnets(block, to);
    const k = randInt(r, 2, Math.min(subs.length, 8));
    const answer = formatIp(broadcastOf(subs[k - 1]));
    const step = blockSize(to);
    const mcq = mcqChoices(r, answer, [
      formatIp(subs[k - 1].network),
      formatIp(broadcastOf(subs[k - 2])),
      formatIp((subs[k - 1].network + step - 2) >>> 0),
      formatIp(broadcastOf(subs[Math.min(k, subs.length - 1)])),
      formatIp((subs[k - 1].network + step + step - 1) >>> 0),
    ]);
    return {
      id: `gen-nth-subnet:${formatCidr(block)}:${to}:${k}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 2,
      prompt: `${formatCidr(block)} is split into equal /${to} subnets, numbered from 1 in address order. What is the broadcast address of subnet ${k}?`,
      ...mcq,
      explain: `Each /${to} is ${step.toLocaleString("en-US")} addresses long, so subnet ${k} starts at ${formatIp(subs[k - 1].network)} (${formatIp(block.network)} + ${k - 1} × ${step.toLocaleString("en-US")}) and its last address, the broadcast, is ${answer}.`,
    } satisfies Question;
  },
};

export const vlsmGen: Generator = {
  id: "gen-vlsm",
  topic: "network",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const block = base(r, 24);
    const sizes = [randInt(r, 60, 120), randInt(r, 25, 58), randInt(r, 10, 24)];
    const names = ["Sales", "Lab", "Ops"];
    const alloc = vlsmAllocate(block, sizes)!;
    const target = randInt(r, 1, 2); // ask about the 2nd or 3rd subnet (the first is trivially the block start)
    const answer = formatCidr(alloc[target].subnet);
    const wrongSizes = [alloc[target].subnet.prefix - 1, alloc[target].subnet.prefix + 1].map((p) => formatCidr({ network: alloc[target].subnet.network, prefix: p }));
    const mcq = mcqChoices(r, answer, [
      ...wrongSizes,
      formatCidr({ network: (alloc[target].subnet.network - blockSize(alloc[target].subnet.prefix)) >>> 0, prefix: alloc[target].subnet.prefix }),
      formatCidr({ network: (alloc[target].subnet.network + blockSize(alloc[target].subnet.prefix)) >>> 0, prefix: alloc[target].subnet.prefix }),
    ]);
    return {
      id: `gen-vlsm:${formatCidr(block)}:${sizes.join(",")}:${target}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 3,
      prompt: `Using VLSM (largest requirement first, blocks packed from the start), allocate ${formatCidr(block)} to ${names.map((n, i) => `${n} (${sizes[i]} hosts)`).join(", ")}. Which subnet does ${names[target]} get?`,
      ...mcq,
      explain: [...alloc.keys()]
        .sort((a, b) => alloc[b].hosts - alloc[a].hosts)
        .map((i) => `${names[i]} needs ${alloc[i].hosts} hosts → /${alloc[i].subnet.prefix} (${usableHosts(alloc[i].subnet.prefix)} usable) at ${formatCidr(alloc[i].subnet)}`)
        .join("; ") + ". Allocating the largest first keeps every block aligned on its own size.",
    } satisfies Question;
  },
};

export const aggregateGen: Generator = {
  id: "gen-aggregate",
  topic: "network",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const count = [2, 4, 8][randInt(r, 0, 2)];
    const bits = Math.log2(count);
    const p = randInt(r, 22, 26);
    const parent = base(r, p - bits);
    const blocks = splitSubnets(parent, p);
    const agg = aggregate(blocks);
    const answer = formatCidr(agg);
    const mcq = mcqChoices(r, answer, [
      formatCidr({ network: agg.network, prefix: agg.prefix + 1 }),
      formatCidr({ network: agg.network, prefix: agg.prefix - 1 }),
      formatCidr({ network: agg.network, prefix: p }),
      formatCidr({ network: (agg.network + blockSize(p)) >>> 0, prefix: agg.prefix }),
    ]);
    return {
      id: `gen-aggregate:${formatCidr(blocks[0])}:${count}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 3,
      prompt: `A router advertises ${count} contiguous /${p} routes starting at ${formatCidr(blocks[0])}. What single route summarises them exactly?`,
      ...mcq,
      explain: `${count} blocks of /${p} need ${bits} fewer prefix bits to cover them: /${p} − ${bits} = /${agg.prefix}. The summary ${answer} spans ${formatIp(agg.network)}–${formatIp(broadcastOf(agg))}, exactly the ${count} blocks. Fewer prefix bits means a shorter prefix and a bigger block.`,
    } satisfies Question;
  },
};

export const lpmGen: Generator = {
  id: "gen-lpm",
  topic: "network",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const outer = base(r, 16);
    const mid = splitSubnets(outer, 20)[randInt(r, 0, 15)];
    const inner = splitSubnets(mid, 24)[randInt(r, 0, 15)];
    const table: Route[] = [
      { prefix: { network: 0, prefix: 0 }, nextHop: "R0 (default)" },
      { prefix: outer, nextHop: "R1" },
      { prefix: mid, nextHop: "R2" },
      { prefix: inner, nextHop: "R3" },
    ];
    // Pick a destination inside one of the nested blocks.
    const level = randInt(r, 0, 3);
    const home = [{ network: 0, prefix: 0 }, outer, mid, inner][level];
    let ip: number;
    do {
      ip = level === 0 ? Math.floor(r() * 2 ** 32) : (home.network + Math.floor(r() * blockSize(home.prefix))) >>> 0;
    } while (longestPrefixMatch(table, ip)?.nextHop !== table[level].nextHop);
    const best = longestPrefixMatch(table, ip)!;
    const answer = best.nextHop;
    const mcq = mcqChoices(r, answer, table.map((t) => t.nextHop));
    return {
      id: `gen-lpm:${formatCidr(outer)}:${formatIp(mid.network)}:${formatIp(inner.network)}:${formatIp(ip)}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 2,
      prompt: `A router's table: 0.0.0.0/0 → R0 (default); ${table.slice(1).map((t) => `${formatCidr(t.prefix)} → ${t.nextHop}`).join("; ")}. Where does it forward a packet to ${formatIp(ip)}?`,
      ...mcq,
      explain: `${table.filter((t) => ((ip & maskOf(t.prefix.prefix)) >>> 0) === t.prefix.network).map((t) => `/${t.prefix.prefix} (${t.nextHop})`).join(", ")} match. Routers pick the longest matching prefix, the most specific route: ${formatCidr(best.prefix)} → ${answer}.`,
    } satisfies Question;
  },
};

export const fragmentGen: Generator = {
  id: "gen-fragments",
  topic: "network",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const mtu = [576, 1000, 1280, 1500][randInt(r, 0, 3)];
    const total = randInt(r, 2 * mtu, 5 * mtu);
    const frags = fragment(total, mtu);
    const askOffset = r() < 0.5;
    const last = frags[frags.length - 1];
    const per = frags[0].totalLength - 20;
    return {
      id: `gen-fragments:${total}:${mtu}:${askOffset ? "offset" : "count"}`,
      kind: "numeric",
      topic: "network",
      type: "NETWORK",
      difficulty: 3,
      prompt: askOffset
        ? `A ${total}-byte IPv4 datagram (20-byte header) crosses a link with MTU ${mtu}. What is the fragment offset field of the last fragment?`
        : `A ${total}-byte IPv4 datagram (20-byte header) crosses a link with MTU ${mtu}. Into how many fragments is it split?`,
      answer: askOffset ? last.offset : frags.length,
      explain: `Data = ${total} − 20 = ${total - 20} bytes. Each fragment carries at most ⌊(${mtu} − 20) / 8⌋ × 8 = ${per} data bytes (offsets count 8-byte units). ${total - 20} ÷ ${per} needs ${frags.length} fragments; the last starts at byte ${last.offset * 8}, so its offset field is ${last.offset * 8} ÷ 8 = ${last.offset}.`,
    } satisfies Question;
  },
};

export const ADDRESS_GENERATORS: readonly Generator[] = [subnetCountGen, nthSubnetGen, vlsmGen, aggregateGen, lpmGen, fragmentGen];
