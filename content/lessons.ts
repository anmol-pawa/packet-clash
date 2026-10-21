import { encapsulate, totalBytes } from "@/game/engine/encap";
import { bandwidthDelayProduct, circuitUsers, probMoreThanActive, propagationDelay, transmissionDelay } from "@/lib/net/basics";

/**
 * Concept lessons: a few short illustrated cards per gym, shown the first
 * time the player enters the gym and readable any time from the town on the
 * world map. Every number in a worked example is computed by the same
 * solvers the quiz uses (and checked in tests/lessons.test.ts).
 */

export type Figure = "layers" | "encap" | "switching" | "delays";

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
export const WORKED = { krCircuit, krOverload, dTrans, dProp, bdp };
