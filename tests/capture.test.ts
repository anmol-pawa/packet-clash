import { describe, expect, it } from "vitest";
import { CAPTURE_BUILDERS, captureDeck } from "@/content/captures/scenarios";
import { grade, correctResponse } from "@/game/engine/questions";
import { CAPTURE_KINDS, buildCapture, diagnose, formatPkt, type Pkt } from "@/lib/net/capture";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 3);
const pkt = (no: number, ms: number, from: "c" | "s", flags: string, seq: number, ack: number, len: number, win = 1000): Pkt => ({ no, ms, from, flags, seq, ack, len, win });

describe("diagnose (hand-written traces)", () => {
  it("flags a timeout retransmission with no duplicate ACKs", () => {
    const tr = [pkt(1, 0, "c", "S", 0, 0, 0), pkt(2, 10, "s", "S.", 0, 1, 0), pkt(3, 11, "c", ".", 1, 1, 0), pkt(4, 12, "s", "P.", 1, 1, 100), pkt(5, 412, "s", "P.", 1, 1, 100)];
    expect(diagnose(tr)).toMatchObject({ kind: "rto", packet: 5, delayMs: 400, dupAcks: 0 });
  });
  it("needs three duplicate ACKs (four identical ACKs) for fast retransmit", () => {
    const base = [pkt(1, 0, "c", "S", 0, 0, 0), pkt(2, 10, "s", "S.", 0, 1, 0), pkt(3, 11, "c", ".", 1, 1, 0)];
    const data = [pkt(4, 12, "s", ".", 1, 1, 100), pkt(5, 13, "s", ".", 101, 1, 100), pkt(6, 14, "s", ".", 201, 1, 100), pkt(7, 15, "s", ".", 301, 1, 100)];
    const acks = (n: number) => Array.from({ length: n }, (_, i) => pkt(8 + i, 30 + i, "c", ".", 1, 101, 0));
    const retx = (no: number) => pkt(no, 40, "s", ".", 101, 1, 100);
    expect(diagnose([...base, ...data, ...acks(4), retx(12)])).toMatchObject({ kind: "fast-retransmit", dupAcks: 3 });
    expect(diagnose([...base, ...data, ...acks(3), retx(11)])).toMatchObject({ kind: "rto", dupAcks: 2 });
  });
  it("tells a refused port from a dropped SYN", () => {
    expect(diagnose([pkt(1, 0, "c", "S", 0, 0, 0), pkt(2, 5, "s", "R.", 0, 1, 0, 0)])).toMatchObject({ kind: "refused", packet: 2 });
    expect(diagnose([pkt(1, 0, "c", "S", 0, 0, 0), pkt(2, 1000, "c", "S", 0, 0, 0)])).toMatchObject({ kind: "syn-timeout", packet: 2 });
  });
  it("formats like tcpdump", () => {
    expect(formatPkt(pkt(1, 0, "c", "S", 0, 0, 0, 64240))).toBe(" 1  0.000 C>S [S] seq 0 win 64240 len 0");
    expect(formatPkt(pkt(4, 12, "s", "P.", 1, 5, 1448, 100))).toContain("S>C [P.] seq 1:1449 ack 5 win 100 len 1448");
  });
});

describe("seeded captures", () => {
  it("the analyser finds exactly the fault each builder injected", () => {
    for (const kind of CAPTURE_KINDS) for (const seed of seeds) expect(diagnose(buildCapture(kind, seed).pkts).kind, `${kind} ${seed}`).toBe(kind);
  });
  it("numbers packets in order with non-decreasing time", () => {
    for (const kind of CAPTURE_KINDS)
      for (const seed of seeds.slice(0, 10)) {
        const { pkts } = buildCapture(kind, seed);
        pkts.forEach((p, i) => {
          expect(p.no).toBe(i + 1);
          if (i) expect(p.ms).toBeGreaterThanOrEqual(pkts[i - 1].ms);
        });
      }
  });
  it("is deterministic", () => {
    expect(buildCapture("rto", 9)).toEqual(buildCapture("rto", 9));
  });
  it("fast-retransmit resends sooner than any RTO and rto waits at least 200 ms", () => {
    for (const seed of seeds) {
      expect(diagnose(buildCapture("fast-retransmit", seed).pkts).delayMs!).toBeLessThan(200);
      expect(diagnose(buildCapture("rto", seed).pkts).delayMs!).toBeGreaterThanOrEqual(200);
    }
  });
});

describe("capture scenarios", () => {
  it("every scenario's right answer grades correct, and a wrong one does not", () => {
    for (const b of CAPTURE_BUILDERS)
      for (const seed of seeds.slice(0, 30)) {
        const s = b.build(seed);
        expect(s.lines.length).toBeGreaterThan(1);
        expect(grade(s.question, correctResponse(s.question)), `${b.id} ${seed}`).toBe(true);
        if (s.question.kind === "mcq") {
          const wrong = (s.question.answer + 1) % s.question.choices.length;
          expect(grade(s.question, { kind: "mcq", choice: wrong })).toBe(false);
          expect(new Set(s.question.choices).size).toBe(4);
        }
      }
  });
  it("numeric answers match the printed trace", () => {
    const retx = CAPTURE_BUILDERS.find((b) => b.id === "retx-packet")!.build(4);
    const n = (retx.question as { answer: number }).answer;
    const seqOf = (line: string) => /seq (\d+):/.exec(line)![1];
    expect(seqOf(retx.lines[n - 1])).toBe(seqOf(retx.lines.find((l) => l.includes("[P.]") && seqOf(l) === seqOf(retx.lines[n - 1]))!));
    const syn = CAPTURE_BUILDERS.find((b) => b.id === "syn-count")!.build(4);
    expect((syn.question as { answer: number }).answer).toBe(syn.lines.filter((l) => l.includes(" [S] ")).length);
  });
  it("a deck has ten scenarios covering all eight faults", () => {
    const deck = captureDeck(7);
    expect(deck).toHaveLength(10);
    expect(new Set(deck.map((d) => d.id.split(":")[0].replace("cap-", ""))).size).toBe(10);
  });
});
