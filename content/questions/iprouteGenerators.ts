/**
 * CCNA 4.3a problems: which route IOS uses and what a floating static route
 * needs. Every answer comes from `lib/net/iproute`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { ADMIN_DISTANCE, floatingAd, route, selectRoute, showRouteLine, type Route, type RouteSource } from "@/lib/net/iproute";
import { formatCidr, formatIp, maskOf } from "@/lib/net/ipv4";
import { randInt, rng, shuffled } from "@/lib/rng";

const SOURCES: readonly { source: RouteSource; name: string }[] = [
  { source: "static", name: "static" },
  { source: "eigrp", name: "EIGRP" },
  { source: "ospf", name: "OSPF" },
  { source: "rip", name: "RIP" },
];

/** A routing table with nested prefixes around a destination, all from different sources. */
function table(seed: number): { routes: Route[]; dest: number; destText: string } {
  const r = rng(seed);
  const a = randInt(r, 10, 172);
  const b = randInt(r, 0, 200);
  const c = randInt(r, 0, 200);
  const dest = ((a << 24) | (b << 16) | (c << 8) | randInt(r, 2, 250)) >>> 0;
  const prefixes = shuffled(r, [8, 16, 20, 24]).slice(0, 3);
  const srcs = shuffled(r, SOURCES);
  const routes = prefixes.map((p, i) => {
    const net = (dest & maskOf(p)) >>> 0;
    return route(`${formatIp(net)}/${p}`, srcs[i].source, randInt(r, 2, 60), { nextHop: `10.0.${i}.2` });
  });
  // One decoy that does not contain the destination.
  routes.push(route(`${formatIp((dest & maskOf(24)) + 256 * randInt(r, 1, 3))}/24`, "static", 0, { nextHop: "10.0.9.2" }));
  return { routes: shuffled(r, routes), dest, destText: formatIp(dest) };
}

const listing = (routes: readonly Route[]) => routes.map((x) => showRouteLine(x)).join("\n");

export const routeSelectGen: Generator = {
  id: "gen-route-select",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const t = table(seed);
    const best = selectRoute(t.routes, t.dest);
    const labels = t.routes.map((x) => `${formatCidr(x.prefix)} via ${x.nextHop}`);
    const hit = best ? t.routes.indexOf(best) : -1;
    const { choices, answer } = mcqChoices(rng(seed ^ 0x2545f491), labels[hit], labels.filter((_, i) => i !== hit));
    const why = best
      ? `${formatCidr(best.prefix)} is the longest prefix that contains ${t.destText}, so it wins regardless of AD or metric. AD [${best.ad}] only matters between routes to the same prefix.`
      : "";
    return {
      id: `gen-route-select:${seed}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `A router has these routes (code prefix [AD/metric] next hop):\n\n${listing(t.routes)}\n\nWhich route forwards a packet for ${t.destText}?`,
      choices,
      answer,
      explain: why,
    } satisfies Question;
  },
};

export const adCompareGen: Generator = {
  id: "gen-ad-compare",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const [x, y] = shuffled(r, SOURCES).slice(0, 2);
    const net = `${randInt(r, 10, 190)}.${randInt(r, 0, 255)}.${randInt(r, 0, 255)}.0/24`;
    const win = ADMIN_DISTANCE[x.source] <= ADMIN_DISTANCE[y.source] ? x : y;
    const lose = win === x ? y : x;
    const { choices, answer } = mcqChoices(r, win.name, [lose.name, "Both, as equal-cost paths", "Neither: the router drops traffic to it"]);
    return {
      id: `gen-ad-compare:${net}:${x.source}:${y.source}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 1,
      prompt: `${x.name} and ${y.name} both advertise ${net} with default settings. Which route is installed?`,
      choices,
      answer,
      explain: `Same prefix, so the lowest administrative distance wins: ${x.name} is ${ADMIN_DISTANCE[x.source]}, ${y.name} is ${ADMIN_DISTANCE[y.source]}. Metrics are never compared between different protocols.`,
    } satisfies Question;
  },
};

const FLOAT_PRIMARIES: readonly { source: RouteSource; name: string }[] = [
  { source: "eigrp", name: "EIGRP" },
  { source: "ospf", name: "OSPF" },
  { source: "rip", name: "RIP" },
  { source: "isis", name: "IS-IS" },
  { source: "ebgp", name: "eBGP" },
];

export const floatingAdGen: Generator = {
  id: "gen-floating-ad",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const p = FLOAT_PRIMARIES[randInt(r, 0, FLOAT_PRIMARIES.length - 1)];
    const need = floatingAd(p.source);
    const a = need - 1;
    const { choices, answer } = mcqChoices(r, String(need), [String(a), "1", String(need + 100 > 255 ? 255 : need + 100), "0"].filter((v) => v !== String(need)).slice(0, 4));
    return {
      id: `gen-floating-ad:${p.source}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `${p.name} is the primary route to a network. What is the lowest administrative distance you can give a floating static backup so it stays hidden until ${p.name} fails?`,
      choices,
      answer,
      explain: `${p.name} has AD ${ADMIN_DISTANCE[p.source]}. The static route must be strictly higher, so ${ADMIN_DISTANCE[p.source]} + 1 = ${need}. With ${a} or lower it would tie or beat ${p.name} and replace it in the table.`,
    } satisfies Question;
  },
};

export const IPROUTE_GENERATORS: readonly Generator[] = [routeSelectGen, adCompareGen, floatingAdGen];
