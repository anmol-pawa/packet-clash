/**
 * 5.3 modern-transport problems: Mathis throughput, window-scale shift for a pipe, slow-start
 * rounds from an initial window, TIME_WAIT connection-rate limits, bufferbloat delay and
 * time-to-first-byte round trips. Answers come from `lib/net/perf`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { HTTP_STACKS, bdpBytes, firstByteTrips, mathisBps, maxConnsPerSec, queueDelayMs, slowStartRounds, windowScaleShift, type HttpStack } from "@/lib/net/perf";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "TRANSPORT" } as const;

export const mathisGen: Generator = {
  id: "gen-sde-mathis",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const mss = pick(r, [1200, 1360, 1460]);
    const rttMs = pick(r, [20, 50, 80, 100, 200]);
    const lossPct = pick(r, [0.01, 0.04, 0.25, 1]);
    const mbps = Math.round((mathisBps(mss, rttMs / 1000, lossPct / 100) / 1e6) * 10) / 10;
    return {
      id: `gen-sde-mathis:${mss}:${rttMs}:${lossPct}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A long-lived loss-based TCP flow has MSS = ${mss} bytes, RTT = ${rttMs} ms and a random loss rate of ${lossPct}%. Using the Mathis bound, rate ≈ (MSS / RTT) × 1.22 / √p, what is the steady-state throughput in Mbit/s (to 1 decimal place)?`,
      answer: mbps,
      tolerance: 0.1,
      unit: "Mbit/s",
      explain: `(${mss} × 8 bits / ${rttMs / 1000} s) × 1.22 / √${lossPct / 100} = ${mbps} Mbit/s. Throughput falls with RTT and with the square root of loss, whatever the link capacity, which is why long lossy paths need BBR or fewer losses.`,
    } satisfies Question;
  },
};

export const scaleGen: Generator = {
  id: "gen-sde-wscale",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const mbps = pick(r, [100, 200, 500, 1000, 2500, 10000]);
    const rttMs = pick(r, [10, 40, 80, 120, 250]);
    const bdp = bdpBytes(mbps * 1e6, rttMs / 1000);
    const shift = windowScaleShift(bdp);
    return {
      id: `gen-sde-wscale:${mbps}:${rttMs}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A path has ${mbps} Mbit/s of bandwidth and a ${rttMs} ms RTT. The TCP window field is 16 bits (max 65,535) and is multiplied by 2^shift when window scaling is on. What is the smallest shift that lets one connection fill the pipe (window ≥ bandwidth-delay product)?`,
      answer: shift,
      explain: `BDP = ${mbps} Mbit/s × ${rttMs / 1000} s / 8 = ${Math.round(bdp).toLocaleString("en-US")} bytes. 65,535 × 2^${shift} = ${(65535 * 2 ** shift).toLocaleString("en-US")} bytes is the first window that covers it${shift > 0 ? ` (2^${shift - 1} would give only ${(65535 * 2 ** (shift - 1)).toLocaleString("en-US")})` : ""}. Throughput is capped at window / RTT.`,
    } satisfies Question;
  },
};

export const slowStartGen: Generator = {
  id: "gen-sde-slowstart",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const iw = pick(r, [1, 3, 4, 10]);
    const mss = 1000;
    const kb = randInt(r, 20, 400);
    const rounds = slowStartRounds(kb * 1000, iw, mss);
    return {
      id: `gen-sde-slowstart:${iw}:${kb}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A server answers over an established TCP connection with initial congestion window = ${iw} segment${iw > 1 ? "s" : ""} of 1000 bytes. Assuming no loss, slow start doubling every RTT and no receiver limit, how many RTTs does it take to send a ${kb} KB (${kb * 1000} bytes) response?`,
      answer: rounds,
      explain: `The window sends ${iw}, ${iw * 2}, ${iw * 4}… segments per RTT. The ${kb * 1000 / mss} segments needed are all sent after ${rounds} round${rounds > 1 ? "s" : ""}: ${iw}×(2^${rounds} − 1) = ${iw * (2 ** rounds - 1)} ≥ ${kb * 1000 / mss}. A larger initial window saves round trips on small responses.`,
    } satisfies Question;
  },
};

export const timeWaitGen: Generator = {
  id: "gen-sde-timewait",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const [lo, hi] = pick(r, [[32768, 60999], [1024, 65535], [10000, 59999], [49152, 65535]] as const);
    const tw = pick(r, [30, 60, 120]);
    const rate = maxConnsPerSec(lo, hi, tw);
    return {
      id: `gen-sde-timewait:${lo}:${hi}:${tw}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A client opens a new short-lived TCP connection to the same server IP and port, closing each one first. Its ephemeral port range is ${lo}-${hi} and each closed connection stays in TIME_WAIT for ${tw} s. What is the highest sustainable rate of new connections per second, rounded down?`,
      answer: rate,
      explain: `The range holds ${hi - lo + 1} ports, and each is unusable for ${tw} s after closing, so the sustained maximum is ${hi - lo + 1} / ${tw} = ${rate} connections/s. Beyond that you see 'cannot assign requested address'. Reuse connections with keep-alive or pooling, or add source IPs.`,
    } satisfies Question;
  },
};

export const bloatGen: Generator = {
  id: "gen-sde-bufferbloat",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mbps = pick(r, [5, 10, 20, 50, 100]);
    const kb = pick(r, [64, 125, 250, 500, 1000]);
    const ms = Math.round(queueDelayMs(kb * 1000, mbps * 1e6) * 10) / 10;
    return {
      id: `gen-sde-bufferbloat:${mbps}:${kb}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A router's uplink runs at ${mbps} Mbit/s and its queue holds ${kb} KB (${kb * 1000} bytes). A bulk upload keeps the queue full. How much extra queueing delay, in ms, does a packet arriving at the full queue see?`,
      answer: ms,
      tolerance: 0.1,
      unit: "ms",
      explain: `The packet waits for the queue ahead of it to drain: ${kb * 1000} × 8 bits / ${mbps} Mbit/s = ${ms} ms, on top of the normal RTT. That standing queue is bufferbloat; AQM such as FQ-CoDel or a delay-based sender like BBR keeps it short.`,
    } satisfies Question;
  },
};

const STACKS = Object.keys(HTTP_STACKS) as HttpStack[];

export const firstByteGen: Generator = {
  id: "gen-sde-firstbyte",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const stack = pick(r, STACKS);
    const rtt = pick(r, [20, 30, 50, 80, 120]);
    const trips = firstByteTrips(stack);
    return {
      id: `gen-sde-firstbyte:${stack}:${rtt}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `Using ${HTTP_STACKS[stack].label}, with a ${rtt} ms RTT and negligible server time and DNS already resolved, how many ms pass from the client's first packet until the first response byte arrives?`,
      answer: trips * rtt,
      unit: "ms",
      explain: `${trips} round trip${trips > 1 ? "s" : ""} × ${rtt} ms = ${trips * rtt} ms. Counting TCP (1 RTT), TLS 1.2 (2), TLS 1.3 (1), QUIC (1, transport and crypto together) and the request/response itself (1); resumption with 0-RTT sends the request in the first flight.`,
    } satisfies Question;
  },
};

export const PERF_GENERATORS: readonly Generator[] = [mathisGen, scaleGen, slowStartGen, timeWaitGen, bloatGen, firstByteGen];
