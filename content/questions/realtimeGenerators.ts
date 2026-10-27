/**
 * 5.4 real-time problems: RFC 3550 interarrival jitter, RTP loss from sequence numbers, jitter
 * buffer size, VoIP bandwidth with headers, and polling versus long-polling load. Answers come
 * from `lib/net/realtime`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { jitterBufferMs, longPollRps, pollingRps, rtpJitter, rtpLost, voipBandwidth } from "@/lib/net/realtime";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "APPLICATION" } as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US");

export const jitterGen: Generator = {
  id: "gen-sde-rtpjitter",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const gap = pick(r, [10, 20, 30]);
    const n = 5;
    const offset = randInt(r, 20, 80);
    const send = Array.from({ length: n }, (_, i) => i * gap);
    const arrive = send.map((s) => s + offset + randInt(r, 0, 12));
    const j = round2(rtpJitter(send, arrive));
    const steps = send.slice(1).map((s, i) => Math.abs(arrive[i + 1] - arrive[i] - (s - send[i])));
    return {
      id: `gen-sde-rtpjitter:${seed}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `An RTP receiver logs packets with send times (ms): ${send.join(", ")}. The matching arrival times (ms): ${arrive.join(", ")}. Using the RFC 3550 estimator J += (|D| - J) / 16 starting from J = 0, where D is the change in transit time between consecutive packets, what is J after the last packet, in ms (2 decimal places)?`,
      answer: j,
      tolerance: 0.05,
      unit: "ms",
      explain: `|D| for each step is ${steps.join(", ")} ms (the difference in spacing at the receiver versus the sender; the constant offset cancels). Applying J += (|D| - J)/16 after each gives ${j} ms. The 1/16 gain smooths out single spikes.`,
    } satisfies Question;
  },
};

export const lostGen: Generator = {
  id: "gen-sde-rtplost",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const lo = randInt(r, 1000, 40000);
    const span = randInt(r, 50, 400);
    const hi = lo + span - 1;
    const got = span - randInt(r, 0, Math.floor(span / 5));
    const lost = rtpLost(lo, hi, got);
    return {
      id: `gen-sde-rtplost:${lo}:${hi}:${got}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `An RTCP receiver report covers RTP sequence numbers from ${lo} to ${hi} inclusive (no wraparound). The receiver actually received ${got} packets in that range, with no duplicates. How many packets were lost?`,
      answer: lost,
      explain: `Expected = highest − base + 1 = ${hi} − ${lo} + 1 = ${span}. Lost = expected − received = ${span} − ${got} = ${lost}. RTCP reports this as a cumulative count plus an 8-bit fraction lost.`,
    } satisfies Question;
  },
};

export const bufferGen: Generator = {
  id: "gen-sde-jitterbuf",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const base0 = randInt(r, 20, 90);
    const transit = Array.from({ length: 6 }, () => base0 + randInt(r, 0, 45));
    const buf = jitterBufferMs(transit);
    return {
      id: `gen-sde-jitterbuf:${transit.join("-")}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A voice call measured these one-way transit times (ms): ${transit.join(", ")}. A fixed jitter buffer must hold every packet long enough that the slowest one still arrives before its playout time. What buffer delay, in ms, is needed at minimum?`,
      answer: buf,
      unit: "ms",
      explain: `Playout is scheduled relative to the fastest packet, so the buffer must absorb the spread: max − min = ${Math.max(...transit)} − ${Math.min(...transit)} = ${buf} ms. A bigger buffer hides more jitter but adds the same amount of mouth-to-ear delay; adaptive buffers resize it on the fly.`,
    } satisfies Question;
  },
};

export const voipGen: Generator = {
  id: "gen-sde-voip",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const kbps = pick(r, [8, 16, 24, 64]);
    const ms = pick(r, [10, 20, 30, 40]);
    const v = voipBandwidth(kbps, ms);
    const ip = round2(v.ipKbps);
    return {
      id: `gen-sde-voip:${kbps}:${ms}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A voice codec produces ${kbps} kbit/s and the sender packs one packet every ${ms} ms. Each packet carries an RTP header (12 B), a UDP header (8 B) and an IPv4 header (20 B), ignoring link-layer headers. How many kbit/s does the call use at the IP layer, one direction (2 decimal places)?`,
      answer: ip,
      tolerance: 0.1,
      unit: "kbit/s",
      explain: `Payload = ${kbps} kbit/s × ${ms} ms / 8 = ${v.payloadBytes} B. Packet = ${v.payloadBytes} + 40 = ${v.packetBytes} B, sent ${round2(v.packetsPerSec)} times per second: ${v.packetBytes} × 8 × ${round2(v.packetsPerSec)} = ${ip} kbit/s. Small packets spend a large share of the bandwidth on headers.`,
    } satisfies Question;
  },
};

export const pollGen: Generator = {
  id: "gen-sde-polling",
  ...base,
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const clients = pick(r, [1000, 5000, 20000, 100000, 250000]);
    const every = pick(r, [1, 2, 5, 10, 20, 50]);
    const rps = pollingRps(clients, every);
    return {
      id: `gen-sde-polling:${clients}:${every}`,
      kind: "numeric",
      ...base,
      difficulty: 1,
      prompt: `${fmt(clients)} clients each poll an endpoint with a plain HTTP request every ${every} s. How many requests per second does the server receive on average? (Ignore requests when nothing changed being cheaper.)`,
      answer: rps,
      unit: "req/s",
      explain: `${fmt(clients)} / ${every} = ${fmt(rps)} requests per second, almost all returning "no change". A new event is noticed ${every / 2} s late on average (half the interval). Long polling, SSE or WebSockets push instead.`,
    } satisfies Question;
  },
};

export const longPollGen: Generator = {
  id: "gen-sde-longpoll",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const clients = pick(r, [6000, 12000, 60000]);
    const every = pick(r, [10, 20, 30, 60, 120, 300]);
    const timeout = pick(r, [30, 60]);
    const rps = Math.round(longPollRps(clients, 1 / every, timeout));
    return {
      id: `gen-sde-longpoll:${clients}:${every}:${timeout}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `${fmt(clients)} clients use long polling: each keeps one request open and re-issues it immediately after any reply. Every client receives an event once every ${every} s on average, and the server's idle timeout is ${timeout} s (it replies empty and the client reconnects). On average, how many new requests per second arrive at the server?`,
      answer: rps,
      unit: "req/s",
      explain: `Each client reconnects after every event or timeout, whichever comes first, so its rate is max(1/${every}, 1/${timeout}) = ${round2(Math.max(1 / every, 1 / timeout))} per second. ${fmt(clients)} × that = ${fmt(rps)} req/s, but each request carries real data or a heartbeat, unlike blind polling at a short interval.`,
    } satisfies Question;
  },
};

export const REALTIME_GENERATORS: readonly Generator[] = [jitterGen, lostGen, bufferGen, voipGen, pollGen, longPollGen];
