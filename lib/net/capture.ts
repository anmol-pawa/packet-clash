/**
 * Reading packet captures (ROADMAP 5.8b): a tiny TCP trace model, a tcpdump-style
 * formatter, seeded trace builders for the classic faults, and an analyser that
 * diagnoses a trace from the packets alone. Tests check the analyser against the
 * fault each builder injected, so the page text and the graded answer can't drift.
 */
import { randInt, rng } from "@/lib/rng";

export type Side = "c" | "s";

export interface Pkt {
  /** 1-based packet number, as in Wireshark's No. column. */
  no: number;
  /** Capture timestamp in milliseconds from the first packet. */
  ms: number;
  from: Side;
  /** tcpdump flag letters: S, F, R, P and "." for ACK. */
  flags: string;
  /** Relative sequence number (each direction starts at 0). */
  seq: number;
  /** Relative acknowledgment number; ignored on a bare SYN. */
  ack: number;
  /** TCP payload bytes. */
  len: number;
  win: number;
}

export type CaptureKind = "healthy" | "syn-timeout" | "refused" | "no-final-ack" | "zero-window" | "reset" | "rto" | "fast-retransmit";

export const CAPTURE_KINDS: readonly CaptureKind[] = ["healthy", "syn-timeout", "refused", "no-final-ack", "zero-window", "reset", "rto", "fast-retransmit"];

export const KIND_LABEL: Record<CaptureKind, string> = {
  healthy: "Healthy: handshake, transfer and a clean FIN close",
  "syn-timeout": "SYNs go unanswered: packets are being dropped (firewall or host down)",
  refused: "The SYN is answered with RST: nothing is listening on that port",
  "no-final-ack": "The SYN-ACK is repeated: the client's final ACK never arrives",
  "zero-window": "The receiver advertises a zero window: its application isn't reading",
  reset: "The connection is torn down mid-transfer by a RST",
  rto: "A segment is resent after a timeout (no duplicate ACKs): tail loss",
  "fast-retransmit": "A segment is resent after 3 duplicate ACKs: fast retransmit",
};

export interface Diagnosis {
  kind: CaptureKind;
  /** The packet that gives the fault away (the retransmission, the RST, the first zero window), if any. */
  packet?: number;
  /** For retransmissions: ms between the original segment and the resend. */
  delayMs?: number;
  /** For retransmissions: duplicate ACKs the sender saw before resending. */
  dupAcks?: number;
  /** For resets and zero windows: who sent the packet. */
  from?: Side;
}

const has = (p: Pkt, f: string) => p.flags.includes(f);
const isPureAck = (p: Pkt) => p.flags === "." && p.len === 0;

/** Duplicate ACKs the receiver sent for byte `seq` between two packet numbers (the first ACK is not a duplicate). */
function dupAcksFor(tr: readonly Pkt[], from: Side, seq: number, afterNo: number, beforeNo: number): number {
  const n = tr.filter((p) => p.from !== from && isPureAck(p) && p.ack === seq && p.no > afterNo && p.no < beforeNo).length;
  return Math.max(0, n - 1);
}

/** Diagnoses a TCP trace from the packets alone. */
export function diagnose(tr: readonly Pkt[]): Diagnosis {
  const synack = tr.find((p) => p.from === "s" && p.flags === "S.");
  if (!synack) {
    const rst = tr.find((p) => p.from === "s" && has(p, "R"));
    if (rst) return { kind: "refused", packet: rst.no, from: "s" };
    return { kind: "syn-timeout", packet: tr.filter((p) => p.from === "c" && p.flags === "S").at(-1)?.no };
  }
  if (!tr.some((p) => p.from === "c" && p.no > synack.no && has(p, ".") && p.ack === 1)) return { kind: "no-final-ack", packet: synack.no };

  const rst = tr.find((p) => has(p, "R"));
  if (rst) return { kind: "reset", packet: rst.no, from: rst.from };

  const zero = tr.find((p) => p.win === 0 && !has(p, "S"));
  if (zero) return { kind: "zero-window", packet: zero.no, from: zero.from };

  const maxEnd: Record<Side, number> = { c: 0, s: 0 };
  for (const p of tr) {
    if (p.len === 0) continue;
    const orig = tr.find((q) => q.from === p.from && q.len > 0 && q.seq === p.seq && q.no < p.no);
    if (orig && p.seq + p.len <= maxEnd[p.from]) {
      const dupAcks = dupAcksFor(tr, p.from, p.seq, orig.no, p.no);
      return { kind: dupAcks >= 3 ? "fast-retransmit" : "rto", packet: p.no, delayMs: p.ms - orig.ms, dupAcks };
    }
    maxEnd[p.from] = Math.max(maxEnd[p.from], p.seq + p.len);
  }
  return { kind: "healthy" };
}

export interface Endpoints {
  client: string;
  server: string;
  cport: number;
  sport: number;
}

/** One compact tcpdump-style line: C is the client and S the server (named in the exhibit header), relative sequence numbers. */
export function formatPkt(p: Pkt): string {
  const [src, dst] = p.from === "c" ? ["C", "S"] : ["S", "C"];
  const seq = p.len > 0 ? `${p.seq}:${p.seq + p.len}` : `${p.seq}`;
  const ack = p.flags === "S" ? "" : ` ack ${p.ack}`;
  const no = String(p.no).padStart(2);
  const t = (p.ms / 1000).toFixed(3).padStart(6);
  return `${no} ${t} ${src}>${dst} [${p.flags}] seq ${seq}${ack} win ${p.win} len ${p.len}`;
}

export interface Capture {
  kind: CaptureKind;
  pkts: Pkt[];
  endpoints: Endpoints;
  /** Which host the capture was taken on. */
  point: Side;
  service: string;
  mss: number;
}

class Builder {
  pkts: Pkt[] = [];
  ms = 0;
  add(dt: number, from: Side, flags: string, seq: number, ack: number, len: number, win: number): Pkt {
    this.ms += dt;
    const p = { no: this.pkts.length + 1, ms: this.ms, from, flags, seq, ack, len, win };
    this.pkts.push(p);
    return p;
  }
}

const SERVICES: [number, string][] = [[443, "https"], [80, "http"], [8080, "http-alt"], [5432, "postgresql"], [22, "ssh"], [3306, "mysql"]];
const RTO_MS = [200, 300, 400, 600, 1000];

/** Builds a seeded trace with one injected fault (or none). Sender-side captures see both the original and the resend. */
export function buildCapture(kind: CaptureKind, seed: number): Capture {
  const r = rng(seed);
  const [sport, service] = SERVICES[randInt(r, 0, SERVICES.length - 1)];
  const endpoints: Endpoints = {
    client: r() < 0.5 ? `10.0.${randInt(r, 0, 9)}.${randInt(r, 10, 200)}` : `192.168.${randInt(r, 0, 9)}.${randInt(r, 10, 200)}`,
    server: `203.0.113.${randInt(r, 10, 240)}`,
    cport: randInt(r, 32768, 60999),
    sport,
  };
  const mss = r() < 0.5 ? 1460 : 1448;
  const rtt = randInt(r, 8, 90);
  const cwin = 64240;
  const swin = randInt(r, 0, 1) ? 65160 : 28960;
  const b = new Builder();
  const req = randInt(r, 80, 400);
  let point: Side = "c";

  const syn = () => b.add(0, "c", "S", 0, 0, 0, cwin);
  const handshake = () => {
    syn();
    b.add(rtt, "s", "S.", 0, 1, 0, swin);
    b.add(1, "c", ".", 1, 1, 0, cwin);
  };
  const request = () => {
    b.add(1, "c", "P.", 1, 1, req, cwin);
    b.add(rtt, "s", ".", 1, 1 + req, 0, swin);
  };

  if (kind === "syn-timeout") {
    syn();
    b.add(1000, "c", "S", 0, 0, 0, cwin);
    b.add(2000, "c", "S", 0, 0, 0, cwin);
    if (r() < 0.5) b.add(4000, "c", "S", 0, 0, 0, cwin);
  } else if (kind === "refused") {
    syn();
    b.add(rtt, "s", "R.", 0, 1, 0, 0);
  } else if (kind === "no-final-ack") {
    point = "s";
    b.add(0, "c", "S", 0, 0, 0, cwin);
    b.add(1, "s", "S.", 0, 1, 0, swin);
    b.add(1000, "s", "S.", 0, 1, 0, swin);
    b.add(2000, "s", "S.", 0, 1, 0, swin);
    if (r() < 0.5) b.add(4000, "s", "S.", 0, 1, 0, swin);
  } else if (kind === "healthy") {
    handshake();
    request();
    const segs = randInt(r, 3, 5);
    let seq = 1;
    for (let i = 0; i < segs; i++) {
      b.add(i === 0 ? 8 : 1, "s", i === segs - 1 ? "P." : ".", seq, 1 + req, mss, swin);
      seq += mss;
      if (i % 2 === 1 || i === segs - 1) b.add(1, "c", ".", 1 + req, seq, 0, cwin);
    }
    b.add(5, "s", "F.", seq, 1 + req, 0, swin);
    b.add(rtt, "c", "F.", 1 + req, seq + 1, 0, cwin);
    b.add(1, "s", ".", seq + 1, 2 + req, 0, swin);
  } else if (kind === "reset") {
    handshake();
    request();
    const segs = randInt(r, 2, 4);
    let seq = 1;
    for (let i = 0; i < segs; i++) {
      b.add(i === 0 ? 8 : 1, "s", ".", seq, 1 + req, mss, swin);
      seq += mss;
      b.add(rtt, "c", ".", 1 + req, seq, 0, cwin);
    }
    if (r() < 0.5) b.add(randInt(r, 5, 60) * 1000, "s", "R", seq, 0, 0, 0);
    else b.add(randInt(r, 2, 40), "c", "R.", 1 + req, seq, 0, 0);
  } else if (kind === "zero-window") {
    point = "s";
    handshake();
    request();
    const segs = randInt(r, 4, 6);
    let seq = 1;
    let win = mss * (segs - 1);
    for (let i = 0; i < segs; i++) {
      b.add(i === 0 ? 8 : 1, "s", ".", seq, 1 + req, mss, swin);
      seq += mss;
      win = Math.max(0, win - mss);
      b.add(rtt, "c", ".", 1 + req, seq, 0, win);
    }
    b.add(randInt(r, 500, 3000), "c", ".", 1 + req, seq, 0, 65535);
  } else if (kind === "rto") {
    point = "s";
    handshake();
    request();
    const segs = randInt(r, 2, 4);
    let seq = 1;
    for (let i = 0; i < segs - 1; i++) {
      b.add(i === 0 ? 8 : 1, "s", ".", seq, 1 + req, mss, swin);
      seq += mss;
      b.add(rtt, "c", ".", 1 + req, seq, 0, cwin);
    }
    b.add(1, "s", "P.", seq, 1 + req, mss, swin);
    b.add(RTO_MS[randInt(r, 0, RTO_MS.length - 1)], "s", "P.", seq, 1 + req, mss, swin);
    b.add(rtt, "c", ".", 1 + req, seq + mss, 0, cwin);
  } else {
    point = "s";
    handshake();
    request();
    const segs = randInt(r, 6, 8);
    const lost = randInt(r, 1, 2);
    const start = (i: number) => 1 + i * mss;
    for (let i = 0; i < segs; i++) b.add(i === 0 ? 8 : 1, "s", i === segs - 1 ? "P." : ".", start(i), 1 + req, mss, swin);
    let first = true;
    for (let i = 0; i < segs; i++) {
      if (i === lost) continue;
      b.add(first ? rtt : 1, "c", ".", 1 + req, i < lost ? start(i + 1) : start(lost), 0, cwin);
      first = false;
    }
    b.add(1, "s", ".", start(lost), 1 + req, mss, swin);
    b.add(rtt, "c", ".", 1 + req, start(segs), 0, cwin);
  }
  return { kind, pkts: b.pkts, endpoints, point, service, mss };
}
