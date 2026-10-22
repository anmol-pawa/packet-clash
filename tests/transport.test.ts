import { describe, expect, it } from "vitest";
import {
  ACTIVE_OPEN_CLOSE, PASSIVE_OPEN_CLOSE, TCP_TRANSITIONS, ackAfter, advertisedWindow, cwndSeries, fullPipeWindow,
  goBackNTransmissions, handshake, segmentSeqs, selectiveRepeatTransmissions, sendable, seqAdd, windowUtilization,
} from "@/lib/net/transport";
import { TRANSPORT_GENERATORS, cwndGen, fullPipeGen, handshakeGen, retransmitGen, rwndGen, seqAckGen, utilizationGen } from "@/content/questions/transportGenerators";
import { GENERATORS } from "@/content/questions/generators";
import type { NumericQuestion } from "@/game/engine/questions";

describe("sequence and acknowledgement numbers", () => {
  it("handshake: SYN consumes one number on each side", () => {
    const [syn, synack, ack] = handshake(1000, 5000);
    expect(syn).toMatchObject({ flags: "SYN", seq: 1000, ack: null });
    expect(synack).toMatchObject({ seq: 5000, ack: 1001 });
    expect(ack).toMatchObject({ seq: 1001, ack: 5001 });
  });

  it("wraps at 2^32", () => {
    expect(seqAdd(4294967295, 1)).toBe(0);
    expect(handshake(4294967295, 0)[1].ack).toBe(0);
  });

  it("K&R §3.5.2 telnet: one byte at seq 42 is acked with 43; B's byte at 79 with 80", () => {
    expect(seqAdd(42, 1)).toBe(43);
    expect(seqAdd(79, 1)).toBe(80);
  });

  it("data starts at ISN+1; ack = next byte expected", () => {
    expect(segmentSeqs(100, [500, 500, 200])).toEqual([101, 601, 1101]);
    expect(ackAfter(100, 1200)).toBe(1301);
  });
});

describe("TCP state machine", () => {
  it("each side's path follows legal transitions", () => {
    for (const path of [ACTIVE_OPEN_CLOSE, PASSIVE_OPEN_CLOSE]) {
      for (let i = 0; i + 1 < path.length; i++) {
        expect(TCP_TRANSITIONS.some(([a, , b]) => a === path[i] && b === path[i + 1])).toBe(true);
      }
    }
  });
});

describe("Go-Back-N vs Selective Repeat", () => {
  it("K&R Fig. 3.22: window 4, packet 2 lost → GBN resends 2,3,4,5; SR resends only 2", () => {
    expect(goBackNTransmissions(8, 4, 2)).toBe(8 + 4);
    expect(selectiveRepeatTransmissions(8)).toBe(9);
  });
  it("the resend burst is cut short at the end of the transfer", () => {
    expect(goBackNTransmissions(8, 4, 6)).toBe(10);
    expect(goBackNTransmissions(8, 4, 7)).toBe(9);
  });
});

describe("window utilisation", () => {
  it("K&R §3.4: 1 Gbps, 8000-bit packets, 30 ms RTT → stop-and-wait 0.00027", () => {
    expect(windowUtilization(8000, 1e9, 0.03)).toBeCloseTo(0.008 / 30.008, 8);
    expect(windowUtilization(8000, 1e9, 0.03)).toBeCloseTo(0.00027, 5);
  });
  it("pipelining 3 packets triples it (K&R Fig. 3.17: 3 × 0.008 / 30.008 ≈ 0.0008)", () => {
    expect(windowUtilization(8000, 1e9, 0.03, 3)).toBeCloseTo(0.0008, 5);
  });
  it("full-pipe window is 3751 packets here and utilisation caps at 1", () => {
    expect(fullPipeWindow(8000, 1e9, 0.03)).toBe(3751);
    expect(windowUtilization(8000, 1e9, 0.03, 5000)).toBe(1);
  });
});

describe("flow control", () => {
  it("rwnd = RcvBuffer − (LastByteRcvd − LastByteRead)", () => {
    expect(advertisedWindow(4096, 3000, 1000)).toBe(2096);
  });
  it("sender is limited by min(cwnd, rwnd) minus in-flight", () => {
    expect(sendable(8000, 5000, 2000)).toBe(3000);
    expect(sendable(3000, 5000, 4000)).toBe(0);
  });
});

describe("congestion control", () => {
  const sw = { init: 1, ssthresh: 8 };
  it("slow start doubles to ssthresh, then adds 1 MSS per RTT (K&R Fig. 3.53)", () => {
    expect(cwndSeries({ ...sw, rounds: 9 }).cwnd).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 13]);
  });
  it("slow start is capped at ssthresh", () => {
    expect(cwndSeries({ init: 1, ssthresh: 6, rounds: 6 }).cwnd).toEqual([1, 2, 4, 6, 7, 8]);
  });
  it("triple dup ACK at cwnd 12: Reno halves to 6, Tahoe restarts at 1", () => {
    const losses = { 7: "dup3" } as const;
    const reno = cwndSeries({ ...sw, rounds: 11, losses });
    expect(reno.cwnd).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 6, 7, 8]);
    expect(reno.ssthresh[8]).toBe(6);
    const tahoe = cwndSeries({ ...sw, rounds: 11, losses, variant: "tahoe" });
    expect(tahoe.cwnd).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 1, 2, 4]);
  });
  it("timeout always restarts slow start at 1 with ssthresh = cwnd/2", () => {
    const r = cwndSeries({ ...sw, rounds: 10, losses: { 7: "timeout" } });
    expect(r.cwnd).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 1, 2]);
    expect(r.ssthresh[9]).toBe(6);
  });
  it("ssthresh never falls below 2 MSS", () => {
    expect(cwndSeries({ init: 1, ssthresh: 1, rounds: 3, losses: { 1: "timeout" } }).ssthresh[2]).toBe(2);
  });
});

describe("transport generators", () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const nums = (s: string) => [...s.matchAll(/\d[\d,]*/g)].map((m) => num(m[0]));

  it("are registered on gym 5's chapter", () => {
    expect(TRANSPORT_GENERATORS).toHaveLength(7);
    for (const g of TRANSPORT_GENERATORS) {
      expect(GENERATORS).toContain(g);
      expect(g.topic).toBe("transport");
    }
  });

  it("every generator gives well-formed, deterministic questions", () => {
    for (const g of TRANSPORT_GENERATORS) {
      for (const s of SEEDS) {
        const q = g.generate(s) as NumericQuestion;
        expect(q.kind).toBe("numeric");
        expect(Number.isFinite(q.answer)).toBe(true);
        expect(q.explain.length).toBeGreaterThan(20);
        expect(g.generate(s)).toEqual(q);
      }
    }
  });

  it("seq/ack: the ack is ISN + 1 + the bytes sent", () => {
    for (const s of SEEDS) {
      const q = seqAckGen.generate(s) as NumericQuestion;
      const [, x, , sizeList] = q.id.split(":");
      const sizes = sizeList.split("-").map(Number);
      expect(q.answer).toBe(Number(x) + 1 + sizes.reduce((p, c) => p + c, 0));
    }
  });

  it("handshake: the asked field is the right one of the three segments", () => {
    for (const s of SEEDS) {
      const q = handshakeGen.generate(s) as NumericQuestion;
      const [, x, y, which] = q.id.split(":").map(Number);
      expect(q.answer).toBe([x + 1, x + 1, y + 1][which]);
      expect(q.prompt).toContain(["server's SYN-ACK", "sequence number of the client's final", "acknowledgement number in the client's final"][which]);
    }
  });

  it("GBN / SR totals match a step-by-step send log", () => {
    for (const s of SEEDS) {
      const q = retransmitGen.generate(s) as NumericQuestion;
      const [, n, w, lost, mode] = q.id.split(":");
      const [N, W, L] = [n, w, lost].map(Number);
      const log: number[] = [];
      const lastInWindow = Math.min(N - 1, L + W - 1);
      for (let p = 0; p <= lastInWindow; p++) log.push(p); // first pass until the stall
      if (mode === "sr") log.push(L);
      else for (let p = L; p <= lastInWindow; p++) log.push(p); // timeout: go back
      for (let p = lastInWindow + 1; p < N; p++) log.push(p); // the rest
      expect(q.answer).toBe(log.length);
      expect(q.answer).toBeGreaterThan(N);
    }
  });

  it("stop-and-wait utilisation matches (L/R)/(RTT + L/R)", () => {
    for (const s of SEEDS) {
      const q = utilizationGen.generate(s) as NumericQuestion;
      const [bytes, mbps, rtt] = nums(q.id.split(":").slice(1).join(" "));
      const tx = (bytes * 8) / (mbps * 1e6);
      const pct = (100 * tx) / (rtt / 1000 + tx);
      expect(Math.abs(q.answer - pct)).toBeLessThanOrEqual(Math.max(0.005, pct * 0.01));
    }
  });

  it("full-pipe window really fills the pipe, and one fewer does not", () => {
    for (const s of SEEDS) {
      const q = fullPipeGen.generate(s) as NumericQuestion;
      const [bytes, mbps, rtt] = q.id.split(":").slice(1).map(Number);
      const bits = bytes * 8;
      expect(windowUtilization(bits, mbps * 1e6, rtt / 1000, q.answer)).toBeCloseTo(1, 9);
      expect(windowUtilization(bits, mbps * 1e6, rtt / 1000, q.answer - 1)).toBeLessThan(0.999999);
    }
  });

  it("rwnd: the answer is min(cwnd, rwnd) − in flight, ≥ 0", () => {
    for (const s of SEEDS) {
      const q = rwndGen.generate(s) as NumericQuestion;
      const [, buf, rcvd, read, cwnd, inFlight] = q.id.split(":").map(Number);
      expect(q.answer).toBe(Math.max(0, Math.min(cwnd, buf - (rcvd - read)) - inFlight));
    }
  });

  it("cwnd matches a hand-rolled per-RTT loop", () => {
    for (const s of SEEDS) {
      const q = cwndGen.generate(s) as NumericQuestion;
      const [, thr, lossRound, kind, variant, ask] = q.id.split(":");
      let cwnd = 1;
      let ssthresh = Number(thr);
      for (let t = 0; t < Number(ask); t++) {
        if (t === Number(lossRound)) {
          ssthresh = Math.max(Math.floor(cwnd / 2), 2);
          cwnd = kind === "dup3" && variant === "reno" ? ssthresh : 1;
        } else if (cwnd >= ssthresh) cwnd += 1;
        else cwnd = Math.min(2 * cwnd, ssthresh);
      }
      expect(q.answer).toBe(cwnd);
    }
  });
});
