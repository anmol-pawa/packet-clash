/**
 * 5.3 modern transport and performance (FAANG SDE coverage): TCP internals (congestion control,
 * SACK, window scaling, TIME_WAIT, Nagle), bufferbloat, QUIC, HTTP/2 and HTTP/3, and TLS resumption.
 * Answers are pinned in tests/perf.test.ts and tests/questions.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "interview", type: "TRANSPORT", difficulty, prompt, choices, answer: slot, explain };
}

export const PERF_BANK: readonly Question[] = [
  card("tp-cubic-bbr", 3, 1, "How do CUBIC and BBR differ in what they treat as the signal to slow down?", "CUBIC reacts to packet loss; BBR models bottleneck bandwidth and minimum RTT and paces to that",
    ["CUBIC reacts to delay; BBR reacts to loss", "Both react only to ICMP source quench", "Neither changes its sending rate after the handshake"],
    "CUBIC is loss-based: it grows the window along a cubic curve and cuts it on loss, so it fills buffers. BBR estimates the bandwidth-delay product and paces near it, keeping queues short, and copes better with random loss."),
  card("tp-sack", 2, 0, "What problem does TCP SACK (selective acknowledgement) solve?", "The sender learns exactly which segments arrived after a hole, so it retransmits only the missing ones",
    ["It encrypts the acknowledgement numbers", "It lets the receiver shrink the window to zero", "It removes the need for sequence numbers"],
    "Plain cumulative ACKs only say 'everything up to X'. With several losses in a window the sender cannot tell which later segments arrived. SACK blocks list them, avoiding needless retransmissions."),
  card("tp-wscale", 2, 2, "Why is the window scale option needed on a fast, long path?", "The 16-bit window field caps the window at 65,535 bytes, far below the bandwidth-delay product",
    ["Without it TCP cannot use port numbers above 1023", "It compresses the TCP header", "It lets UDP share the same connection"],
    "Throughput is at most window / RTT. 64 KB over a 100 ms path is only about 5 Mbit/s. The option, negotiated in the SYN, multiplies the field by 2^shift (up to 14), allowing windows near 1 GB."),
  card("tp-iw10", 2, 3, "Why did operating systems raise TCP's initial congestion window to 10 segments?", "Most web responses are small, and a larger start saves several round trips of slow start",
    ["Because slow start was removed", "To make the handshake complete faster", "Because 10 is the maximum window the receiver allows"],
    "Slow start doubles cwnd each RTT. Starting at 10 segments (about 14 KB) lets many pages and API replies finish in one or two round trips instead of four or five."),
  card("tp-timewait", 3, 1, "What is the purpose of TCP's TIME_WAIT state, held by the side that closes first?", "To absorb delayed duplicate segments and make sure the final ACK can be retransmitted, for 2 × MSL",
    ["To keep the connection open for reuse by other clients", "To wait for the user to type again", "To let the kernel free the file descriptor later"],
    "If the last ACK is lost, the peer resends its FIN and TIME_WAIT can answer it. It also stops old segments of a previous connection being accepted by a new one using the same four-tuple. Linux holds it for 60 s."),
  card("tp-timewait-exhaust", 3, 0, "A proxy opens many short connections to one backend IP:port and starts failing with 'cannot assign requested address'. What is the likely cause?", "Ephemeral ports are tied up in TIME_WAIT, so there are none free for the same destination",
    ["The backend has run out of disk space", "The DNS cache has expired", "The MTU is too large"],
    "Each connection to the same destination needs a unique local port, and closed ones stay in TIME_WAIT for about 60 s. Fixes: reuse connections (keep-alive, pooling), widen the port range, add source IPs, or let the server close first."),
  card("tp-reuseaddr", 3, 2, "What does SO_REUSEADDR let a server do, compared with SO_REUSEPORT?", "REUSEADDR lets it bind while old connections sit in TIME_WAIT; REUSEPORT lets several sockets share one port so the kernel spreads connections among them",
    ["REUSEADDR lets two machines share an IP; REUSEPORT lets two machines share a MAC", "REUSEADDR disables the three-way handshake; REUSEPORT disables the four-way close", "They are two names for the same option"],
    "Without SO_REUSEADDR a restarted server can fail to bind because of TIME_WAIT. SO_REUSEPORT allows many listeners (often one per worker or process) on the same address and port, with the kernel load-balancing incoming connections."),
  card("tp-nagle", 3, 3, "What causes the classic 40 ms stall when Nagle's algorithm meets delayed ACKs?", "The sender holds a small segment until the previous one is acknowledged, while the receiver delays that ACK waiting for data to piggyback it on",
    ["The receiver sets the window to zero", "Both sides send a SYN at once", "The router queues the packet for 40 ms by design"],
    "Nagle sends only one unacknowledged small segment at a time; delayed ACK waits up to about 40 ms. Latency-sensitive writers set TCP_NODELAY or send one buffered write instead of several small ones."),
  card("tp-keepalive", 2, 1, "What does a TCP keepalive probe detect?", "A dead or vanished peer (and keeps NAT or firewall state from expiring) on an otherwise idle connection",
    ["Packet corruption in flight", "The path MTU", "Whether the peer supports TLS"],
    "After an idle period the kernel sends a probe; no reply after several tries means the peer is gone. Application-level heartbeats do the same job with finer control. The default idle time on Linux is 2 hours, usually tuned lower."),
  card("tp-bufferbloat", 3, 0, "What is bufferbloat?", "Oversized buffers on a bottleneck link fill up and add hundreds of milliseconds of queueing delay under load",
    ["Packets growing larger than the MTU", "A DNS cache that never expires", "Too few buffers, causing constant drops"],
    "Loss-based TCP keeps sending until the buffer overflows, so a large buffer means a long standing queue. Fixes include active queue management (CoDel, FQ-CoDel), ECN and delay-based congestion control such as BBR."),
  card("tp-quic-udp", 2, 2, "Why does QUIC run over UDP instead of being a new IP protocol?", "Middleboxes and operating systems already pass UDP, and QUIC can be updated in user space without waiting for kernel or network upgrades",
    ["Because UDP is reliable by itself", "Because UDP encrypts the payload", "Because TCP cannot carry HTTP"],
    "New IP protocol numbers are dropped by many NATs and firewalls and are slow to ship. QUIC adds reliability, congestion control, streams and TLS 1.3 on top of UDP, in the application's library."),
  card("tp-quic-hol", 3, 3, "How does QUIC avoid TCP-style head-of-line blocking between HTTP requests?", "Each stream has its own ordering, so loss on one stream does not stall the others",
    ["It sends every request on a separate connection", "It never retransmits lost packets", "It drops packets from slow streams"],
    "HTTP/2 multiplexes streams over one TCP byte stream, so one lost segment delays every stream behind it. QUIC delivers streams independently; a lost packet only blocks the streams whose data it carried."),
  card("tp-quic-migration", 3, 1, "A phone moves from Wi-Fi to cellular mid-download. Why can a QUIC connection survive this?", "It is identified by a connection ID, not by the IP address and port four-tuple",
    ["QUIC keeps both radios on permanently", "The server resolves the phone's new MAC address", "TCP also survives it unchanged"],
    "A TCP connection is bound to its four-tuple, so a new IP breaks it. QUIC packets carry a connection ID, so the endpoint validates the new path and carries on, with no new handshake."),
  card("tp-0rtt", 3, 0, "What is the main risk of 0-RTT (early data) in TLS 1.3 and QUIC?", "Early data can be replayed by an attacker, so only idempotent requests should be accepted",
    ["It uses weaker encryption than the full handshake", "It exposes the server's private key", "It prevents certificate validation forever"],
    "On resumption the client sends application data with its first flight, saving a round trip. That data is not protected against replay, so servers accept only safe requests (such as GET) in 0-RTT."),
  card("tp-http2-mux", 2, 2, "What did HTTP/2 multiplexing fix compared with HTTP/1.1 over one connection?", "Many requests and responses share a single connection at once, instead of queueing one behind another",
    ["It made every response smaller than 1 KB", "It removed the need for TLS", "It replaced TCP with UDP"],
    "HTTP/1.1 handles one request at a time per connection, so browsers open about six connections per host. HTTP/2 interleaves framed streams on one connection and compresses headers with HPACK, but still suffers TCP-level head-of-line blocking."),
  card("tp-push-removed", 2, 3, "Why did browsers drop HTTP/2 server push?", "Servers often pushed resources the client already had cached, wasting bandwidth, and it proved hard to use well",
    ["It was insecure because it used UDP", "It could not carry images", "It required HTTP/1.1 to work"],
    "A pushed resource can't know the client's cache state, so the push often competed with needed data. Preload hints and 103 Early Hints achieve the benefit with the client in control."),
  card("tp-http3", 2, 1, "What is HTTP/3?", "HTTP semantics carried over QUIC instead of TCP",
    ["HTTP/2 with larger headers", "HTTP over UDP without any reliability", "A new set of status codes"],
    "Methods, headers and status codes are unchanged. HTTP/3 maps requests to QUIC streams, so it gets QUIC's per-stream loss recovery, faster handshakes and connection migration. Clients learn of it via the Alt-Svc header."),
  card("tp-tls-resume", 2, 0, "What does TLS session resumption save?", "The cost of a full handshake (certificate exchange and key agreement) on a repeat connection, using a ticket or PSK from the earlier session",
    ["The TCP handshake", "DNS resolution", "The need for any encryption"],
    "The server gives the client a session ticket after the first handshake. Presenting it later skips the certificate and expensive public-key steps, and in TLS 1.3 can cut the handshake to one round trip or less."),
  card("tp-ocsp", 3, 2, "What does OCSP stapling do?", "The server attaches a recent signed OCSP response proving its certificate is not revoked, so the client needn't contact the CA",
    ["It encrypts the certificate chain", "It issues a new certificate for each connection", "It replaces the Server Name Indication"],
    "Without stapling the browser may query the CA's OCSP responder, which adds latency and leaks which sites the user visits. The stapled response is signed by the CA and short-lived, so the client can trust it."),
  card("tp-mathis", 3, 3, "Per the Mathis equation, how does steady-state TCP throughput scale with loss rate p and RTT?", "It is proportional to 1/(RTT × √p): lower loss and lower RTT both help",
    ["It is independent of loss", "It is proportional to p", "It depends only on the link bandwidth"],
    "throughput ≈ (MSS / RTT) × 1.22 / √p. Quadrupling the loss rate halves the throughput, and doubling the RTT also halves it, which is why long, slightly lossy paths are so slow for loss-based TCP."),
  card("tp-bdp", 2, 1, "A 1 Gbit/s link has a 80 ms RTT. About how much data must be in flight to fill it?", "10 MB",
    ["1 MB", "80 KB", "1 GB"],
    "BDP = bandwidth × RTT = 1 Gbit/s × 0.08 s = 80 Mbit = 10 MB. A window below that leaves the pipe partly idle."),
];
