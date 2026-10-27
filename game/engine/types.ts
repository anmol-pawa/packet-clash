/**
 * Move types and the type chart.
 *
 * Every move (and every creature) belongs to a layer of the network stack, or
 * to Security. The chart is built on one idea the game wants to teach: each
 * layer *serves* the one above it. A layer's PDU rides inside the PDU of the
 * layer below (a segment inside a packet inside a frame on the wire), so
 * striking from one layer down is super effective (take away the service and
 * everything built on it falls), and striking at the layer below is not very
 * effective (an upper layer only hands data down; it can't see or fix the
 * layer underneath). Security has its own triangle: physical access beats
 * most security controls, security controls filter application traffic, and
 * no cipher can stop a cut cable.
 *
 * Every non-neutral matchup carries a one-line reason, shown after the hit.
 */

export const TYPES = ["PHYSICAL", "LINK", "NETWORK", "TRANSPORT", "APPLICATION", "SECURITY"] as const;
export type PacketType = (typeof TYPES)[number];

export interface TypeInfo {
  /** Short label for chips. */
  label: string;
  /** The PDU this layer works with (Security has none). */
  pdu: string | null;
  /** Chip colour and its text colour. */
  color: string;
  ink: string;
  /** The move a creature uses when it answers a question of this type. */
  move: string;
}

export const TYPE_INFO: Record<PacketType, TypeInfo> = {
  PHYSICAL: { label: "PHYS", pdu: "bit", color: "#d0584c", ink: "#fff4e8", move: "SIGNAL SURGE" },
  LINK: { label: "LINK", pdu: "frame", color: "#f0a35a", ink: "#2a1606", move: "FRAME SLAM" },
  NETWORK: { label: "NET", pdu: "packet", color: "#3a7fd5", ink: "#f2f7ff", move: "ROUTE STRIKE" },
  TRANSPORT: { label: "TRANS", pdu: "segment", color: "#3f9f5a", ink: "#f0fff2", move: "SEGMENT BLITZ" },
  APPLICATION: { label: "APP", pdu: "message", color: "#9c6ade", ink: "#fbf6ff", move: "REQUEST RUSH" },
  SECURITY: { label: "SEC", pdu: null, color: "#56607a", ink: "#f2f4fa", move: "CIPHER SLASH" },
};

export interface Matchup {
  atk: PacketType;
  def: PacketType;
  /** 2 = super effective, 0.5 = not very effective. */
  mult: 2 | 0.5;
  why: string;
}

/** Every matchup that isn't neutral (×1). */
export const CHART: readonly Matchup[] = [
  // One layer down is super effective: the defender's PDUs ride on the attacker's layer.
  { atk: "PHYSICAL", def: "LINK", mult: 2, why: "Frames are sent as bits on the wire: no signal, no frames." },
  { atk: "LINK", def: "NETWORK", mult: 2, why: "Every packet crosses each hop inside a frame: lose the link and the packet is lost." },
  { atk: "NETWORK", def: "TRANSPORT", mult: 2, why: "Segments travel inside IP packets: with no route, no segment reaches the far end." },
  { atk: "TRANSPORT", def: "APPLICATION", mult: 2, why: "Apps send their messages through transport ports: reset the connection and the app's request dies." },
  // Striking at the layer below is not very effective.
  { atk: "LINK", def: "PHYSICAL", mult: 0.5, why: "The link layer only hands frames down: it can't change how bits are signalled." },
  { atk: "NETWORK", def: "LINK", mult: 0.5, why: "IP doesn't see MAC addresses or frames: each link delivers on its own." },
  { atk: "TRANSPORT", def: "NETWORK", mult: 0.5, why: "TCP and UDP don't pick routes: routers forward packets without reading the segment." },
  { atk: "APPLICATION", def: "TRANSPORT", mult: 0.5, why: "An app only sees its socket: retransmission and ordering happen below it." },
  // The security triangle.
  { atk: "PHYSICAL", def: "SECURITY", mult: 2, why: "Physical access beats most security controls: whoever holds the hardware can bypass them." },
  { atk: "SECURITY", def: "APPLICATION", mult: 2, why: "Firewalls, TLS and authentication guard application traffic: unwanted requests are filtered out." },
  { atk: "SECURITY", def: "PHYSICAL", mult: 0.5, why: "No cipher can stop a cut cable: encryption protects data, not the medium." },
];

/** The multiplier of one attacking type against one defending type. */
export function typeMult(atk: PacketType, def: PacketType): number {
  return CHART.find((m) => m.atk === atk && m.def === def)?.mult ?? 1;
}

/** The multiplier against a creature with one or two types (they multiply). */
export function effectiveness(atk: PacketType, def: readonly PacketType[]): number {
  return def.reduce((m, d) => m * typeMult(atk, d), 1);
}

/** The battle message for a multiplier ("" when neutral). */
export function effectMessage(mult: number): string {
  if (mult > 1) return "It's super effective!";
  if (mult < 1) return "It's not very effective…";
  return "";
}

/** The reasons behind a hit: one line for every non-neutral defending type. */
export function effectReasons(atk: PacketType, def: readonly PacketType[]): string[] {
  return def.flatMap((d) => CHART.find((m) => m.atk === atk && m.def === d)?.why ?? []);
}

/** The types of each creature, by art id. The starter's line is Network (ping and traceroute are ICMP). */
export const CREATURE_TYPES: Record<string, readonly PacketType[]> = {
  pingkit: ["NETWORK"],
  tracevix: ["NETWORK"],
  // Its shell is an Ethernet frame.
  framadillo: ["LINK"],
  // Its shell carries an 802.1Q-tagged frame.
  trunkadillo: ["LINK"],
  // Its tail lamps are a TCP sliding window.
  ackorn: ["TRANSPORT"],
  // Its tail lamps show TCP congestion control: slow start, then halving on loss.
  oakwind: ["TRANSPORT"],
  // Its stack runs from the link slab at the bottom to the application slab on top.
  stackadon: ["LINK", "APPLICATION"],
  braidwyrm: ["PHYSICAL"],
  cidrab: ["NETWORK"],
  hootpath: ["NETWORK"],
  synackle: ["TRANSPORT"],
  oraclynx: ["APPLICATION"],
  keyvern: ["SECURITY"],
  // DNS and HTTP ride on its TCP handshake.
  fetchimera: ["APPLICATION", "TRANSPORT"],
  // Fibre underfoot, core routing above.
  gigaroc: ["PHYSICAL", "NETWORK"],
  // A spanning tree over switches: layer 2 (Link) with a secured topology.
  spantoise: ["LINK"],
  // OSPF areas and link-state routing: layer 3, with a backbone of Link below it.
  areadon: ["NETWORK"],
};

/** A creature's types (Network if it isn't listed). */
export const typesOf = (id: string): readonly PacketType[] => CREATURE_TYPES[id] ?? ["NETWORK"];

/** Why one type hits another as it does: the chart's reason, or why it's neutral. */
export function matchupReason(atk: PacketType, def: PacketType): string {
  const m = CHART.find((c) => c.atk === atk && c.def === def);
  if (m) return m.why;
  if (atk === def) return "Same layer, same footing: neither side has an edge.";
  return "Neither one rides on the other, so the hit lands normally.";
}
