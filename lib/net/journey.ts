/**
 * "What happens when you type a URL": the whole journey in order, and what it
 * costs in round trips before the first byte of HTML arrives. Reuses the DNS
 * cost model from `application` and the TLS 1.3 order from `security`.
 * Cross-check: plain HTTP with the address already cached is 2 RTT
 * (Kurose & Ross §2.2: one RTT for the TCP handshake, one for the request).
 */
import { dnsCost, type DnsCache } from "./application";

export type JourneyPhase = "browser" | "link" | "dns" | "tcp" | "tls" | "http" | "render";

export interface JourneyStep {
  id: string;
  phase: JourneyPhase;
  title: string;
  /** What happens, in a sentence or two. */
  detail: string;
}

/** The cold, typical HTTPS page load (HTTP/2 over TCP and TLS 1.3), in order. */
export const URL_JOURNEY: readonly JourneyStep[] = [
  { id: "parse", phase: "browser", title: "Parse the URL and check local caches", detail: "The browser splits scheme, host, port and path, checks its HSTS list (force https) and its HTTP cache. A fresh cached copy would end the journey here." },
  { id: "dns-cache", phase: "dns", title: "Look for the IP in the browser and OS DNS caches", detail: "Browser cache, then the OS resolver cache and the hosts file. A hit skips the network lookup entirely." },
  { id: "arp", phase: "link", title: "ARP for the default gateway's MAC address", detail: "The first packet to leave is the DNS query. The resolver is off-link, so the host sends it to the gateway and needs the gateway's MAC: an ARP broadcast, a unicast reply, then cached." },
  { id: "dns", phase: "dns", title: "DNS query to the recursive resolver", detail: "A UDP query on port 53. On a miss the resolver walks root, then TLD, then the authoritative server, and returns the A or AAAA record." },
  { id: "tcp", phase: "tcp", title: "TCP three-way handshake with the server", detail: "SYN, SYN+ACK, ACK to port 443. Routers forward on longest-prefix match and the home router's NAT rewrites the source address and port." },
  { id: "tls", phase: "tls", title: "TLS handshake", detail: "ClientHello with a key share, ServerHello, then the certificate chain, verified against the trust store. TLS 1.3 needs one round trip; both sides then derive session keys." },
  { id: "http", phase: "http", title: "HTTP request: GET /", detail: "Sent inside the encrypted channel with the Host header, cookies and accept headers." },
  { id: "response", phase: "http", title: "Server responds 200 OK with the HTML", detail: "The server (often behind a load balancer or CDN edge) returns status, headers and the HTML body in segments." },
  { id: "render", phase: "render", title: "Parse the HTML and render the page", detail: "The browser builds the DOM and CSSOM, fetches CSS, scripts and images over the same connection, runs scripts and paints." },
];

export const JOURNEY_IDS: readonly string[] = URL_JOURNEY.map((s) => s.id);

/** How the connection to the web server is set up. */
export type Transport = "tcp" | "tcp-tls13" | "tcp-tls12" | "quic" | "quic-0rtt";

/** Round trips from "start connecting" until the client may send its request. */
export const connectRtts = (t: Transport): number => ({ tcp: 1, "tcp-tls13": 2, "tcp-tls12": 3, quic: 1, "quic-0rtt": 0 })[t];

/** Round trips for the name lookup: 0 on a browser/OS cache hit, else 1 to the resolver plus one per server it must ask. */
export function dnsRtts(cache: DnsCache | "browser"): number {
  return cache === "browser" ? 0 : dnsCost("iterative", cache).messages / 2;
}

export interface JourneyCost {
  dns: number;
  connect: number;
  request: number;
  total: number;
}

/**
 * Round trips until the first byte of HTML: name lookup + connection setup +
 * one for the request and first response bytes. ARP is excluded (it never
 * leaves the LAN and is cached after the first packet).
 */
export function journeyRtts(cache: DnsCache | "browser", transport: Transport): JourneyCost {
  const dns = dnsRtts(cache);
  const connect = connectRtts(transport);
  return { dns, connect, request: 1, total: dns + connect + 1 };
}
