import { parseCidr, type Cidr } from "@/lib/net/ipv4";

/**
 * The overworld is a network: every town is a /24 LAN with its gateway at .1,
 * and every route is a /30 point-to-point link between two towns' routers
 * (2 usable addresses, one per end). There are nine gyms, one per curriculum
 * chapter, beaten in order; each badge unlocks the next town.
 *
 * Positions are pixels on the 320×224 overworld painting.
 */

export interface Town {
  /** Gym number, 1–9 (also the unlock order). */
  gym: number;
  id: string;
  name: string;
  /** The town's LAN. */
  subnet: string;
  /** Roadmap chapter the gym teaches. */
  chapter: string;
  topic: string;
  boss: string;
  /** Boss sprite id once its art exists (null = still being drawn). */
  bossSprite: string | null;
  badge: string;
  badgeColor: string;
  roof: string;
  x: number;
  y: number;
}

export interface Route {
  id: string;
  name: string;
  medium: string;
  from: string;
  to: string;
  /** The /30 transit link. */
  link: string;
  /** Waypoints between the two towns, so roads bend. */
  via: [number, number][];
}

export const TOWNS: Town[] = [
  { gym: 1, id: "layer-landing", name: "Layer Landing", subnet: "10.0.1.0/24", chapter: "2.1", topic: "OSI & TCP/IP models, encapsulation, delay", boss: "Stackadon", bossSprite: "stackadon", badge: "Layer Badge", badgeColor: "#7fd6f5", roof: "#3a7fd5", x: 44, y: 182 },
  { gym: 2, id: "copperfield", name: "Copperfield", subnet: "10.0.2.0/24", chapter: "2.2", topic: "Physical & data link: CRC, MAC, Ethernet, ARP", boss: "Braidwyrm", bossSprite: "braidwyrm", badge: "Frame Badge", badgeColor: "#f0a35a", roof: "#d0584c", x: 112, y: 196 },
  { gym: 3, id: "octet-harbor", name: "Octet Harbor", subnet: "10.0.3.0/24", chapter: "2.3", topic: "IPv4, subnetting & CIDR, NAT, ICMP, IPv6", boss: "Cidrab", bossSprite: "cidrab", badge: "Mask Badge", badgeColor: "#ff7096", roof: "#c24f8a", x: 184, y: 176 },
  { gym: 4, id: "hopwood", name: "Hopwood", subnet: "10.0.4.0/24", chapter: "2.4", topic: "Routing: Dijkstra, Bellman-Ford, OSPF, BGP", boss: "Hootpath", bossSprite: "hootpath", badge: "Route Badge", badgeColor: "#8ee07a", roof: "#3f8f4a", x: 92, y: 124 },
  { gym: 5, id: "handshake-harbor", name: "Synport", subnet: "10.0.5.0/24", chapter: "2.5", topic: "TCP & UDP, handshakes, windows, congestion", boss: "Synackle", bossSprite: "synackle", badge: "Window Badge", badgeColor: "#ffd257", roof: "#d99a2b", x: 180, y: 110 },
  { gym: 6, id: "resolvia", name: "Resolvia", subnet: "10.0.6.0/24", chapter: "2.6", topic: "DNS, HTTP, DHCP, email", boss: "Oraclynx", bossSprite: "oraclynx", badge: "Lookup Badge", badgeColor: "#c49bff", roof: "#7a52c9", x: 270, y: 140 },
  { gym: 7, id: "cipher-keep", name: "Cipher Keep", subnet: "10.0.7.0/24", chapter: "2.7", topic: "TLS, PKI, crypto, firewalls, attacks", boss: "Keyvern", bossSprite: "keyvern", badge: "Cipher Badge", badgeColor: "#e8e8f0", roof: "#56607a", x: 262, y: 66 },
  { gym: 8, id: "waypoint", name: "Waypoint", subnet: "10.0.8.0/24", chapter: "2.8", topic: "What happens when you type a URL", boss: "Fetchimera", bossSprite: "fetchimera", badge: "Journey Badge", badgeColor: "#5fe0c8", roof: "#2a9c8c", x: 172, y: 50 },
  { gym: 9, id: "backbone-summit", name: "Backbone Summit", subnet: "10.0.9.0/24", chapter: "2.9", topic: "Interview gauntlet", boss: "Gigaroc", bossSprite: null, badge: "Backbone Badge", badgeColor: "#ffe17a", roof: "#9c3a3a", x: 70, y: 46 },
];

const R = (id: string, name: string, medium: string, from: string, to: string, n: number, via: [number, number][] = []): Route => ({ id, name, medium, from, to, link: `10.255.0.${n * 4}/30`, via });

export const ROUTES: Route[] = [
  R("r1", "Route 1", "Cat 6 twisted pair", "layer-landing", "copperfield", 0, [[78, 194]]),
  R("r2", "Route 2", "Coax trunk", "copperfield", "octet-harbor", 1, [[150, 200]]),
  R("r3", "Route 3", "Fibre ferry", "octet-harbor", "hopwood", 2, [[140, 150]]),
  R("r4", "Route 4", "Gigabit Ethernet", "hopwood", "handshake-harbor", 3, [[136, 112]]),
  R("r5", "Route 5", "Undersea cable", "handshake-harbor", "resolvia", 4, [[226, 120]]),
  R("r6", "Route 6", "Microwave relay", "resolvia", "cipher-keep", 5, [[282, 100]]),
  R("r7", "Route 7", "Encrypted tunnel", "cipher-keep", "waypoint", 6, [[218, 52]]),
  R("r8", "Route 8", "Backbone fibre", "waypoint", "backbone-summit", 7, [[122, 40]]),
  // redundant links make the map a mesh, not a chain (alternate paths for routing lessons)
  R("r9", "Route 9", "Wi-Fi bridge", "layer-landing", "hopwood", 8, [[60, 150]]),
  R("r10", "Route 10", "Leased line", "octet-harbor", "handshake-harbor", 9, [[190, 144]]),
  R("r11", "Route 11", "Fibre ring", "hopwood", "backbone-summit", 10, [[76, 84]]),
];

export const town = (id: string): Town => {
  const t = TOWNS.find((t) => t.id === id);
  if (!t) throw new Error(`no town ${id}`);
  return t;
};

export const townCidr = (t: Town): Cidr => parseCidr(t.subnet);

/** The first town is always open; each later town opens when the previous gym's badge is won. */
export function isUnlocked(t: Town, badges: readonly number[]): boolean {
  return t.gym === 1 || badges.includes(t.gym - 1);
}

/** A route can be travelled once both of its towns are open. */
export function isRouteOpen(r: Route, badges: readonly number[]): boolean {
  return isUnlocked(town(r.from), badges) && isUnlocked(town(r.to), badges);
}

/** The town to head for next: the first open gym without its badge (or the last gym). */
export function currentTown(badges: readonly number[]): Town {
  return TOWNS.find((t) => isUnlocked(t, badges) && !badges.includes(t.gym)) ?? TOWNS[TOWNS.length - 1];
}

/** Every point a route's road passes through, town to town. */
export function routePoints(r: Route): [number, number][] {
  const a = town(r.from);
  const b = town(r.to);
  return [[a.x, a.y], ...r.via, [b.x, b.y]];
}

/** Towns reachable from `start` over open routes (breadth-first). */
export function reachable(start: string, badges: readonly number[]): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of ROUTES) {
      if (!isRouteOpen(r, badges)) continue;
      const next = r.from === cur ? r.to : r.to === cur ? r.from : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
