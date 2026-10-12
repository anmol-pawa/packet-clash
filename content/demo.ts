/**
 * The demo battle's question set (one per turn). Real chapters arrive with the
 * question engine (1.4); these exist to exercise the battle loop end to end.
 */
import { transmissionDelay, usableHosts } from "@/lib/net/basics";

export interface DemoQuestion {
  id: string;
  prompt: string;
  /** Exactly four options, shown as the move menu. */
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explain: string;
}

const hosts26 = usableHosts(26);
const delayMs = transmissionDelay(1000, 1_000_000) * 1000;

export const DEMO_QUESTIONS: readonly DemoQuestion[] = [
  {
    id: "router-layer",
    prompt: "Which OSI layer does a router mainly work at?",
    options: ["Data link (L2)", "Network (L3)", "Transport (L4)", "Physical (L1)"],
    answer: 1,
    explain: "Routers forward packets between networks using IP addresses, which is the network layer (L3).",
  },
  {
    id: "arp",
    prompt: "Which protocol finds the MAC address for an IPv4 address on the local network?",
    options: ["DNS", "DHCP", "ARP", "ICMP"],
    answer: 2,
    explain: "ARP broadcasts “who has this IP?” and the owner replies with its MAC address.",
  },
  {
    id: "hosts-26",
    prompt: "How many usable host addresses does a /26 subnet have?",
    options: ["64", `${hosts26}`, "30", "126"],
    answer: 1,
    explain: `A /26 leaves 6 host bits: 2⁶ = 64 addresses, minus the network and broadcast addresses = ${hosts26}.`,
  },
  {
    id: "syn-reply",
    prompt: "In TCP's 3-way handshake, what does the server send back after a SYN?",
    options: ["ACK", "FIN", "RST", "SYN-ACK"],
    answer: 3,
    explain: "Client SYN → server SYN-ACK → client ACK. The SYN-ACK both acknowledges the client's SYN and carries the server's own SYN.",
  },
  {
    id: "tx-delay",
    prompt: "Transmission delay of a 1,000-byte packet on a 1 Mbps link?",
    options: [`${delayMs} ms`, "1 ms", "0.8 ms", "80 ms"],
    answer: 0,
    explain: `Transmission delay is L/R = 8,000 bits ÷ 1,000,000 bit/s = ${delayMs} ms.`,
  },
  {
    id: "tcp-pdu",
    prompt: "What is a TCP-layer PDU called?",
    options: ["Frame", "Packet", "Segment", "Bit"],
    answer: 2,
    explain: "Transport layer → segment (TCP) or datagram (UDP); network layer → packet; link layer → frame.",
  },
];
