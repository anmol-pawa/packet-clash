/**
 * Gym 5's transport problems: sequence/ack numbers, Go-Back-N vs Selective
 * Repeat, window utilisation, flow control and congestion control. Every
 * answer comes from `lib/net/transport`.
 */
import { formatNumber, type Generator, type Question } from "@/game/engine/questions";
import { transmissionDelay } from "@/lib/net/basics";
import {
  advertisedWindow,
  ackAfter,
  cwndSeries,
  fullPipeWindow,
  goBackNTransmissions,
  handshake,
  segmentSeqs,
  selectiveRepeatTransmissions,
  sendable,
  windowUtilization,
} from "@/lib/net/transport";
import { randInt, rng } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const fmt = (n: number) => n.toLocaleString("en-US");

export const seqAckGen: Generator = {
  id: "gen-seq-ack",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const x = randInt(r, 1000, 90000);
    const y = randInt(r, 1000, 90000);
    const sizes = Array.from({ length: randInt(r, 2, 3) }, () => pick(r, [100, 200, 500, 536, 1000, 1460]));
    const total = sizes.reduce((a, b) => a + b, 0);
    const seqs = segmentSeqs(x, sizes);
    const [syn, synack] = handshake(x, y);
    return {
      id: `gen-seq-ack:${x}:${y}:${sizes.join("-")}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 1,
      prompt: `A TCP client opens a connection with initial sequence number ${fmt(x)}; the server's is ${fmt(y)}. After the handshake the client sends ${sizes.length} segments of ${sizes.join(", ")} bytes, all arriving in order. What acknowledgement number does the server send after the last one?`,
      answer: ackAfter(x, total),
      explain: `The SYN uses one sequence number, so the data starts at ${fmt(syn.seq + 1)}: segments carry seq ${seqs.map(fmt).join(", ")}. The ack names the next byte expected: ${fmt(x)} + 1 + ${fmt(total)} = ${fmt(ackAfter(x, total))}. (The server's SYN-ACK acked ${fmt(synack.ack!)} and carried seq ${fmt(y)}.)`,
    } satisfies Question;
  },
};

export const handshakeGen: Generator = {
  id: "gen-handshake-field",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const x = randInt(r, 100, 90000);
    const y = randInt(r, 100, 90000);
    const [syn, synack, ack] = handshake(x, y);
    const which = seed % 3;
    const ask = [
      { text: "the acknowledgement number in the server's SYN-ACK", answer: synack.ack! },
      { text: "the sequence number of the client's final ACK", answer: ack.seq },
      { text: "the acknowledgement number in the client's final ACK", answer: ack.ack! },
    ][which];
    return {
      id: `gen-handshake-field:${x}:${y}:${which}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 1,
      prompt: `In a TCP three-way handshake the client's SYN has seq = ${fmt(syn.seq)} and the server's SYN-ACK has seq = ${fmt(y)}. What is ${ask.text}?`,
      answer: ask.answer,
      explain: `A SYN counts as one byte of sequence space. SYN-ACK: ack = client ISN + 1 = ${fmt(synack.ack!)}. Final ACK: seq = ${fmt(ack.seq)} (the SYN used ${fmt(x)}) and ack = server ISN + 1 = ${fmt(ack.ack!)}.`,
    } satisfies Question;
  },
};

export const retransmitGen: Generator = {
  id: "gen-gbn-sr",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 8, 12);
    const w = randInt(r, 3, 5);
    const lost = randInt(r, 1, n - 2);
    const sr = seed % 2 === 1;
    const resent = sr ? 1 : Math.min(w, n - lost);
    const answer = sr ? selectiveRepeatTransmissions(n) : goBackNTransmissions(n, w, lost);
    return {
      id: `gen-gbn-sr:${n}:${w}:${lost}:${sr ? "sr" : "gbn"}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 2,
      prompt: `A sender uses ${sr ? "Selective Repeat" : "Go-Back-N"} with window size ${w} to send packets 0 to ${n - 1}. The window is full when packet ${lost} is lost (once). Every other packet and ack arrives. How many packet transmissions in total, counting retransmissions?`,
      answer,
      explain: sr
        ? `Selective Repeat buffers the out-of-order packets, so only packet ${lost} is resent: ${n} + 1 = ${answer}.`
        : `Go-Back-N's receiver discards everything after the gap, so on the timeout the sender resends packet ${lost} and every packet after it that was in the window: ${resent} packet${resent === 1 ? "" : "s"}. ${n} + ${resent} = ${answer}.`,
    } satisfies Question;
  },
};

export const utilizationGen: Generator = {
  id: "gen-window-util",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const bytes = pick(r, [500, 1000, 1250, 1500]);
    const mbps = pick(r, [10, 100, 1000]);
    const rttMs = pick(r, [10, 20, 30, 50, 80]);
    const bits = bytes * 8;
    const stop = windowUtilization(bits, mbps * 1e6, rttMs / 1000) * 100;
    const txMs = transmissionDelay(bytes, mbps * 1e6) * 1000;
    return {
      id: `gen-window-util:${bytes}:${mbps}:${rttMs}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 2,
      prompt: `A stop-and-wait sender sends ${fmt(bytes)}-byte packets on a ${fmt(mbps)} Mbps link with a ${rttMs} ms round-trip time. What percentage of the time is the sender busy transmitting? (ignore ack size and processing)`,
      answer: Number(stop.toPrecision(3)),
      tolerance: Math.max(0.005, stop * 0.01),
      unit: "%",
      explain: `Transmission time L/R = ${fmt(bits)} bits ÷ ${fmt(mbps)} Mbps = ${formatNumber(Number(txMs.toPrecision(4)))} ms. The sender then idles until the ack: utilisation = (L/R) / (RTT + L/R) = ${formatNumber(Number(txMs.toPrecision(4)))} / ${formatNumber(Number((rttMs + txMs).toPrecision(5)))} = ${formatNumber(Number(stop.toPrecision(3)))}%. Pipelining fixes this.`,
    } satisfies Question;
  },
};

export const fullPipeGen: Generator = {
  id: "gen-full-pipe",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const bytes = pick(r, [1000, 1250, 1500]);
    const mbps = pick(r, [1, 2, 5, 10]);
    const rttMs = pick(r, [20, 40, 60, 100, 200]);
    const bits = bytes * 8;
    const w = fullPipeWindow(bits, mbps * 1e6, rttMs / 1000);
    const txMs = transmissionDelay(bytes, mbps * 1e6) * 1000;
    return {
      id: `gen-full-pipe:${bytes}:${mbps}:${rttMs}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 3,
      prompt: `A sliding-window sender uses ${fmt(bytes)}-byte packets on a ${mbps} Mbps link with a ${rttMs} ms RTT. What is the smallest window size, in packets, that keeps the link 100% utilised?`,
      answer: w,
      unit: "packets",
      explain: `One packet takes ${formatNumber(Number(txMs.toPrecision(4)))} ms to send, and the first ack returns ${formatNumber(Number((rttMs + txMs).toPrecision(5)))} ms after sending began. To keep transmitting until then you need ⌈(RTT + L/R) / (L/R)⌉ = ⌈${formatNumber(Number(((rttMs + txMs) / txMs).toPrecision(5)))}⌉ = ${w} packets in flight.`,
    } satisfies Question;
  },
};

export const rwndGen: Generator = {
  id: "gen-rwnd",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const buf = pick(r, [4096, 8192, 16384, 65535]);
    const read = randInt(r, 1, 20) * 100;
    const rcvd = read + randInt(r, 5, 25) * 100;
    const rwnd = advertisedWindow(buf, rcvd, read);
    const cwnd = pick(r, [rwnd + 2000, rwnd - 1000, Math.floor(rwnd / 2)]);
    const inFlight = Math.min(randInt(r, 1, 6) * 500, Math.min(cwnd, rwnd));
    const answer = sendable(cwnd, rwnd, inFlight);
    return {
      id: `gen-rwnd:${buf}:${rcvd}:${read}:${cwnd}:${inFlight}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 2,
      prompt: `A receiver has a ${fmt(buf)}-byte buffer; LastByteRcvd − LastByteRead = ${fmt(rcvd - read)}. The sender's cwnd is ${fmt(cwnd)} bytes and ${fmt(inFlight)} bytes are sent but unacknowledged. How many more bytes may it send right now?`,
      answer,
      unit: "bytes",
      explain: `The receiver advertises rwnd = RcvBuffer − (LastByteRcvd − LastByteRead) = ${fmt(buf)} − ${fmt(rcvd - read)} = ${fmt(rwnd)}. The sender's limit is min(cwnd, rwnd) = ${fmt(Math.min(cwnd, rwnd))}, minus the ${fmt(inFlight)} already in flight: ${fmt(answer)}.`,
    } satisfies Question;
  },
};

export const cwndGen: Generator = {
  id: "gen-cwnd",
  topic: "transport",
  type: "TRANSPORT",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const ssthresh = pick(r, [8, 16] as const);
    const base = cwndSeries({ init: 1, ssthresh, rounds: 40 }).cwnd;
    const caStart = base.findIndex((c) => c >= ssthresh);
    const lossRound = caStart + randInt(r, 1, 4);
    const kind = pick(r, ["dup3", "timeout"] as const);
    const variant = kind === "dup3" && r() < 0.4 ? "tahoe" : "reno";
    const ask = lossRound + randInt(r, 2, 4);
    const run = cwndSeries({ init: 1, ssthresh, rounds: ask + 1, losses: { [lossRound]: kind }, variant });
    const answer = run.cwnd[ask];
    const atLoss = run.cwnd[lossRound];
    const label = kind === "timeout" ? "a timeout" : `three duplicate ACKs (TCP ${variant === "tahoe" ? "Tahoe" : "Reno"})`;
    return {
      id: `gen-cwnd:${ssthresh}:${lossRound}:${kind}:${variant}:${ask}`,
      kind: "numeric",
      topic: "transport",
      type: "TRANSPORT",
      difficulty: 3,
      prompt: `A TCP sender starts slow start at round 0 with cwnd = 1 MSS and ssthresh = ${ssthresh} MSS; cwnd changes once per RTT. At the end of round ${lossRound} it detects loss through ${label}. What is cwnd, in MSS, during round ${ask}?`,
      answer,
      unit: "MSS",
      explain: `Slow start doubles each RTT until it reaches ssthresh (${ssthresh}), then congestion avoidance adds 1 MSS per RTT, so cwnd = ${atLoss} in round ${lossRound}. On loss ssthresh becomes ${Math.max(Math.floor(atLoss / 2), 2)} (half of cwnd). ${
        kind === "dup3" && variant === "reno"
          ? "Reno's fast recovery resumes congestion avoidance at the new ssthresh"
          : "This kind of loss restarts slow start at 1 MSS"
      }: cwnd by round: ${run.cwnd.slice(lossRound + 1, ask + 1).join(", ")}. Round ${ask}: ${answer}.`,
    } satisfies Question;
  },
};

export const TRANSPORT_GENERATORS: readonly Generator[] = [seqAckGen, handshakeGen, retransmitGen, utilizationGen, fullPipeGen, rwndGen, cwndGen];
