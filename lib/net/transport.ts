/**
 * Transport-layer solvers: TCP sequence/acknowledgement numbers, the
 * connection state machine, Go-Back-N vs Selective Repeat retransmissions,
 * sliding-window utilisation and per-RTT congestion control (slow start, AIMD,
 * fast retransmit/recovery). Worked examples: Kurose & Ross §3.4–3.7.
 */

const SEQ_MOD = 2 ** 32;

/** A sequence number plus `bytes`, wrapped to 32 bits. */
export const seqAdd = (seq: number, bytes: number): number => (seq + bytes) % SEQ_MOD;

export interface TcpSegment {
  from: "client" | "server";
  flags: string;
  seq: number;
  /** Acknowledgement number, or null when the ACK flag is not set. */
  ack: number | null;
  /** Payload bytes. */
  len: number;
}

/** The three-way handshake: SYN (seq x), SYN-ACK (seq y, ack x+1), ACK (seq x+1, ack y+1). SYN and FIN each use one sequence number. */
export function handshake(clientIsn: number, serverIsn: number): TcpSegment[] {
  return [
    { from: "client", flags: "SYN", seq: clientIsn, ack: null, len: 0 },
    { from: "server", flags: "SYN+ACK", seq: serverIsn, ack: seqAdd(clientIsn, 1), len: 0 },
    { from: "client", flags: "ACK", seq: seqAdd(clientIsn, 1), ack: seqAdd(serverIsn, 1), len: 0 },
  ];
}

/** The ack number a receiver returns after getting `bytes` of in-order data from a peer whose ISN was `isn`. */
export const ackAfter = (isn: number, bytes: number): number => seqAdd(isn, 1 + bytes);

/** The sequence number of each successive data segment of the given sizes, starting after the SYN. */
export function segmentSeqs(isn: number, sizes: readonly number[]): number[] {
  let next = seqAdd(isn, 1);
  return sizes.map((s) => {
    const seq = next;
    next = seqAdd(next, s);
    return seq;
  });
}

export type TcpState =
  | "CLOSED" | "LISTEN" | "SYN_SENT" | "SYN_RCVD" | "ESTABLISHED"
  | "FIN_WAIT_1" | "FIN_WAIT_2" | "TIME_WAIT" | "CLOSE_WAIT" | "LAST_ACK";

/** States visited by the side that opens (client) and closes first (active close). */
export const ACTIVE_OPEN_CLOSE: readonly TcpState[] = ["CLOSED", "SYN_SENT", "ESTABLISHED", "FIN_WAIT_1", "FIN_WAIT_2", "TIME_WAIT", "CLOSED"];

/** States visited by the side that listens (server) and closes second (passive close). */
export const PASSIVE_OPEN_CLOSE: readonly TcpState[] = ["CLOSED", "LISTEN", "SYN_RCVD", "ESTABLISHED", "CLOSE_WAIT", "LAST_ACK", "CLOSED"];

/** The state machine's transitions: [from, event, to]. */
export const TCP_TRANSITIONS: readonly (readonly [TcpState, string, TcpState])[] = [
  ["CLOSED", "passive open", "LISTEN"],
  ["CLOSED", "send SYN", "SYN_SENT"],
  ["LISTEN", "recv SYN / send SYN+ACK", "SYN_RCVD"],
  ["SYN_SENT", "recv SYN+ACK / send ACK", "ESTABLISHED"],
  ["SYN_RCVD", "recv ACK", "ESTABLISHED"],
  ["ESTABLISHED", "close / send FIN", "FIN_WAIT_1"],
  ["ESTABLISHED", "recv FIN / send ACK", "CLOSE_WAIT"],
  ["FIN_WAIT_1", "recv ACK", "FIN_WAIT_2"],
  ["FIN_WAIT_2", "recv FIN / send ACK", "TIME_WAIT"],
  ["CLOSE_WAIT", "close / send FIN", "LAST_ACK"],
  ["LAST_ACK", "recv ACK", "CLOSED"],
  ["TIME_WAIT", "2·MSL timeout", "CLOSED"],
];

/**
 * Packets transmitted to deliver `n` packets with a window of `w` when packet
 * `lost` (0-based) is lost once and the window is full at that moment.
 * Go-Back-N resends the lost packet and every packet already sent after it.
 */
export function goBackNTransmissions(n: number, w: number, lost: number): number {
  return n + Math.min(w, n - lost);
}

/** Selective Repeat resends only the lost packet. */
export const selectiveRepeatTransmissions = (n: number): number => n + 1;

/** Sender utilisation with `window` packets of `bits` in flight on a link of `bps` with round-trip `rtt` seconds (K&R §3.4). */
export function windowUtilization(bits: number, bps: number, rtt: number, window = 1): number {
  const tx = bits / bps;
  return Math.min(1, (window * tx) / (rtt + tx));
}

/** The window that keeps the pipe full: ⌈(RTT + L/R) / (L/R)⌉ packets. */
export function fullPipeWindow(bits: number, bps: number, rtt: number): number {
  const tx = bits / bps;
  return Math.ceil((rtt + tx) / tx - 1e-9);
}

/** Flow control: the receiver advertises RcvBuffer − (LastByteRcvd − LastByteRead). */
export const advertisedWindow = (rcvBuffer: number, lastRcvd: number, lastRead: number): number => rcvBuffer - (lastRcvd - lastRead);

/** Bytes a sender may still send: min(cwnd, rwnd) minus what is already in flight, never negative. */
export const sendable = (cwnd: number, rwnd: number, inFlight: number): number => Math.max(0, Math.min(cwnd, rwnd) - inFlight);

export type LossEvent = "dup3" | "timeout";

export interface CwndOptions {
  rounds: number;
  /** Initial cwnd in MSS (default 1). */
  init?: number;
  ssthresh: number;
  /** Loss detected at the end of the given RTT round (0-based). */
  losses?: Readonly<Record<number, LossEvent>>;
  /** Tahoe drops to 1 MSS on a triple duplicate ACK; Reno (default) halves. */
  variant?: "reno" | "tahoe";
}

export interface CwndResult {
  /** cwnd in MSS during each round. */
  cwnd: number[];
  /** ssthresh in effect during each round. */
  ssthresh: number[];
}

/** cwnd per RTT: exponential in slow start (capped at ssthresh), +1 MSS per round in congestion avoidance, multiplicative decrease on loss. */
export function cwndSeries(o: CwndOptions): CwndResult {
  let cwnd = o.init ?? 1;
  let ssthresh = o.ssthresh;
  const out: CwndResult = { cwnd: [], ssthresh: [] };
  for (let t = 0; t < o.rounds; t++) {
    out.cwnd.push(cwnd);
    out.ssthresh.push(ssthresh);
    const loss = o.losses?.[t];
    if (loss) {
      ssthresh = Math.max(Math.floor(cwnd / 2), 2);
      cwnd = loss === "dup3" && o.variant !== "tahoe" ? ssthresh : 1;
    } else if (cwnd < ssthresh) {
      cwnd = Math.min(cwnd * 2, ssthresh);
    } else {
      cwnd += 1;
    }
  }
  return out;
}
