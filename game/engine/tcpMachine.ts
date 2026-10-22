import { TCP_FLOW, type FlowEvent } from "@/game/art/lessons";
import type { TcpState } from "@/lib/net/transport";

/** One frame of the animated TCP state machine: both sides' states after the segment `seg` arrived. */
export interface TcpStep {
  client: TcpState;
  server: TcpState;
  /** The segment in flight on this step; null for the start and the final timer. */
  seg: FlowEvent | null;
  /** What happened, in a sentence. */
  note: string;
}

const NOTES: readonly string[] = [
  "The client opens: it sends a SYN with its initial sequence number and moves to SYN_SENT. The server, listening, replies to the SYN by entering SYN_RCVD.",
  "The server answers SYN+ACK: its own ISN, and an ack of the client's ISN + 1. The client has now seen both directions work and is ESTABLISHED.",
  "The client's ACK (ack = server ISN + 1) reaches the server, which becomes ESTABLISHED. Data can flow both ways.",
  "The client is done sending, so it sends a FIN and enters FIN_WAIT_1. The server's TCP acknowledges it by moving to CLOSE_WAIT: the application has not closed yet.",
  "The server ACKs the FIN. The client reaches FIN_WAIT_2 and waits for the server to close its own direction (a half-closed connection).",
  "The server application closes: it sends its own FIN and enters LAST_ACK. The client receives it and moves to TIME_WAIT.",
  "The client ACKs the server's FIN, so the server reaches CLOSED. The client must wait in TIME_WAIT in case that last ACK was lost.",
];

const FINAL_NOTE = "After 2·MSL the TIME_WAIT timer fires. Any lost final ACK has been retransmitted and old segments have died out, so the client reaches CLOSED.";

/**
 * The whole run: the starting states, one step per segment in `TCP_FLOW`,
 * then the TIME_WAIT timeout. Each step's states are derived from the
 * segments, so the animation cannot disagree with the lesson figure.
 */
export function tcpSteps(): TcpStep[] {
  let client: TcpState = "CLOSED";
  let server: TcpState = "LISTEN";
  const steps: TcpStep[] = [{ client, server, seg: null, note: "The server has done a passive open and is in LISTEN. The client is CLOSED. Press NEXT to send the first segment." }];
  TCP_FLOW.forEach((e, i) => {
    const sender = e.from === "client" ? "client" : "server";
    const sNew = e.send;
    const rNew = e.recv;
    if (sender === "client") {
      client = sNew ?? client;
      server = rNew ?? server;
    } else {
      server = sNew ?? server;
      client = rNew ?? client;
    }
    steps.push({ client, server, seg: e, note: NOTES[i] });
  });
  steps.push({ client: "CLOSED", server, seg: null, note: FINAL_NOTE });
  return steps;
}
