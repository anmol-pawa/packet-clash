/**
 * Encapsulation: what an attack's packet looks like as it goes down the
 * sender's stack and back up the receiver's.
 *
 * A move of a given layer starts as that layer's PDU (an HTTP message, a TLS
 * record, a TCP segment, an IP packet carrying ICMP, an Ethernet frame
 * carrying ARP, or a bare preamble for Physical). Each layer below adds its
 * header (Ethernet also adds its FCS trailer, and pads short payloads up to
 * the 46-byte minimum), and the physical layer sends the frame as bits behind
 * a 7-byte preamble and 1-byte start frame delimiter. The receiver strips
 * them in reverse, up to the move's own layer, and that PDU is what hits.
 *
 * Sizes are the real minimums: Ethernet II 14 + 4, IPv4 20, TCP 20 (no
 * options), TLS record header 5, ICMP echo 8 + data, ARP over Ethernet 28.
 */
import type { PacketType } from "./types";

export type BlockKind = "header" | "trailer" | "payload";

export interface Block {
  /** Short chip label (A–Z, 0–9). */
  label: string;
  /** Whose block it is (payloads take the layer that produced them). */
  layer: PacketType;
  bytes: number;
  kind: BlockKind;
}

export interface PduStep {
  /** The PDU's name at this layer ("segment", "frame"…). */
  pdu: string;
  layer: PacketType;
  /** The blocks in wire order. */
  blocks: Block[];
}

export const ETH_HEADER = 14;
export const ETH_FCS = 4;
export const ETH_MIN_PAYLOAD = 46;
export const PREAMBLE_SFD = 8;
export const IPV4_HEADER = 20;
export const TCP_HEADER = 20;
export const TLS_RECORD_HEADER = 5;
export const ICMP_ECHO_HEADER = 8;
export const ARP_ETHERNET = 28;

/** The application message a move carries. */
export const HTTP_REQUEST = "GET / HTTP/1.1\r\nHost: gym\r\n\r\n";
/** Bytes of user data in a segment, ciphertext in a TLS record, and data in an ICMP echo. */
export const DATA_BYTES = 32;

const header = (label: string, layer: PacketType, bytes: number): Block => ({ label, layer, bytes, kind: "header" });

/** The PDU a move of `type` starts as, before any lower layer touches it. */
function innermost(type: PacketType): PduStep {
  switch (type) {
    case "APPLICATION":
      return { pdu: "message", layer: "APPLICATION", blocks: [{ label: "HTTP", layer: "APPLICATION", bytes: HTTP_REQUEST.length, kind: "payload" }] };
    case "SECURITY":
      return { pdu: "record", layer: "SECURITY", blocks: [header("TLS", "SECURITY", TLS_RECORD_HEADER), { label: "DATA", layer: "SECURITY", bytes: DATA_BYTES, kind: "payload" }] };
    case "TRANSPORT":
      return { pdu: "segment", layer: "TRANSPORT", blocks: [header("TCP", "TRANSPORT", TCP_HEADER), { label: "DATA", layer: "APPLICATION", bytes: DATA_BYTES, kind: "payload" }] };
    case "NETWORK":
      return { pdu: "packet", layer: "NETWORK", blocks: [header("IP", "NETWORK", IPV4_HEADER), { label: "ICMP", layer: "NETWORK", bytes: ICMP_ECHO_HEADER + DATA_BYTES, kind: "payload" }] };
    case "LINK":
      return frame([{ label: "ARP", layer: "LINK", bytes: ARP_ETHERNET, kind: "payload" }]);
    case "PHYSICAL":
      return bits([]);
  }
}

/** Wraps a payload in an Ethernet II frame, padding it to the minimum. */
function frame(payload: Block[]): PduStep {
  const size = payload.reduce((n, b) => n + b.bytes, 0);
  const pad: Block[] = size < ETH_MIN_PAYLOAD ? [{ label: "PAD", layer: "LINK", bytes: ETH_MIN_PAYLOAD - size, kind: "trailer" }] : [];
  return { pdu: "frame", layer: "LINK", blocks: [header("ETH", "LINK", ETH_HEADER), ...payload, ...pad, { label: "FCS", layer: "LINK", bytes: ETH_FCS, kind: "trailer" }] };
}

function bits(frameBlocks: Block[]): PduStep {
  return { pdu: "bits", layer: "PHYSICAL", blocks: [header("PRE", "PHYSICAL", PREAMBLE_SFD), ...frameBlocks] };
}

/** Each layer below the move's adds its header, top-down. Innermost PDU first, the bits on the wire last. */
export function encapsulate(type: PacketType): PduStep[] {
  const steps = [innermost(type)];
  const top = () => steps[steps.length - 1];
  // A TLS record and an HTTP message both ride in a TCP segment.
  if (type === "APPLICATION" || type === "SECURITY") steps.push({ pdu: "segment", layer: "TRANSPORT", blocks: [header("TCP", "TRANSPORT", TCP_HEADER), ...top().blocks] });
  if (top().layer === "TRANSPORT") steps.push({ pdu: "packet", layer: "NETWORK", blocks: [header("IP", "NETWORK", IPV4_HEADER), ...top().blocks] });
  if (top().layer === "NETWORK") steps.push(frame(top().blocks));
  if (top().layer === "LINK") steps.push(bits(top().blocks));
  return steps;
}

/** The receiver's view: the bits first, then each PDU as a header comes off, ending at the move's own PDU. */
export function decapsulate(type: PacketType): PduStep[] {
  return encapsulate(type).reverse();
}

export function totalBytes(step: PduStep): number {
  return step.blocks.reduce((n, b) => n + b.bytes, 0);
}

/** The blocks `outer` adds around `inner` (inner must sit inside outer, contiguously). */
export function addedBlocks(inner: PduStep, outer: PduStep): { before: Block[]; after: Block[] } {
  const at = outer.blocks.findIndex((_, i) => inner.blocks.every((b, j) => outer.blocks[i + j] === b));
  if (at < 0) throw new Error(`${inner.pdu} is not inside ${outer.pdu}`);
  return { before: outer.blocks.slice(0, at), after: outer.blocks.slice(at + inner.blocks.length) };
}
