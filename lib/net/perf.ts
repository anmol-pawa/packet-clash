/**
 * Modern transport and performance (ROADMAP 5.3): the Mathis throughput bound, window-limited
 * throughput and the window-scale shift needed to fill a pipe, slow-start rounds from an initial
 * window, ephemeral-port / TIME_WAIT connection-rate limits, bufferbloat queueing delay and the
 * round trips each HTTP stack spends before the first response byte.
 */

/** Mathis et al.: rate ≈ (MSS / RTT) × C / √p with C ≈ 1.22 (√(3/2)). Returns bits per second. */
export function mathisBps(mssBytes: number, rttSec: number, loss: number): number {
  return ((mssBytes * 8) / rttSec) * (1.22 / Math.sqrt(loss));
}

/** A sender with a fixed window can have at most one window in flight per RTT. Bits per second. */
export function windowLimitedBps(windowBytes: number, rttSec: number): number {
  return (windowBytes * 8) / rttSec;
}

/** Bandwidth-delay product in bytes. */
export function bdpBytes(linkBps: number, rttSec: number): number {
  return (linkBps * rttSec) / 8;
}

/** Smallest TCP window-scale shift (0-14) so that 65535 << shift covers `windowBytes`; -1 if impossible. */
export function windowScaleShift(windowBytes: number): number {
  for (let s = 0; s <= 14; s++) if (65535 * 2 ** s >= windowBytes) return s;
  return -1;
}

/** Slow start from `iw` segments, doubling every RTT with no loss: RTTs needed to send `bytes` of data. */
export function slowStartRounds(bytes: number, iw: number, mss: number): number {
  const segments = Math.ceil(bytes / mss);
  let sent = 0;
  let cwnd = iw;
  let rounds = 0;
  while (sent < segments) {
    sent += cwnd;
    cwnd *= 2;
    rounds++;
  }
  return rounds;
}

/** New outbound connections per second to one destination before ephemeral ports run out (each lingers TIME_WAIT). */
export function maxConnsPerSec(portLow: number, portHigh: number, timeWaitSec: number): number {
  return Math.floor((portHigh - portLow + 1) / timeWaitSec);
}

/** Time to drain a full buffer at the bottleneck, in ms: the queueing delay bufferbloat adds. */
export function queueDelayMs(bufferBytes: number, linkBps: number): number {
  return (bufferBytes * 8 * 1000) / linkBps;
}

export type HttpStack = "tcp-tls12" | "tcp-tls13" | "tcp-tls13-0rtt" | "quic" | "quic-0rtt";

export const HTTP_STACKS: Record<HttpStack, { label: string; trips: number }> = {
  "tcp-tls12": { label: "HTTP/1.1 or 2 over TCP + TLS 1.2 (new connection)", trips: 4 },
  "tcp-tls13": { label: "HTTP/2 over TCP + TLS 1.3 (new connection)", trips: 3 },
  "tcp-tls13-0rtt": { label: "HTTP/2 over TCP + TLS 1.3 resumption with 0-RTT early data", trips: 2 },
  quic: { label: "HTTP/3 over QUIC (new connection)", trips: 2 },
  "quic-0rtt": { label: "HTTP/3 over QUIC resumption with 0-RTT", trips: 1 },
};

/** Round trips until the first response byte arrives (handshakes plus the request/response itself). */
export function firstByteTrips(stack: HttpStack): number {
  return HTTP_STACKS[stack].trips;
}
