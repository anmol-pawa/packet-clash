/**
 * Real-time and API protocols (ROADMAP 5.4): RFC 3550 interarrival jitter, RTP loss accounting,
 * jitter-buffer sizing, VoIP packetisation bandwidth, and the request load and staleness of
 * polling versus long polling.
 */

/**
 * RFC 3550 §6.4.1 / A.8 interarrival jitter. `sendMs[i]` is the RTP timestamp of packet i and
 * `arriveMs[i]` its arrival time, both in ms. D(i-1,i) = (R_i - R_{i-1}) - (S_i - S_{i-1}) and
 * J += (|D| - J) / 16. Returns the final estimate in ms.
 */
export function rtpJitter(sendMs: readonly number[], arriveMs: readonly number[]): number {
  let j = 0;
  for (let i = 1; i < sendMs.length; i++) {
    const d = arriveMs[i] - arriveMs[i - 1] - (sendMs[i] - sendMs[i - 1]);
    j += (Math.abs(d) - j) / 16;
  }
  return j;
}

/** RTCP receiver report counters: packets expected from the sequence range minus those received. */
export function rtpLost(baseSeq: number, highestSeq: number, received: number): number {
  return highestSeq - baseSeq + 1 - received;
}

/** Fraction lost, as RTCP reports it: 8-bit fixed point (lost / expected × 256, truncated). */
export function rtcpFractionLost(expected: number, lost: number): number {
  if (expected <= 0 || lost <= 0) return 0;
  return Math.floor((lost * 256) / expected);
}

/**
 * A fixed jitter buffer must delay playout by the spread of network transit times so the slowest
 * packet still arrives before its turn: max(transit) - min(transit), in ms.
 */
export function jitterBufferMs(transitMs: readonly number[]): number {
  return Math.max(...transitMs) - Math.min(...transitMs);
}

/** Per-packet and per-second figures for a constant-bit-rate voice codec over RTP/UDP/IPv4. */
export function voipBandwidth(codecKbps: number, frameMs: number, headerBytes = 12 + 8 + 20) {
  const payloadBytes = (codecKbps * 1000 * (frameMs / 1000)) / 8;
  const packetsPerSec = 1000 / frameMs;
  const packetBytes = payloadBytes + headerBytes;
  return { payloadBytes, packetsPerSec, packetBytes, ipKbps: (packetBytes * 8 * packetsPerSec) / 1000 };
}

/** Requests per second hitting the server when `clients` each poll every `intervalSec`. */
export function pollingRps(clients: number, intervalSec: number): number {
  return clients / intervalSec;
}

/** Mean time (s) between an event and the poll that notices it, for uniformly random event times. */
export function pollingMeanDelay(intervalSec: number): number {
  return intervalSec / 2;
}

/**
 * Long polling: each client keeps one request parked and reconnects right after every reply, so
 * the request rate is clients × events-per-client-per-second (plus timeouts every `timeoutSec`).
 */
export function longPollRps(clients: number, eventsPerClientPerSec: number, timeoutSec: number): number {
  return clients * Math.max(eventsPerClientPerSec, 1 / timeoutSec);
}
