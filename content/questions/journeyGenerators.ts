/**
 * Gym 8's "type a URL" problems: time to the first byte of HTML from round
 * trips (DNS cache level × transport), and ordering a slice of the journey.
 * Every answer comes from `lib/net/journey`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import type { DnsCache } from "@/lib/net/application";
import { URL_JOURNEY, journeyRtts, type Transport } from "@/lib/net/journey";
import { randInt, rng } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const CACHES: readonly (DnsCache | "browser")[] = ["browser", "answer", "auth", "tld", "none"];
const CACHE_TEXT: Readonly<Record<DnsCache | "browser", string>> = {
  browser: "the browser already has the IP address cached",
  answer: "the resolver has the answer cached",
  auth: "the resolver has the authoritative server cached (no root or TLD visit)",
  tld: "the resolver has the TLD server cached (no root visit)",
  none: "every DNS cache is cold (root, TLD, authoritative)",
};
const TRANSPORTS: readonly Transport[] = ["tcp", "tcp-tls13", "tcp-tls12", "quic", "quic-0rtt"];
const TRANSPORT_TEXT: Readonly<Record<Transport, string>> = {
  tcp: "plain HTTP over TCP",
  "tcp-tls13": "HTTPS over TCP with TLS 1.3",
  "tcp-tls12": "HTTPS over TCP with TLS 1.2",
  quic: "HTTP/3 over QUIC (first visit)",
  "quic-0rtt": "HTTP/3 over QUIC resuming with 0-RTT",
};
const CONNECT_WHY: Readonly<Record<Transport, string>> = {
  tcp: "1 for the TCP handshake",
  "tcp-tls13": "1 for the TCP handshake + 1 for TLS 1.3",
  "tcp-tls12": "1 for the TCP handshake + 2 for TLS 1.2",
  quic: "1 for QUIC, which combines transport and crypto setup",
  "quic-0rtt": "0 because resumed QUIC sends the request in its first flight",
};

export const firstByteGen: Generator = {
  id: "gen-first-byte",
  topic: "journey",
  type: "APPLICATION",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const cache = pick(r, CACHES);
    const transport = pick(r, TRANSPORTS);
    const rtt = pick(r, [10, 20, 25, 40, 50, 80, 100]);
    const c = journeyRtts(cache, transport);
    return {
      id: `gen-first-byte:${cache}:${transport}:${rtt}`,
      kind: "numeric",
      topic: "journey",
      type: "APPLICATION",
      difficulty: 3,
      prompt: `You load a page over ${TRANSPORT_TEXT[transport]}, and ${CACHE_TEXT[cache]}. Every round trip (to the resolver, each DNS server and the web server) takes ${rtt} ms, and processing is free. How long until the first byte of the HTML arrives? (in ms)`,
      answer: c.total * rtt,
      unit: "ms",
      explain: `Count round trips. DNS: ${c.dns}${cache === "browser" ? " (cache hit, no packet sent)" : ` (1 to the resolver${cache === "answer" ? "" : ` + ${c.dns - 1} for the servers it asks`})`}. Connection: ${c.connect} (${CONNECT_WHY[transport]}). Request and first response bytes: 1. Total ${c.dns} + ${c.connect} + 1 = ${c.total} RTT × ${rtt} ms = ${c.total * rtt} ms. ARP stays on the LAN and is cached, so it adds nothing.`,
    } satisfies Question;
  },
};

export const journeyOrderGen: Generator = {
  id: "gen-journey-order",
  topic: "journey",
  type: "APPLICATION",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = randInt(r, 4, 5);
    const start = randInt(r, 0, URL_JOURNEY.length - n);
    const slice = URL_JOURNEY.slice(start, start + n);
    return {
      id: `gen-journey-order:${start}:${n}`,
      kind: "order",
      topic: "journey",
      type: "APPLICATION",
      difficulty: 2,
      prompt: "These steps happen between typing an https:// URL and seeing the page. Put them in order.",
      steps: slice.map((s) => s.title),
      explain: slice.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`).join(" "),
    } satisfies Question;
  },
};

export const JOURNEY_GENERATORS: readonly Generator[] = [firstByteGen, journeyOrderGen];

