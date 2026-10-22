import { encapsulate, totalBytes } from "@/game/engine/encap";
import { CERT_CHAIN, DH_DEMO, BF_DEST, DHCP_DEMO, DNS_FLOW, HTTP_DEMO, BGP_CHAIN, CRC_DEMO, CTI_GRAPH, CWND_DEMO, HANDSHAKE_DEMO, WINDOW_DEMO, windowSends, ROUTE_DEMO, FRAG_DEMO, HAMMING_DEMO, LPM_DEMO, MAC_DEMO, SUBNET_DEMO, VLSM_DEMO } from "@/game/art/lessons";
import { URL_JOURNEY, connectRtts, journeyRtts } from "@/lib/net/journey";
import { diffieHellman, TLS13_HANDSHAKE } from "@/lib/net/security";
import { DHCP_DORA, dhcpTimers, dnsCost, pageLoadRtts } from "@/lib/net/application";
import { acceptsAsPath, afterLinkChange, asPaths, bellmanFordRounds, dijkstra, dijkstraSteps, nextHop, pathTo } from "@/lib/net/routing";
import { fragment, longestPrefixMatch, splitSubnets, vlsmAllocate } from "@/lib/net/addressing";
import { blockSize, broadcastOf, formatCidr, formatIp, hostRange, parseCidr, parseIp, usableHosts } from "@/lib/net/ipv4";
import { ackAfter, cwndSeries, fullPipeWindow, goBackNTransmissions, handshake, selectiveRepeatTransmissions, windowUtilization } from "@/lib/net/transport";
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

export type Figure = "layers" | "encap" | "switching" | "delays" | "crc" | "hamming" | "csmacd" | "macLearn" | "subnet" | "vlsm" | "lpm" | "frag" | "dijkstra" | "bellman" | "cti" | "bgp" | "tcpflow" | "window" | "cwnd" | "dns" | "http" | "dora" | "tls" | "pki" | "dh" | "journey" | "budget" | "connect";

export interface Lesson {
  id: string;
  title: string;
  figure: Figure;
  /** One-line caption under the figure. */
  caption: string;
  paras: string[];
  /** A worked example, one line per step. */
  example?: { title: string; lines: string[] };
  /** An interactive page that goes with the card. */
  tool?: { href: string; label: string };
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

// gym 5: the handshake and teardown, Go-Back-N vs Selective Repeat with packet 2 lost, Reno's cwnd over 18 RTTs
const hsSegs = handshake(HANDSHAKE_DEMO.clientIsn, HANDSHAKE_DEMO.serverIsn);
const DATA_BYTES = 200;
const dataAck = ackAfter(HANDSHAKE_DEMO.clientIsn, DATA_BYTES);
const gbnSends = windowSends("gbn");
const srSends = windowSends("sr");
const sendList = (list: { pkt: number }[]) => list.map((s) => s.pkt).join(" ");
const gbnCount = goBackNTransmissions(WINDOW_DEMO.packets, WINDOW_DEMO.window, WINDOW_DEMO.lost);
const srCount = selectiveRepeatTransmissions(WINDOW_DEMO.packets);
// K&R §3.4: 8000-bit packets on a 1 Gbps link with a 30 ms round trip
const KR_BITS = 8000;
const KR_BPS = 1e9;
const KR_RTT = 0.03;
const uStop = windowUtilization(KR_BITS, KR_BPS, KR_RTT, 1);
const uThree = windowUtilization(KR_BITS, KR_BPS, KR_RTT, 3);
const pipeWindow = fullPipeWindow(KR_BITS, KR_BPS, KR_RTT);
const pct = (u: number) => `${(u * 100).toFixed(3)}%`;
const cw = cwndSeries(CWND_DEMO);
const lossRounds = Object.keys(CWND_DEMO.losses).map(Number);

// gym 6: the DNS card's cold lookup, the HTTP card's page and 4 objects, the DHCP card's 8-hour lease
const dnsCold = dnsCost("iterative", "none");
const dnsTld = dnsCost("iterative", "tld");
const dnsAnswer = dnsCost("iterative", "answer");
const httpRtts = { np: pageLoadRtts("non-persistent", HTTP_DEMO.objects), p: pageLoadRtts("persistent", HTTP_DEMO.objects), pl: pageLoadRtts("pipelined", HTTP_DEMO.objects), np4: pageLoadRtts("non-persistent", HTTP_DEMO.objects, 4) };
const dhcp = dhcpTimers(DHCP_DEMO.leaseHours * 3600);

const jCold = journeyRtts("none", "tcp-tls13");
const jTld = journeyRtts("tld", "tcp-tls13");
const jAnswer = journeyRtts("answer", "tcp-tls13");
const jBrowser = journeyRtts("browser", "tcp-tls13");
const jQuic = journeyRtts("browser", "quic-0rtt");

const dh = diffieHellman(DH_DEMO.p, DH_DEMO.g, DH_DEMO.a, DH_DEMO.b);

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
  5: [
    {
      id: "tcp-connection",
      title: "Handshake and teardown",
      figure: "tcpflow",
      tool: { href: "/tcp", label: "STEP THROUGH IT ▶" },
      caption: "Three segments to open, four to close.",
      paras: [
        "TCP is connection-oriented: before data flows, both sides agree on starting sequence numbers (ISNs). The client sends a SYN with its ISN, the server answers SYN+ACK with its own ISN and an ack of the client's ISN + 1, and the client's ACK completes it. A SYN or FIN consumes one sequence number, which is why every ack is \"+1\".",
        "Closing is per direction. The side that closes first sends a FIN, gets an ACK (FIN_WAIT_2), and later receives the other side's FIN, which it ACKs. It then waits in TIME_WAIT for 2·MSL so the last ACK can be retransmitted if lost and old segments die out. The other side only needs that final ACK to reach CLOSED.",
      ],
      example: {
        title: `ISNs ${HANDSHAKE_DEMO.clientIsn} (client) and ${HANDSHAKE_DEMO.serverIsn} (server)`,
        lines: [
          ...hsSegs.map((s) => `${s.from === "client" ? "Client" : "Server"} sends ${s.flags}, seq ${s.seq}${s.ack === null ? "" : `, ack ${s.ack}`}.`),
          `The client then sends ${DATA_BYTES} bytes starting at seq ${hsSegs[2].seq}; the server acknowledges ${dataAck} (${hsSegs[2].seq} + ${DATA_BYTES}).`,
        ],
      },
    },
    {
      id: "sliding-window",
      title: "Sliding windows: GBN and SR",
      figure: "window",
      caption: "The same loss, two recoveries.",
      paras: [
        "Stop-and-wait sends one packet per round trip, so a fast long link sits idle. A sliding window lets the sender keep up to N unacknowledged packets in flight; the window slides forward as acks arrive.",
        "When a packet is lost, Go-Back-N's receiver accepts only in-order packets and discards the rest, so on a timeout the sender resends the lost packet and everything after it in the window. Selective Repeat's receiver buffers out-of-order packets and acks each one, so only the lost packet is resent. GBN is simpler; SR wastes less bandwidth but needs a buffer and a window of at most half the sequence space.",
      ],
      example: {
        title: `${WINDOW_DEMO.packets} packets, window ${WINDOW_DEMO.window}, packet ${WINDOW_DEMO.lost} lost once`,
        lines: [
          `Go-Back-N sends ${sendList(gbnSends)}: ${gbnCount} transmissions.`,
          `Selective Repeat sends ${sendList(srSends)}: ${srCount} transmissions.`,
          `Utilisation (K&R §3.4: ${n(KR_BITS)}-bit packets, 1 Gbps, 30 ms RTT): stop-and-wait ${pct(uStop)}, window of 3 ${pct(uThree)}.`,
          `Filling that pipe would take ${n(pipeWindow)} packets in flight.`,
        ],
      },
    },
    {
      id: "congestion-control",
      title: "Congestion control: the sawtooth",
      figure: "cwnd",
      caption: "cwnd per round trip: double, add one, cut.",
      paras: [
        "Flow control protects the receiver (rwnd); congestion control protects the network (cwnd). The sender may have min(cwnd, rwnd) bytes in flight. cwnd starts at 1 MSS and doubles every RTT in slow start until it reaches ssthresh, then grows by 1 MSS per RTT (additive increase).",
        "On three duplicate ACKs Reno treats the loss as mild: ssthresh = cwnd/2 and cwnd = ssthresh (multiplicative decrease, fast recovery). On a timeout the network looks badly congested: ssthresh = cwnd/2 and cwnd falls to 1 MSS to slow-start again. Tahoe drops to 1 MSS in both cases. The additive-increase, multiplicative-decrease pattern draws the sawtooth.",
      ],
      example: {
        title: `Reno, ssthresh ${CWND_DEMO.ssthresh}, loss events at RTT ${lossRounds.join(" and ")}`,
        lines: [
          `Slow start: cwnd = ${cw.cwnd.slice(0, 4).join(", ")} MSS, capped at ssthresh ${CWND_DEMO.ssthresh}.`,
          `Additive increase: ${cw.cwnd.slice(4, lossRounds[0] + 1).join(", ")} MSS, one more each RTT.`,
          `Triple duplicate ACK at cwnd ${cw.cwnd[lossRounds[0]]}: ssthresh = ${cw.ssthresh[lossRounds[0] + 1]}, cwnd = ${cw.cwnd[lossRounds[0] + 1]}.`,
          `Timeout at cwnd ${cw.cwnd[lossRounds[1]]}: ssthresh = ${cw.ssthresh[lossRounds[1] + 1]}, cwnd = ${cw.cwnd[lossRounds[1] + 1]}, then slow start again.`,
        ],
      },
    },
  ],
  6: [
    {
      id: "dns-resolution",
      title: "DNS: resolving a name",
      figure: "dns",
      caption: "Eight messages for a cold lookup.",
      paras: [
        "DNS maps names to IP addresses through a hierarchy: root servers know who runs each top-level domain (.com), TLD servers know who runs each domain (example.com), and that domain's authoritative server holds the actual records (A for IPv4, AAAA for IPv6, CNAME for an alias, MX for mail, NS for the delegation). The host only talks to its local (recursive) resolver, which does the walking and caches what it learns.",
        "In an iterative lookup the local server asks each server in turn and each one answers with a referral to the next (\"ask the .com servers\"). In a recursive lookup a server asks the next one on your behalf and passes the answer back, which loads the upper servers. Caching is why the root is rarely contacted: a cached TLD server skips the root, a cached answer skips everything until its TTL expires.",
      ],
      example: {
        title: "Iterative lookup, local server with cold caches",
        lines: [
          `${DNS_FLOW.length} messages on the wire: host to local, three server queries with three replies, local to host.`,
          `Servers contacted: ${dnsCold.serversContacted} (root, TLD, authoritative), all queried by the local server; ${dnsCold.messages} messages in all.`,
          `With the TLD server cached the root is skipped: ${dnsTld.serversContacted} servers, ${dnsTld.messages} messages.`,
          `With the answer cached: ${dnsAnswer.serversContacted} servers, ${dnsAnswer.messages} messages (the host and its resolver only).`,
        ],
      },
    },
    {
      id: "http-versions",
      title: "HTTP: versions and round trips",
      figure: "http",
      caption: `A page with ${HTTP_DEMO.objects} images, counted in RTTs.`,
      paras: [
        "Round trips decide how fast a page loads. Early HTTP opened a new TCP connection for every object: 2 RTTs each (handshake, then request and reply). HTTP/1.1 made connections persistent, so after the first 2 RTTs each object costs 1 RTT; with pipelining all the requests go out together and the objects cost 1 RTT in total.",
        "HTTP/1.1 pipelining was brittle (replies must come back in order, so one slow reply blocks the rest). HTTP/2 multiplexes many independent streams over one TCP connection, with header compression, but a single lost TCP segment still stalls every stream. HTTP/3 runs over QUIC on UDP: each stream is recovered separately, so a loss only delays its own stream, and the transport and TLS 1.3 handshakes are combined, saving a round trip on a new connection.",
      ],
      example: {
        title: `One base page and ${HTTP_DEMO.objects} embedded objects, transmission times ignored`,
        lines: [
          `Non-persistent, one connection at a time: 2 + 2 × ${HTTP_DEMO.objects} = ${httpRtts.np} RTTs.`,
          `Non-persistent with ${HTTP_DEMO.objects} parallel connections: 2 + 2 × 1 = ${httpRtts.np4} RTTs.`,
          `Persistent: 2 + ${HTTP_DEMO.objects} × 1 = ${httpRtts.p} RTTs.`,
          `Pipelined (or multiplexed): 2 + 1 = ${httpRtts.pl} RTTs.`,
        ],
      },
    },
    {
      id: "dhcp-dora",
      title: "DHCP: DORA and the lease",
      figure: "dora",
      caption: "Four messages, then a timed lease.",
      paras: [
        `A host with no address cannot use the network, so it broadcasts: ${DHCP_DORA.join(", ")}. The Discover goes from 0.0.0.0 to 255.255.255.255 over UDP (client port 68, server port 67). A server Offers an address and lease, the client Requests it (broadcast, so other servers learn their offers were declined), and the server Acknowledges. The reply can also carry the subnet mask, default gateway and DNS server.`,
        "The address is leased, not owned. At T1 (50% of the lease) the client unicasts a renewal to its server; if that fails, at T2 (87.5%) it broadcasts to any server to rebind; if the lease still runs out it must stop using the address and start again with Discover. A relay agent lets one server serve many subnets by forwarding the broadcast.",
      ],
      example: {
        title: `A ${DHCP_DEMO.leaseHours}-hour lease on ${DHCP_DEMO.ip}`,
        lines: [`Order: ${DHCP_DORA.join(" → ")}.`, `T1 = 50% × ${DHCP_DEMO.leaseHours} h = ${dhcp.t1 / 3600} h: renew with the same server.`, `T2 = 87.5% × ${DHCP_DEMO.leaseHours} h = ${dhcp.t2 / 3600} h: rebind with any server.`, `At ${DHCP_DEMO.leaseHours} h the lease expires.`],
      },
    },
  ],
  7: [
    {
      id: "tls-handshake",
      title: "TLS 1.3: one round trip to keys",
      figure: "tls",
      caption: "Keys after one round trip; everything past ServerHello is encrypted.",
      paras: [
        "TLS sits between TCP and HTTP and gives HTTPS its three guarantees: confidentiality (encryption), integrity (tampering is detected) and authentication (you are talking to the real server). It does this by first agreeing on a fresh symmetric key with an asymmetric exchange, then encrypting the traffic with that fast symmetric cipher.",
        "In TLS 1.3 the client guesses a key-exchange group and sends its key share in the ClientHello. The server answers with its own share in the ServerHello, so both sides can already derive the keys. The certificate, the proof that the server owns its key (CertificateVerify) and the Finished messages all travel encrypted. Each Finished covers the whole transcript, so a tampered handshake is caught.",
      ],
      example: {
        title: "A full TLS 1.3 handshake",
        lines: [...TLS13_HANDSHAKE.map((s, i) => `${i + 1}. ${s}`), `Round trips before the client can send HTTP data: 1 (TLS 1.2 needed 2).`],
      },
    },
    {
      id: "cert-chain",
      title: "Certificates and the chain of trust",
      figure: "pki",
      caption: "Each certificate is signed by the one above; the root is already trusted.",
      paras: [
        "A certificate binds a name to a public key and is signed by a certificate authority (CA). Anyone can claim a key, so the browser checks that a CA it trusts vouched for it. The server sends its own (leaf) certificate plus the intermediate CAs; the root is not sent because the browser already has it in its trust store.",
        "The browser checks that the name matches the site and the dates are valid, then verifies each signature with the public key of the certificate above: the leaf with the intermediate's key, the intermediate with the root's. A root is self-signed, so trust must come from the store. A CA signs with its private key; verification uses its public key, and the server proves it owns the leaf's key in CertificateVerify.",
      ],
      example: {
        title: "Validating example.com",
        lines: CERT_CHAIN.map((c, i) => `${i + 1}. ${c.subject}: signed by ${c.signedBy.toLowerCase()}${i === 0 ? ", found in the trust store" : ""}.`),
      },
    },
    {
      id: "diffie-hellman",
      title: "Diffie-Hellman: a shared secret in public",
      figure: "dh",
      caption: `p = ${DH_DEMO.p}, g = ${DH_DEMO.g}: both sides end with the key ${dh.secret}.`,
      paras: [
        "Two parties agree on a prime p and a generator g in the open. Each picks a private exponent, sends g raised to it (mod p), and raises what it receives to its own exponent. Both land on g^(ab) mod p, because (g^a)^b = (g^b)^a. An eavesdropper sees p, g, g^a and g^b but recovering a means solving the discrete logarithm problem, which is hard for large primes.",
        "Plain Diffie-Hellman gives no authentication, so a man in the middle could run one exchange with each side. TLS therefore signs the exchange with the certificate's key. Real deployments use 2048-bit primes or elliptic curves (ECDHE), and a fresh exponent per connection gives forward secrecy: stealing the server's key later does not reveal old sessions.",
      ],
      example: {
        title: `p = ${DH_DEMO.p}, g = ${DH_DEMO.g}, a = ${DH_DEMO.a}, b = ${DH_DEMO.b}`,
        lines: [
          `Alice sends ${DH_DEMO.g}^${DH_DEMO.a} mod ${DH_DEMO.p} = ${dh.publicA}.`,
          `Bob sends ${DH_DEMO.g}^${DH_DEMO.b} mod ${DH_DEMO.p} = ${dh.publicB}.`,
          `Alice computes ${dh.publicB}^${DH_DEMO.a} mod ${DH_DEMO.p} = ${dh.secret}; Bob computes ${dh.publicA}^${DH_DEMO.b} mod ${DH_DEMO.p} = ${dh.secret}.`,
        ],
      },
    },
  ],
  8: [
    {
      id: "url-journey",
      title: "Typing a URL: the whole journey",
      figure: "journey",
      tool: { href: "/url", label: "STEP THROUGH IT ▶" },
      caption: "Nine steps from the address bar to pixels, in order.",
      paras: [
        "The browser first parses the URL (scheme, host, port, path), checks its HSTS list and its HTTP cache, and looks for the IP address in its own and the OS DNS cache. Only a miss goes on the wire. The first packet out is a DNS query to the recursive resolver; because the resolver is off-link, the host sends it to the default gateway and so needs the gateway's MAC address, which is what ARP is for (broadcast request, unicast reply, then cached).",
        "With the IP address the browser opens a TCP connection to port 443 (three-way handshake), runs the TLS handshake on top, then sends GET / inside the encrypted channel. Routers along the way forward on longest-prefix match and the home router's NAT rewrites the source address and port. The server, often behind a load balancer or CDN edge, answers 200 OK with the HTML, and the browser builds the DOM, fetches CSS, scripts and images over the same connection, and paints.",
      ],
      example: {
        title: "The order to remember",
        lines: URL_JOURNEY.map((st, i) => `${i + 1}. ${st.title}.`),
      },
    },
    {
      id: "rtt-budget",
      title: "The round-trip budget",
      figure: "budget",
      caption: `Cold: ${jCold.total} round trips to the first byte; fully warm over QUIC: ${jQuic.total}.`,
      paras: [
        "Latency is mostly counted in round trips, not bandwidth. Before the first byte of HTML arrives you pay for the name lookup, the connection setup and the request itself. A cold lookup walks root, TLD and the authoritative server, so every cache level saves a round trip: a cached TLD server skips the root, a cached answer leaves only the trip to the resolver, and a browser cache hit costs nothing.",
        "ARP is not in the count: it never leaves the LAN and is cached after the first packet. Each step also costs propagation and processing time, so a round trip to a distant server is far more expensive than one to a CDN edge nearby, which is one reason CDNs exist.",
      ],
      example: {
        title: "HTTPS over TCP with TLS 1.3",
        lines: [
          `Cold: DNS ${jCold.dns} + TCP and TLS ${jCold.connect} + request ${jCold.request} = ${jCold.total} RTT.`,
          `TLD server cached: ${jTld.dns} + ${jTld.connect} + ${jTld.request} = ${jTld.total} RTT.`,
          `Answer cached at the resolver: ${jAnswer.dns} + ${jAnswer.connect} + ${jAnswer.request} = ${jAnswer.total} RTT.`,
          `Address in the browser cache: ${jBrowser.dns} + ${jBrowser.connect} + ${jBrowser.request} = ${jBrowser.total} RTT.`,
          `Warm QUIC with 0-RTT data: ${jQuic.dns} + ${jQuic.connect} + ${jQuic.request} = ${jQuic.total} RTT.`,
        ],
      },
    },
    {
      id: "tls-quic",
      title: "TLS 1.2 vs TLS 1.3 vs QUIC",
      figure: "connect",
      caption: `Connection setup: ${connectRtts("tcp-tls12")}, ${connectRtts("tcp-tls13")}, ${connectRtts("quic")} and ${connectRtts("quic-0rtt")} round trips.`,
      paras: [
        `TCP needs one round trip for its handshake and TLS 1.2 adds two more, ${connectRtts("tcp-tls12")} in all. TLS 1.3 trims its own handshake to one, so TCP with TLS 1.3 takes ${connectRtts("tcp-tls13")}. The request then costs one more round trip.`,
        "QUIC runs over UDP and builds reliability, congestion control and TLS 1.3 into one protocol, so the transport and crypto handshakes happen together in a single round trip. Resuming a known server can send the request along with the first packet (0-RTT), at the price of replay risk for non-idempotent requests. QUIC streams are independent, which removes TCP's head-of-line blocking, and a connection ID lets it survive a change of IP address. HTTP/3 is HTTP over QUIC.",
      ],
      example: {
        title: "Round trips before the request can be sent",
        lines: [`TCP + TLS 1.2: 1 + 2 = ${connectRtts("tcp-tls12")}.`, `TCP + TLS 1.3: 1 + 1 = ${connectRtts("tcp-tls13")}.`, `QUIC: ${connectRtts("quic")}. QUIC resumption with 0-RTT: ${connectRtts("quic-0rtt")}.`],
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
export const WORKED = { krCircuit, krOverload, dTrans, dProp, bdp, crcRes, crcRecv, hamFlipped, hamSyndrome, cdMinBits, subNets, vlsmPlan, lpmWinner, lpmMatches, fragList, dijSteps, dijRes, bfRounds, ctiPlain, ctiPoison, bgpPaths, hsSegs, dataAck, gbnSends, srSends, gbnCount, srCount, uStop, uThree, pipeWindow, cw };
