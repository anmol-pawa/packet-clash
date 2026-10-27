/**
 * Capture-reading scenarios (5.8b): a tcpdump-style trace and one question about
 * it. The trace comes from `buildCapture` and the answer from `diagnose` run on
 * those same packets, so the text the player reads and the answer can't drift.
 */
import type { McqQuestion, NumericQuestion } from "@/game/engine/questions";
import { CAPTURE_KINDS, KIND_LABEL, buildCapture, diagnose, formatPkt, type Capture, type CaptureKind } from "@/lib/net/capture";
import { rng, shuffled } from "@/lib/rng";

export interface CaptureScenario {
  id: string;
  title: string;
  /** The tcpdump command and its output. */
  header: string;
  lines: string[];
  question: McqQuestion | NumericQuestion;
}

export interface CaptureBuilder {
  id: string;
  title: string;
  build(seed: number): CaptureScenario;
}

function exhibit(c: Capture): { header: string; lines: string[] } {
  const host = c.point === "c" ? `client ${c.endpoints.client}` : `server ${c.endpoints.server}`;
  return {
    header: `# captured on the ${host}\nC = ${c.endpoints.client}.${c.endpoints.cport}\nS = ${c.endpoints.server}.${c.endpoints.sport}\n(relative seq; time in s)`,
    lines: c.pkts.map((p) => formatPkt(p)),
  };
}

function diagnosisBuilder(kind: CaptureKind): CaptureBuilder {
  const id = `diag-${kind}`;
  return {
    id,
    title: "What does this capture show?",
    build(seed) {
      const c = buildCapture(kind, seed);
      const d = diagnose(c.pkts);
      const r = rng(seed ^ 0x5bd1e995);
      const answer = KIND_LABEL[d.kind];
      const wrong = shuffled(r, CAPTURE_KINDS.filter((k) => k !== d.kind).map((k) => KIND_LABEL[k])).slice(0, 3);
      const choices = shuffled(r, [answer, ...wrong]);
      return {
        id: `cap-${id}:${seed}`,
        title: "What does this capture show?",
        ...exhibit(c),
        question: {
          id: `cap-${id}:${seed}`,
          kind: "mcq",
          topic: "interview",
          type: "TRANSPORT",
          difficulty: 2,
          prompt: `A service on port ${c.endpoints.sport} (${c.service}) is misbehaving. Which statement best describes this capture?`,
          choices,
          answer: choices.indexOf(answer),
          explain: explainDiagnosis(c, d),
        },
      };
    },
  };
}

function explainDiagnosis(c: Capture, d: ReturnType<typeof diagnose>): string {
  switch (d.kind) {
    case "healthy":
      return "SYN, SYN-ACK, ACK; the request is acknowledged; the data flows and every byte range is sent once; both sides close with FIN. Nothing to fix.";
    case "syn-timeout":
      return "The client keeps resending the same SYN with doubling gaps (1 s, 2 s, 4 s) and never sees a SYN-ACK. Something drops the packets (firewall DROP rule, security group, dead host or route). A closed port would answer with RST instead.";
    case "refused":
      return `The SYN is answered at once with RST-ACK (packet ${d.packet}): the host is up but nothing listens on port ${c.endpoints.sport}. A firewall that silently drops would show repeated SYNs instead.`;
    case "no-final-ack":
      return "The server's SYN-ACK is resent at 1 s, 2 s, 4 s because the third handshake packet never arrives. Typical causes: the ACK is dropped on the way back (asymmetric routing, firewall) or a spoofed SYN flood leaves half-open connections.";
    case "zero-window":
      return `From packet ${d.packet} the receiver advertises win 0: its receive buffer is full because the application isn't reading. The sender must stop until a window update arrives. This is flow control, not network loss.`;
    case "reset":
      return `Packet ${d.packet} carries RST from the ${d.from === "s" ? "server" : "client"} after data was flowing: the connection is aborted with no FIN. Common causes: the app crashed or closed with unread data, or a middlebox dropped state after an idle timeout.`;
    case "rto":
      return `Packet ${d.packet} resends bytes already sent ${d.delayMs} ms earlier with ${d.dupAcks} duplicate ACKs in between. With nothing after the lost segment there was nothing to trigger duplicate ACKs, so only the retransmission timer (RTO) could recover it: tail loss.`;
    case "fast-retransmit":
      return `Packet ${d.packet} resends a segment after ${d.dupAcks} duplicate ACKs (the receiver keeps acknowledging the same byte because later segments arrived past the hole). Three duplicate ACKs trigger fast retransmit without waiting for the RTO, only ${d.delayMs} ms later.`;
  }
}

interface NumericSpec {
  id: string;
  kind: CaptureKind;
  prompt: (c: Capture) => string;
  answer: (c: Capture) => number;
  unit?: string;
  explain: (c: Capture, answer: number) => string;
}

function numericBuilder(s: NumericSpec): CaptureBuilder {
  return {
    id: s.id,
    title: "Find the packet",
    build(seed) {
      const c = buildCapture(s.kind, seed);
      const answer = s.answer(c);
      return {
        id: `cap-${s.id}:${seed}`,
        title: "Find the packet",
        ...exhibit(c),
        question: {
          id: `cap-${s.id}:${seed}`,
          kind: "numeric",
          topic: "interview",
          type: "TRANSPORT",
          difficulty: 3,
          prompt: s.prompt(c),
          answer,
          unit: s.unit,
          explain: s.explain(c, answer),
        },
      };
    },
  };
}

export const CAPTURE_BUILDERS: CaptureBuilder[] = [
  ...CAPTURE_KINDS.map(diagnosisBuilder),
  numericBuilder({
    id: "retx-packet",
    kind: "rto",
    prompt: () => "Which packet number is the retransmission?",
    answer: (c) => diagnose(c.pkts).packet!,
    explain: (_c, a) => `Packet ${a} repeats the sequence range of an earlier data packet from the same host.`,
  }),
  numericBuilder({
    id: "retx-packet-fast",
    kind: "fast-retransmit",
    prompt: () => "Which packet number is the retransmission?",
    answer: (c) => diagnose(c.pkts).packet!,
    explain: (c, a) => `Packet ${a} repeats a sequence range sent earlier. The duplicate ACKs (same ack ${c.pkts[a - 1].seq}, no new data) point at the hole.`,
  }),
  numericBuilder({
    id: "retx-delay",
    kind: "rto",
    prompt: () => "How many milliseconds passed between the original segment and its retransmission?",
    answer: (c) => diagnose(c.pkts).delayMs!,
    unit: "ms",
    explain: (_c, a) => `Subtract the timestamps of the two packets that carry the same sequence range: ${a} ms. That gap is the sender's retransmission timeout (Linux never goes below 200 ms).`,
  }),
  numericBuilder({
    id: "zero-packet",
    kind: "zero-window",
    prompt: () => "Which packet number first advertises a zero window?",
    answer: (c) => diagnose(c.pkts).packet!,
    explain: (_c, a) => `Packet ${a} is the first with win 0: the receiver's buffer is full.`,
  }),
  numericBuilder({
    id: "rst-packet",
    kind: "reset",
    prompt: () => "Which packet number carries the RST?",
    answer: (c) => diagnose(c.pkts).packet!,
    explain: (_c, a) => `Packet ${a} has the R flag: the connection is aborted immediately, without a FIN exchange.`,
  }),
  numericBuilder({
    id: "syn-count",
    kind: "syn-timeout",
    prompt: () => "How many SYN packets did the client send?",
    answer: (c) => c.pkts.filter((p) => p.flags === "S").length,
    explain: (_c, a) => `${a} SYNs, each a retransmission of the first with the delay doubling (1 s, 2 s, 4 s) and no SYN-ACK in reply.`,
  }),
];

/** Eight diagnosis scenarios plus two numeric ones, shuffled. */
export function captureDeck(seed: number): CaptureScenario[] {
  const r = rng(seed);
  const diag = CAPTURE_BUILDERS.slice(0, CAPTURE_KINDS.length);
  const numeric = shuffled(r, CAPTURE_BUILDERS.slice(CAPTURE_KINDS.length)).slice(0, 2);
  return shuffled(r, [...diag, ...numeric]).map((b, i) => b.build(seed * 31 + i + 1));
}
