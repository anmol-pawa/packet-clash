import { parseCidr } from "@/lib/net/ipv4";
import type { RegionId, Route, Town } from "./world";


/**
 * The two regions after the Backbone Summit (gym 9). Cisco Cove is the CCNA
 * arc (gyms 10–13) and Scale Citadel the FAANG SDE arc (gyms 14–16); gym 10's
 * town opens with the Backbone Badge and each later gym with the one before.
 *
 * Addressing continues the mainland plan: towns are 10.0.N.0/24 (N = gym) and
 * routes are /30s from 10.255.0.44 on (the mainland uses .0 to .40).
 *
 * Positions are pixels on each region's own 320×224 map. `TOWNS` and
 * `ROUTES` in ./world merge these in; `bossSprite` stays null until each
 * leader's art exists (6.1c onwards, one boss per run).
 */

export interface Region {
  id: RegionId;
  name: string;
  /** Gym numbers in the region, in unlock order. */
  gyms: readonly number[];
}

export const NEW_REGIONS: readonly Region[] = [
  { id: "cisco-cove", name: "Cisco Cove", gyms: [10, 11, 12, 13] },
  { id: "scale-citadel", name: "Scale Citadel", gyms: [14, 15, 16] },
];

/** Planned leader design, one line each, so the art runs stay on-concept. */
export const BOSS_BRIEFS: Readonly<Record<string, string>> = {
  spantoise: "tortoise whose shell is a spanning tree: root-bridge crown, blocked-port shell plates",
  areadon: "armoured reef drake with OSPF area rings on its flippers, cost numbers on its scales",
  nattopus: "octopus rewriting address tags on each arm: inside local to inside global",
  aclaw: "gatekeeper crab, one permit claw and one deny claw, implicit deny shell",
  hashorn: "ram whose horns are a hash ring, virtual-node beads around the curl",
  spineback: "armoured lizard with leaf-spine ridges, a Clos fabric across its back",
  loopwarden: "sphinx-owl that scores three rounds, a hire/no-hire scale in its talons",
};

export const NEW_TOWNS: Town[] = [
  { gym: 10, id: "trunk-reef", name: "Trunk Reef", subnet: "10.0.10.0/24", chapter: "4.4", topic: "Switching: VLANs, trunks, STP, EtherChannel, port security", boss: "Spantoise", bossSprite: null, badge: "Tree Badge", badgeColor: "#4fd0e0", roof: "#1f7f9c", x: 56, y: 178 },
  { gym: 11, id: "static-strand", name: "Static Strand", subnet: "10.0.11.0/24", chapter: "4.3", topic: "IP connectivity: route selection, OSPF, EIGRP, FHRP", boss: "Areadon", bossSprite: null, badge: "Area Badge", badgeColor: "#6fe3a0", roof: "#2c8c5e", x: 132, y: 150 },
  { gym: 12, id: "service-shoal", name: "Service Shoal", subnet: "10.0.12.0/24", chapter: "4.6", topic: "IP services: NAT, NTP, DHCP relay, SNMP, QoS", boss: "Nattopus", bossSprite: null, badge: "Translate Badge", badgeColor: "#ffb06b", roof: "#c4682c", x: 214, y: 112 },
  { gym: 13, id: "shield-haven", name: "Shield Haven", subnet: "10.0.13.0/24", chapter: "4.7", topic: "Security, wireless and automation: ACLs, AAA, VPN, SDN", boss: "Aclaw", bossSprite: null, badge: "Shield Badge", badgeColor: "#d8708f", roof: "#8f2f58", x: 262, y: 56 },
  { gym: 14, id: "balancer-bluff", name: "Balancer Bluff", subnet: "10.0.14.0/24", chapter: "5.1", topic: "Load balancing, consistent hashing, rate limiting", boss: "Hashorn", bossSprite: null, badge: "Ring Badge", badgeColor: "#b6a2ff", roof: "#5a46b0", x: 60, y: 170 },
  { gym: 15, id: "fabric-fort", name: "Fabric Fort", subnet: "10.0.15.0/24", chapter: "5.5", topic: "Datacenter and cloud networking, QUIC and BBR, real-time", boss: "Spineback", bossSprite: null, badge: "Fabric Badge", badgeColor: "#7fb8ff", roof: "#2f5fae", x: 160, y: 120 },
  { gym: 16, id: "offer-spire", name: "Offer Spire", subnet: "10.0.16.0/24", chapter: "5.10", topic: "Debugging, system design and the FAANG mock loop", boss: "Loopwarden", bossSprite: null, badge: "Offer Badge", badgeColor: "#ffd86b", roof: "#a0762a", x: 252, y: 52 },
];

const R = (id: string, name: string, medium: string, from: string, to: string, n: number, via: [number, number][] = []): Route => ({ id, name, medium, from, to, link: `10.255.0.${n * 4}/30`, via });

export const NEW_ROUTES: Route[] = [
  R("r12", "Route 12", "Backbone fibre", "backbone-summit", "trunk-reef", 11),
  R("r13", "Route 13", "Patch cable", "trunk-reef", "static-strand", 12, [[96, 166]]),
  R("r14", "Route 14", "Serial link", "static-strand", "service-shoal", 13, [[176, 130]]),
  R("r15", "Route 15", "Metro Ethernet", "service-shoal", "shield-haven", 14, [[240, 84]]),
  R("r16", "Route 16", "Backbone fibre", "shield-haven", "balancer-bluff", 15),
  R("r17", "Route 17", "Spine uplink", "balancer-bluff", "fabric-fort", 16, [[108, 148]]),
  R("r18", "Route 18", "400G optics", "fabric-fort", "offer-spire", 17, [[206, 84]]),
];

export const newTownCidrs = () => NEW_TOWNS.map((t) => parseCidr(t.subnet));
