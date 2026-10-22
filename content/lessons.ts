import { encapsulate, totalBytes } from "@/game/engine/encap";
import { BF_DEST, BGP_CHAIN, CRC_DEMO, CTI_GRAPH, ROUTE_DEMO, FRAG_DEMO, HAMMING_DEMO, LPM_DEMO, MAC_DEMO, SUBNET_DEMO, VLSM_DEMO } from "@/game/art/lessons";
import { acceptsAsPath, afterLinkChange, asPaths, bellmanFordRounds, dijkstra, dijkstraSteps, nextHop, pathTo } from "@/lib/net/routing";
import { fragment, longestPrefixMatch, splitSubnets, vlsmAllocate } from "@/lib/net/addressing";
import { blockSize, broadcastOf, formatCidr, formatIp, hostRange, parseCidr, parseIp, usableHosts } from "@/lib/net/ipv4";
import { crc, crcOk, hammingSyndrome } from "@/lib/net/errors";
import { backoffChoices, minFrameBits } from "@/lib/net/link";
import { simulateSwitch } from "@/lib/net/switching";
import { bandwidthDelayProduct, circuitUsers, probMoreThanActive, propagationDelay, transmissionDelay } from "@/lib/net/basics";

/**
 * Concept lessons: a few short illustrated cards per gym, shown the first
 * time the player enters the gym and readable any time from the town on the
 * world map. Every number in a worked example is computed by the same
 * solvers the quiz uses (and checked in tests/lessons.test.ts).
 */

export type Figure = "layers" | "encap" | "switching" | "delays" | "crc" | "hamming" | "csmacd" | "macLearn" | "subnet" | "vlsm" | "lpm" | "frag" | "dijkstra" | "bellman" | "cti" | "bgp";

export interface Lesson {
  id: string;
  title: string;
  figure: Figure;
  /** One-line caption under the figure. */
  caption: string;
  paras: string[];
  /** A worked example, one line per step. */
  example?: { title: string; lines: string[] };
}

const ms = (s: number) => `${+(s * 1000).toFixed(3)} ms`;
const n = (x: number) => x.toLocaleString("en-US");

/** The encapsulation card's PDU: an HTTP request on its way down the stack. */
export const ENCAP_STEPS = encapsulate("APPLICATION");

// K&R §1.3's packet-vs-circuit example: a 1 Mbps link, users needing 100 kbps, active 10% of the time
const KR_LINK = 1_000_000;
const KR_USER = 100_000;
const KR_USERS = 35;
const KR_ACTIVE = 0.1;
const krCircuit = circuitUsers(KR_LINK, KR_USER);
const krOverload = probMoreThanActive(KR_USERS, KR_ACTIVE, krCircuit);

// the delays card's hop: a 1500-byte packet, a 10 Mbps link, 2,000 km of cable at 2×10^8 m/s
const HOP_BYTES = 1500;
const HOP_RATE = 10_000_000;
const HOP_METERS = 2_000_000;
const HOP_SPEED = 2e8;
const dTrans = transmissionDelay(HOP_BYTES, HOP_RATE);
const dProp = propagationDelay(HOP_METERS, HOP_SPEED);
const bdp = bandwidthDelayProduct(HOP_RATE, dProp);

// gym 2: the CRC card divides K&R's 101110 by 1001; the Hamming card encodes 1011 and flips bit 6
const crcRes = crc(CRC_DEMO.data, CRC_DEMO.gen);
const crcRecv = crcOk(crcRes.codeword, CRC_DEMO.gen);
const hamFlipped = HAMMING_DEMO.code.replace(/./g, (ch, i) => (i === 5 ? (ch === "1" ? "0" : "1") : ch));
const hamSyndrome = hammingSyndrome(hamFlipped);
// the CSMA/CD card: 10 Mbps Ethernet over 2.5 km of cable at 2×10^8 m/s
const CD_RATE = 10_000_000;
const CD_METERS = 2500;
const cdMinBits = minFrameBits(CD_RATE, CD_METERS, HOP_SPEED);
// the learning card: A → B (unknown, floods), then B → A (A is known, forwards)
const macSteps = simulateSwitch(4, MAC_DEMO.frames);
const macVerb = (i: number) => {
  const st = macSteps[i];
  return st.action === "flood" ? `floods to ports ${st.outPorts.join(", ")}` : st.action === "forward" ? `goes only to port ${st.outPorts[0]}` : "is filtered";
};

// gym 3: borrow 2 bits from a /24, give a /24 out by VLSM, route 10.1.2.7, fragment K&R's 4000-byte datagram
const subBlock = parseCidr(SUBNET_DEMO.block);
const subNets = splitSubnets(subBlock, subBlock.prefix + SUBNET_DEMO.borrow);
const subSecond = subNets[1];
const subRange = hostRange(subSecond);
const vlsmPlan = vlsmAllocate(parseCidr(VLSM_DEMO.block), VLSM_DEMO.lans.map((l) => l.hosts))!;
const lpmDest = parseIp(LPM_DEMO.dest);
const lpmMatches = LPM_DEMO.routes.filter((r) => longestPrefixMatch([r], lpmDest));
const lpmWinner = longestPrefixMatch(LPM_DEMO.routes, lpmDest)!;
const fragList = fragment(FRAG_DEMO.total, FRAG_DEMO.mtu);

// gym 4: Dijkstra and Bellman-Ford on K&R Fig. 5.3, count-to-infinity on A-B-C, an AS_PATH along AS1..AS4
const dijSteps = dijkstraSteps(ROUTE_DEMO, "A");
const dijRes = dijkstra(ROUTE_DEMO, "A");
const dijPath = pathTo(dijRes, "A", "F")!;
const bfRounds = bellmanFordRounds(ROUTE_DEMO, BF_DEST);
const ctiPlain = afterLinkChange(CTI_GRAPH, "A", "A", "B", Infinity).history;
const ctiPoison = afterLinkChange(CTI_GRAPH, "A", "A", "B", Infinity, { poison: true }).history;
const bgpPaths = asPaths(BGP_CHAIN);
const bgpLoop = bgpPaths[bgpPaths.length - 1];
const showCost = (v: number) => (v === Infinity ? "∞" : String(v));

const encapLine = ENCAP_STEPS.map((s) => `${s.pdu} ${totalBytes(s)} B`).join(" → ");

export const LESSONS: Record<number, Lesson[]> = {
  1: [
    {
      id: "layer-stack",
      title: "The layer stack",
      figure: "layers",
      caption: "OSI's 7 layers beside the Internet's 5.",
      paras: [
        "A network is built in layers. Each layer offers a service to the one above it and uses the service of the one below, so you can change one layer (say, Wi-Fi for Ethernet) without touching the rest.",
        "The OSI reference model has 7 layers. The Internet's TCP/IP stack has 5: application, transport, network, link and physical. OSI's presentation and session jobs (data formats, encryption, dialogue control) are left to the application.",
        "Hosts run all 5 layers. A router works up to the network layer, and a link-layer switch only up to the link layer.",
        "Each layer's unit of data has a name: a message (application), a segment (transport), a packet or datagram (network), a frame (link) and bits (physical).",
      ],
    },
    {
      id: "encapsulation",
      title: "Encapsulation",
      figure: "encap",
      caption: "An HTTP request going down the sender's stack.",
      paras: [
        "On the way down, each layer treats what it gets from above as its payload and puts its own header in front. TCP turns the message into a segment, IP turns the segment into a packet, and Ethernet turns the packet into a frame. Ethernet also adds a trailer, the FCS checksum, at the end.",
        "The physical layer sends the frame as bits behind a preamble. The receiver undoes it in reverse (decapsulation): each layer reads and removes its own header and passes the payload up.",
        "Headers cost bytes. A minimal TCP + IPv4 + Ethernet wrapping adds 20 + 20 + 18 = 58 bytes, so small messages carry a lot of overhead.",
      ],
      example: { title: "Sizes on the way down", lines: [encapLine] },
    },
    {
      id: "switching",
      title: "Circuit vs packet switching",
      figure: "switching",
      caption: "Two users with data, four reserved slots. Packets go on demand.",
      paras: [
        "Circuit switching (the old phone network) reserves capacity along the whole path before any data flows, as a frequency band (FDM) or a time slot in every frame (TDM). The rate is guaranteed, but a slot nobody uses goes out empty.",
        "Packet switching (the Internet) reserves nothing. Each packet uses the link's full rate when it gets its turn, and routers store and forward whole packets. Bursty users share the link well, but packets can wait in queues and be dropped when a buffer fills.",
      ],
      example: {
        title: "Kurose & Ross's example",
        lines: [
          `Link ${KR_LINK / 1e6} Mbps, each user needs ${KR_USER / 1000} kbps but is active only ${KR_ACTIVE * 100}% of the time.`,
          `Circuit switching: ${KR_LINK / 1000} ÷ ${KR_USER / 1000} = ${krCircuit} users, no more.`,
          `Packet switching with ${KR_USERS} users: more than ${krCircuit} are active at once with probability ≈ ${krOverload.toFixed(4)}.`,
        ],
      },
    },
    {
      id: "delays",
      title: "The four delays",
      figure: "delays",
      caption: "Where a packet's time goes at one router.",
      paras: [
        "Each hop adds nodal delay = processing + queuing + transmission + propagation.",
        "Processing: checking the header for bit errors and looking up the output link, usually microseconds. Queuing: waiting behind other packets. It grows sharply as the traffic intensity La/R nears 1.",
        "Transmission L/R is the time to push all L bits of the packet onto a link of rate R. It depends on the packet's size and the link's rate, not on distance.",
        "Propagation d/s is the time one bit takes to travel the link's length d at the medium's speed s (about 2×10⁸ m/s in copper or fibre). It depends on distance, not on packet size.",
      ],
      example: {
        title: "One hop",
        lines: [
          `Transmission: ${n(HOP_BYTES)} B × 8 ÷ ${HOP_RATE / 1e6} Mbps = ${ms(dTrans)}`,
          `Propagation: ${n(HOP_METERS / 1000)} km ÷ 2×10⁸ m/s = ${ms(dProp)}`,
          `Bandwidth-delay product: ${HOP_RATE / 1e6} Mbps × ${ms(dProp)} = ${n(bdp)} bits in flight`,
        ],
      },
    },
  ],
  2: [
    {
      id: "crc",
      title: "CRC: long division",
      figure: "crc",
      caption: "Dividing 101110 000 by 1001, modulo 2.",
      paras: [
        "A CRC treats the message as a polynomial and divides it by an agreed generator. With a generator of r + 1 bits you append r zeros to the message, divide, and the r-bit remainder becomes the check bits.",
        "The division uses no borrows or carries: subtracting is XOR. Line the generator up under each leading 1, XOR, and slide on. The remainder is whatever is left in the last r bits.",
        "The sender transmits message + remainder. The receiver divides what arrived by the same generator: a zero remainder means it is accepted, anything else means it was damaged. Ethernet's FCS is a CRC-32.",
      ],
      example: {
        title: "Kurose & Ross's example",
        lines: [
          `Message ${CRC_DEMO.data}, generator ${CRC_DEMO.gen} (r = ${CRC_DEMO.gen.length - 1}): divide ${CRC_DEMO.data}${"0".repeat(CRC_DEMO.gen.length - 1)}.`,
          `${crcRes.steps.length} XOR steps leave the remainder ${crcRes.remainder}.`,
          `Sent: ${crcRes.codeword}. The receiver's division ${crcRecv ? "leaves 000, so the frame is accepted" : "fails"}.`,
        ],
      },
    },
    {
      id: "hamming",
      title: "Hamming codes",
      figure: "hamming",
      caption: "Hamming(7,4): check bits at positions 1, 2 and 4.",
      paras: [
        "Parity only detects errors. A Hamming code adds several check bits so the receiver can also find which single bit flipped and flip it back. For m data bits you need r check bits with 2^r ≥ m + r + 1, so 4 data bits take 3.",
        "Number the positions from 1. Check bits sit at the powers of two (1, 2, 4, 8…) and data fills the rest. The check bit at position p makes the parity of every position whose number has bit p set even.",
        "The receiver recomputes the checks. Read together as a binary number, the failed checks are the syndrome: 0 means no error, otherwise it is the position of the flipped bit.",
      ],
      example: {
        title: "Hamming(7,4)",
        lines: [
          `Data ${HAMMING_DEMO.data} goes in positions 3, 5, 6 and 7. The checks at 1, 2 and 4 make the codeword ${HAMMING_DEMO.code}.`,
          `Flip bit 6 in transit: ${hamFlipped}. Checks 2 and 4 fail, so the syndrome is 2 + 4 = ${hamSyndrome}.`,
          `Flip position ${hamSyndrome} back and the data is recovered. Distance 3 corrects 1 error and detects 2.`,
        ],
      },
    },
    {
      id: "csma-cd",
      title: "CSMA/CD and Ethernet",
      figure: "csmacd",
      caption: "Both stations send, collide, jam and back off.",
      paras: [
        "On a shared cable a station listens first (carrier sense) and sends only if it is quiet. Two stations can still start within one propagation delay of each other, so frames collide.",
        "While sending, a station keeps listening (collision detection). On a collision it sends a short jam signal so everybody notices, stops, and waits a random time. After the n-th collision it picks K from 0 … 2ⁿ − 1 slots of 512 bit times (the range stops growing at n = 10), then listens again.",
        "A collision must reach the sender before it finishes the frame, so the frame must last at least one round trip: L ≥ 2 · tprop · R. That is why Ethernet frames are at least 64 bytes. Modern switched Ethernet has no collisions, because each link is its own collision domain.",
      ],
      example: {
        title: "Minimum frame size",
        lines: [
          `${CD_RATE / 1e6} Mbps over ${n(CD_METERS)} m at 2×10⁸ m/s: tprop = ${ms(CD_METERS / HOP_SPEED)}.`,
          `L ≥ 2 × ${ms(CD_METERS / HOP_SPEED)} × ${CD_RATE / 1e6} Mbps = ${cdMinBits} bits.`,
          `After the 1st collision K is one of ${backoffChoices(1)} values (0, 1); after the 3rd one of ${backoffChoices(3)} (0 … 7).`,
        ],
      },
    },
    {
      id: "mac-learning",
      title: "How a switch learns",
      figure: "macLearn",
      caption: "After A→B and B→A the switch knows A and B.",
      paras: [
        "A switch starts with an empty MAC table and fills it by watching. Every frame that arrives teaches it that the source MAC is reachable through the arrival port, and old entries age out.",
        "To forward, it looks up the destination. A known address goes out of that port only. An unknown or broadcast address is flooded out of every port except the one it came in on. If the destination is on the arrival port, the frame is filtered (dropped).",
        "Switches never loop frames safely on their own: with redundant links a broadcast would circulate forever. Spanning Tree elects a root bridge (lowest bridge ID), keeps a tree and blocks the other links. VLANs split one switch into several broadcast domains, and an 802.1Q trunk tags each frame with its VLAN.",
      ],
      example: {
        title: "Four ports, two frames",
        lines: [
          `A → B on port 1: the table is empty, so the frame ${macVerb(0)}. The switch learns A = port 1.`,
          `B → A on port 2: A is known, so the frame ${macVerb(1)}. It learns B = port 2.`,
          "A frame from A to a host also on port 1 would be filtered.",
        ],
      },
    },
  ],
  3: [
    {
      id: "subnetting",
      title: "Subnetting: borrow bits",
      figure: "subnet",
      caption: "A /24 lends two host bits to the network part.",
      paras: [
        "An IPv4 address has 32 bits. The prefix length /n says the first n bits name the network and the remaining 32 − n name the host. The mask is n ones followed by zeros, and it is the same thing written another way: /24 is 255.255.255.0.",
        "To cut a block into subnets you borrow host bits. Borrow b bits and you get 2^b subnets, each with 2^(32 − n − b) addresses. Two of those addresses are not for hosts: the first is the network address and the last is the broadcast.",
        "To find the network of any address, AND it with the mask. The broadcast is the network with every host bit set to 1.",
      ],
      example: {
        title: `${SUBNET_DEMO.block}, borrow ${SUBNET_DEMO.borrow}`,
        lines: [
          `2^${SUBNET_DEMO.borrow} = ${subNets.length} subnets: ${subNets.map(formatCidr).join(", ")}.`,
          `Each has ${blockSize(subSecond.prefix)} addresses, ${usableHosts(subSecond.prefix)} usable for hosts.`,
          `Subnet 2 is ${formatCidr(subSecond)}: network ${formatIp(subSecond.network)}, hosts ${formatIp(subRange[0])} to ${formatIp(subRange[1])}, broadcast ${formatIp(broadcastOf(subSecond))}.`,
        ],
      },
    },
    {
      id: "vlsm",
      title: "VLSM: right-sized subnets",
      figure: "vlsm",
      caption: "Biggest LAN first, each block aligned to its own size.",
      paras: [
        "Fixed-size subnets waste addresses: a two-router link does not need 62 host addresses. Variable-length subnet masks let every LAN get the smallest block that fits it.",
        "For N hosts you need N + 2 addresses (network and broadcast), rounded up to a power of two. Allocate the largest requirement first, at the next address that is a multiple of its block size. Doing it in that order keeps every block aligned and nothing overlaps.",
      ],
      example: {
        title: `Splitting ${VLSM_DEMO.block}`,
        lines: [
          ...vlsmPlan.map((a, i) => `${VLSM_DEMO.lans[i].name}, ${a.hosts} hosts: ${formatCidr(a.subnet)} (${blockSize(a.subnet.prefix)} addresses, ${usableHosts(a.subnet.prefix)} usable).`),
          `Together they use ${vlsmPlan.reduce((t, a) => t + blockSize(a.subnet.prefix), 0)} of ${blockSize(parseCidr(VLSM_DEMO.block).prefix)} addresses.`,
        ],
      },
    },
    {
      id: "longest-prefix",
      title: "Longest-prefix match",
      figure: "lpm",
      caption: "Four routes match; the longest prefix wins.",
      paras: [
        "A router's forwarding table holds prefixes, and one destination can match several of them. The router uses the most specific one, the match with the longest prefix. That is how a /24 exception can sit inside a /8 and a default route (0.0.0.0/0) matches everything as a last resort.",
        "Aggregation uses the same idea in reverse: neighbouring blocks that share a prefix are advertised as one shorter prefix (4 contiguous /26 blocks become one /24), which keeps tables small.",
      ],
      example: {
        title: `Destination ${LPM_DEMO.dest}`,
        lines: [
          `Matching routes: ${lpmMatches.map((r) => formatCidr(r.prefix)).join(", ")}.`,
          `Longest is ${formatCidr(lpmWinner.prefix)}, so the packet goes to ${lpmWinner.nextHop}.`,
          `${formatCidr(LPM_DEMO.routes[LPM_DEMO.routes.length - 1].prefix)} does not match: the second octet differs.`,
        ],
      },
    },
    {
      id: "fragmentation",
      title: "IP fragmentation",
      figure: "frag",
      caption: "A 4000-byte datagram crossing a 1500-byte MTU link.",
      paras: [
        "Each link has a maximum transmission unit (MTU), the largest IP datagram it carries. If a datagram is bigger, the router splits it into fragments, each with its own 20-byte header and the same identification number. Only the destination reassembles them.",
        "The fragment offset field counts in units of 8 bytes, so every fragment's data except the last must be a multiple of 8. The more-fragments (MF) flag is 1 on every fragment but the last. A datagram with DF set is not fragmented: the router drops it and sends ICMP \"fragmentation needed\".",
      ],
      example: {
        title: "Kurose & Ross's example",
        lines: [
          `${FRAG_DEMO.total} B datagram = 20 B header + ${FRAG_DEMO.total - 20} B data, MTU ${FRAG_DEMO.mtu}: at most ${Math.floor((FRAG_DEMO.mtu - 20) / 8) * 8} B of data per fragment.`,
          ...fragList.map((f, i) => `Fragment ${i + 1}: length ${f.totalLength}, offset ${f.offset}, MF = ${f.more ? 1 : 0}.`),
          `Offset ${fragList[1].offset} × 8 = ${fragList[1].offset * 8} bytes of data come before fragment 2.`,
        ],
      },
    },
  ],
  4: [
    {
      id: "dijkstra",
      title: "Link state: Dijkstra",
      figure: "dijkstra",
      caption: "Each step settles the cheapest unsettled node.",
      paras: [
        "In link-state routing (OSPF) every router floods its links and costs, so all routers hold the same map and each runs Dijkstra on it. The algorithm grows a set N' of settled nodes outward from the source.",
        "Each step: pick the node outside N' with the smallest D(v), add it to N', then for each of its neighbours w ask whether D(settled) + cost to w beats D(w). If so, update D(w) and remember the predecessor p(w). When every node is settled, the predecessors give the least-cost tree, and the first hop on each path is the forwarding-table entry.",
      ],
      example: {
        title: "Kurose & Ross Fig. 5.3 (relabelled A–F), from A",
        lines: [
          `Settle order: ${dijRes.order.join(", ")} (B and E tie at 2, the lowest label goes first).`,
          `After settling D, C improves from ${showCost(dijSteps[0].dist.C)} to ${showCost(dijSteps[1].dist.C)} through D and E becomes ${showCost(dijSteps[1].dist.E)}.`,
          `Final costs: ${ROUTE_DEMO.nodes.map((n) => `${n} = ${dijRes.dist[n]}`).join(", ")}.`,
          `Least-cost path to F: ${dijPath.join(" → ")}, cost ${dijRes.dist.F}, so A forwards F-bound packets to ${nextHop(dijRes, "A", "F")}.`,
        ],
      },
    },
    {
      id: "bellman-ford",
      title: "Distance vector: Bellman-Ford",
      figure: "bellman",
      caption: "Round h: the cheapest cost to F using at most h links.",
      paras: [
        "Distance-vector routing (RIP) has no map. Each router knows only its neighbours' costs and the distance vectors they send. It applies the Bellman-Ford equation: D(x → y) = min over neighbours v of [ c(x, v) + D(v → y) ].",
        "Run it in synchronous rounds: after round h every router knows the best path of at most h links. Good news spreads one hop per round, and the tables settle after a round that changes nothing.",
      ],
      example: {
        title: `Costs to ${BF_DEST} on the same graph`,
        lines: [
          ...bfRounds.slice(1).map((r, i) => `Round ${i + 1}: ${ROUTE_DEMO.nodes.map((n) => `${n} = ${showCost(r[n])}`).join(", ")}.`),
          `Round ${bfRounds.length - 1} changes nothing, so the tables have settled after ${bfRounds.length - 2} rounds. The result matches Dijkstra.`,
        ],
      },
    },
    {
      id: "count-to-infinity",
      title: "Count to infinity",
      figure: "cti",
      caption: "A-B-C in a line, then the A-B link fails.",
      paras: [
        "Bad news travels slowly in distance-vector routing. When A–B fails, B no longer has a direct route to A, but C still advertises \"I can reach A in 2\". B believes C and picks 3 via C. Then C hears B's 3 and updates to 4, and the two bounce the cost upwards, two units per exchange.",
        "RIP caps the damage by defining infinity as 16 hops, so the loop ends when the cost reaches 16. Poisoned reverse stops it earlier: C never advertises a route to A back to B, the neighbour it learned it from (or advertises it with cost infinity), so B cannot be fooled. Split horizon, triggered updates and hold-down timers help too.",
      ],
      example: {
        title: "Costs to A after the link fails",
        lines: [
          `Without poison, (B, C) per round: ${ctiPlain.slice(0, 5).map((h) => `(${h.dist.B}, ${h.dist.C})`).join(" → ")} → … → (${ctiPlain[ctiPlain.length - 2].dist.B}, ${ctiPlain[ctiPlain.length - 2].dist.C}).`,
          `That takes ${ctiPlain.length - 1} rounds before both reach RIP's infinity of 16.`,
          `With poisoned reverse: ${ctiPoison.map((h) => `(${h.dist.B}, ${h.dist.C})`).join(" → ")}, done in ${ctiPoison.length - 1} rounds.`,
        ],
      },
    },
    {
      id: "bgp-as-path",
      title: "BGP: paths between ASes",
      figure: "bgp",
      caption: "Each AS prepends its number; a loop is rejected.",
      paras: [
        "The internet is thousands of autonomous systems (ASes), each run by one organisation and numbered. Inside an AS an IGP such as OSPF or RIP finds the best path. Between ASes, BGP is the one protocol, running over TCP port 179.",
        "BGP is a path-vector protocol. A route carries the AS_PATH, the list of ASes it crossed, and each AS prepends its own number when it passes the route on. A router drops any route whose AS_PATH already contains its own AS, which prevents loops without counting to infinity. Among valid routes, local policy (prices, peering agreements) decides first and a short AS_PATH comes after.",
      ],
      example: {
        title: `A prefix originating in AS${BGP_CHAIN[0]}`,
        lines: [
          ...BGP_CHAIN.slice(1).map((asn, i) => `AS${asn} receives AS_PATH ${bgpPaths[i].join(" ")}.`),
          `If AS${BGP_CHAIN[BGP_CHAIN.length - 1]} passed it on to AS${BGP_CHAIN[0]}, the path would be ${bgpLoop.join(" ")}. It contains AS${BGP_CHAIN[0]}, so AS${BGP_CHAIN[0]} ${acceptsAsPath(BGP_CHAIN[0], bgpLoop) ? "accepts" : "rejects"} it.`,
        ],
      },
    },
  ],
};

export const lessonsFor = (gym: number): Lesson[] => LESSONS[gym] ?? [];

/** Lessons open by themselves before a gym's battle until the player has read (or skipped) them once. */
export function showLessonsFirst(gym: number, seen: readonly number[]): boolean {
  return lessonsFor(gym).length > 0 && !seen.includes(gym);
}

export function markLessonsSeen(seen: readonly number[], gym: number): number[] {
  return [...new Set([...seen, gym])].sort((a, b) => a - b);
}

// exported for tests
export const WORKED = { krCircuit, krOverload, dTrans, dProp, bdp, crcRes, crcRecv, hamFlipped, hamSyndrome, cdMinBits, subNets, vlsmPlan, lpmWinner, lpmMatches, fragList, dijSteps, dijRes, bfRounds, ctiPlain, ctiPoison, bgpPaths };
