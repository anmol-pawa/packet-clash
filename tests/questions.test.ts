import { describe, expect, it } from "vitest";
import {
  answerText,
  buildDeck,
  correctResponse,
  grade,
  mcqChoices,
  moveStep,
  parseNumber,
  scrambleSteps,
  sortGroups,
  sortMarks,
  type Question,
  type SortQuestion,
} from "@/game/engine/questions";
import { BANK } from "@/content/questions/bank";
import {
  GENERATORS,
  LAYERS_5,
  PROTOCOL_LAYERS,
  bandwidthDelay,
  broadcastAddress,
  circuitCapacity,
  circuitTime,
  nodalDelay,
  pathThroughput,
  protocolLayer,
  queuingIntensity,
  sortLayers,
  storeForward,
  networkAddress,
  prefixForHosts,
  propDelay,
  subnetHosts,
  txDelay,
} from "@/content/questions/generators";
import {
  bottleneck,
  circuitFileTime,
  circuitUsers,
  probMoreThanActive,
  propagationDelay,
  storeAndForwardTime,
  trafficIntensity,
  transmissionDelay,
} from "@/lib/net/basics";
import { encapsulate, totalBytes } from "@/game/engine/encap";
import { rng } from "@/lib/rng";
import { TYPES } from "@/game/engine/types";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

/** Every structural rule a question must satisfy before it can be shown. */
function checkShape(q: Question) {
  expect(q.prompt.length).toBeGreaterThan(0);
  expect(q.explain.length).toBeGreaterThan(0);
  expect(TYPES).toContain(q.type);
  switch (q.kind) {
    case "mcq":
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices.length).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      break;
    case "multi":
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.answers.length).toBeGreaterThanOrEqual(1);
      expect(q.answers.length).toBeLessThan(q.choices.length);
      for (const a of q.answers) expect(q.choices[a]).toBeDefined();
      break;
    case "numeric":
      expect(Number.isFinite(q.answer)).toBe(true);
      break;
    case "order":
      expect(new Set(q.steps).size).toBe(q.steps.length);
      expect(q.steps.length).toBeGreaterThanOrEqual(3);
      break;
    case "sort":
      expect(new Set(q.bins).size).toBe(q.bins.length);
      expect(new Set(q.items.map((it) => it.label)).size).toBe(q.items.length);
      expect(q.items.length).toBeGreaterThanOrEqual(3);
      for (const it of q.items) expect(q.bins[it.bin]).toBeDefined();
      // At least two bins in use, or there is nothing to sort.
      expect(new Set(q.items.map((it) => it.bin)).size).toBeGreaterThanOrEqual(2);
      break;
  }
  expect(grade(q, correctResponse(q))).toBe(true);
}

describe("grading", () => {
  const mcq = BANK.find((q) => q.id === "arp")!;
  const multi = BANK.find((q) => q.id === "rfc1918")!;
  const order = BANK.find((q) => q.id === "dhcp-dora")!;

  it("grades multiple choice", () => {
    expect(grade(mcq, { kind: "mcq", choice: 2 })).toBe(true);
    expect(grade(mcq, { kind: "mcq", choice: 0 })).toBe(false);
    expect(grade(mcq, { kind: "numeric", value: 2 })).toBe(false);
  });

  it("needs exactly the right set for multi-select, in any order", () => {
    expect(grade(multi, { kind: "multi", choices: [4, 0, 2] })).toBe(true);
    expect(grade(multi, { kind: "multi", choices: [0, 2] })).toBe(false);
    expect(grade(multi, { kind: "multi", choices: [0, 1, 2, 4] })).toBe(false);
    expect(grade(multi, { kind: "multi", choices: [0, 2, 2] })).toBe(false);
    expect(grade(multi, { kind: "multi", choices: [] })).toBe(false);
  });

  it("grades numeric answers with their tolerance", () => {
    const q = txDelay.generate(1);
    if (q.kind !== "numeric") throw new Error("expected numeric");
    expect(grade(q, { kind: "numeric", value: q.answer })).toBe(true);
    expect(grade(q, { kind: "numeric", value: q.answer * 1.004 })).toBe(true);
    expect(grade(q, { kind: "numeric", value: q.answer * 1.02 })).toBe(false);
    expect(grade(q, { kind: "numeric", value: NaN })).toBe(false);
    const exact = BANK.find((x) => x.id === "http-404")!;
    expect(grade(exact, { kind: "numeric", value: 404 })).toBe(true);
    expect(grade(exact, { kind: "numeric", value: 404.5 })).toBe(false);
  });

  it("grades order-the-steps only in the exact order", () => {
    expect(grade(order, { kind: "order", steps: ["Discover", "Offer", "Request", "Acknowledge"] })).toBe(true);
    expect(grade(order, { kind: "order", steps: ["Discover", "Request", "Offer", "Acknowledge"] })).toBe(false);
    expect(grade(order, { kind: "order", steps: ["Discover", "Offer", "Request"] })).toBe(false);
  });

  it("writes the answer out for the explanation box", () => {
    expect(answerText(mcq)).toBe("ARP");
    expect(answerText(multi)).toBe("10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16");
    expect(answerText(order)).toBe("1. Discover  2. Offer  3. Request  4. Acknowledge");
    expect(answerText(txDelay.generate(1))).toMatch(/^\d+(\.\d+)? ms$/);
  });

  it("parses what players type", () => {
    expect(parseNumber("1,500")).toBe(1500);
    expect(parseNumber(" 0.12 ")).toBe(0.12);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("2e-3")).toBe(0.002);
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("12ms")).toBeNaN();
    expect(parseNumber("1.2.3")).toBeNaN();
  });
});

describe("sort into bins", () => {
  const q = BANK.find((x): x is SortQuestion => x.id === "devices-to-layers")!;
  const right = q.items.map((it) => it.bin);

  it("is right only when every item is in its bin", () => {
    expect(grade(q, { kind: "sort", bins: right })).toBe(true);
    // One item in the wrong bin, one left unplaced, a short response, the wrong kind.
    expect(grade(q, { kind: "sort", bins: right.map((b, i) => (i === 0 ? (b + 1) % 3 : b)) })).toBe(false);
    expect(grade(q, { kind: "sort", bins: right.map((b, i) => (i === 1 ? null : b)) })).toBe(false);
    expect(grade(q, { kind: "sort", bins: right.slice(1) })).toBe(false);
    expect(grade(q, { kind: "sort", bins: [...right, 0] })).toBe(false);
    expect(grade(q, { kind: "order", steps: [] })).toBe(false);
  });

  it("marks each item on its own", () => {
    // Switch and Repeater swapped: those two are wrong, the rest are right.
    const swapped = right.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(sortMarks(q, { kind: "sort", bins: swapped })).toEqual([false, false, true, true, true]);
    expect(sortMarks(q, { kind: "sort", bins: right.map(() => null) })).toEqual([false, false, false, false, false]);
    expect(sortMarks(q, { kind: "mcq", choice: 0 }).some(Boolean)).toBe(false);
  });

  it("groups the answer by bin, in bin order", () => {
    expect(sortGroups(q)).toEqual([
      { bin: "Network", items: ["Router"] },
      { bin: "Link", items: ["Switch", "Bridge"] },
      { bin: "Physical", items: ["Repeater", "Hub"] },
    ]);
  });
});

describe("order steps", () => {
  it("never shows the steps already solved, and is seeded", () => {
    const steps = ["a", "b", "c", "d"];
    for (const seed of SEEDS.slice(0, 50)) {
      const s = scrambleSteps(steps, seed);
      expect([...s].sort()).toEqual(steps);
      expect(s).not.toEqual(steps);
      expect(scrambleSteps(steps, seed)).toEqual(s);
    }
    expect(scrambleSteps(["x", "y"], 3)).toEqual(["y", "x"]);
  });

  it("moves a step up or down by one", () => {
    expect(moveStep(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveStep(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveStep(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveStep(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("multiple-choice options", () => {
  it("keeps the answer, drops duplicate distractors and shuffles by seed", () => {
    const m = mcqChoices(rng(5), "B", ["B", "A", "A", "C", "D", "E"]);
    expect(m.choices).toHaveLength(4);
    expect(m.choices[m.answer]).toBe("B");
    expect([...m.choices].sort()).toEqual(["A", "B", "C", "D"]);
    expect(mcqChoices(rng(5), "B", ["A", "C", "D"])).toEqual(mcqChoices(rng(5), "B", ["A", "C", "D"]));
    expect(() => mcqChoices(rng(5), "B", ["A", "A", "B", "C"])).toThrow();
  });
});

describe("the bank", () => {
  it("has unique ids and every kind", () => {
    expect(new Set(BANK.map((q) => q.id)).size).toBe(BANK.length);
    expect(new Set(BANK.map((q) => q.kind))).toEqual(new Set(["mcq", "multi", "numeric", "order", "sort"]));
  });

  it("has well-formed questions whose answers grade as right", () => {
    for (const q of BANK) checkShape(q);
  });

  it("has the right answers", () => {
    const expected: Record<string, string> = {
      "router-layer": "Network (L3)",
      "pdu-names": "Segment",
      "osi-bottom-up": "1. Physical  2. Data link  3. Network  4. Transport  5. Session  6. Presentation  7. Application",
      arp: "ARP",
      rfc1918: "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16",
      "router-rewrites": "TTL, Header checksum",
      "syn-reply": "SYN-ACK",
      "tcp-teardown":
        "1. Client sends FIN  2. Server ACKs the FIN  3. Server sends its own FIN  4. Client ACKs it and waits in TIME_WAIT",
      "dhcp-dora": "1. Discover  2. Offer  3. Request  4. Acknowledge",
      "udp-apps": "DNS queries, DHCP",
      "http-404": "404",
      "tcpip-app-covers": "Application, Presentation, Session",
      "process-to-process": "Transport",
      "frame-onion": "1. Ethernet header  2. IP header  3. TCP header  4. HTTP request  5. Ethernet FCS trailer",
      "router-layers": "Physical, Link, Network",
      "decap-order":
        "1. The NIC turns the signal back into bits  2. The link layer checks the FCS and strips the Ethernet header  3. The network layer sees its own IP address and strips the IP header  4. The transport layer reads the port and hands the data to that socket  5. The application reads the message",
      "packet-switching": "Links are shared on demand (statistical multiplexing), Packets may queue, and be dropped, at a busy router",
      tdm: "TDM",
      "packet-vs-circuit-users": "About 0.04%",
      "delay-by-size": "Transmission delay",
      "intensity-over-one": "It grows without bound (until packets are dropped)",
      "header-overhead": "58 bytes",
      "pdu-link": "Frame",
      "hub-layer": "Hub",
      "devices-to-layers": "Network: Router; Link: Switch, Bridge; Physical: Repeater, Hub",
      "parity-two-flips": "Nothing wrong: the error goes undetected",
      "two-d-parity": "Detect it and correct it",
      "ethernet-fcs": "A CRC-32 over the frame",
      "internet-checksum-users": "The IPv4 header, UDP segments, TCP segments",
      "crc-burst": "Bursts of up to r bits",
      "ethernet-sizes": "64 and 1518 bytes",
      "arp-request-frame": "Broadcast frame to FF:FF:FF:FF:FF:FF; B replies by unicast",
      "arp-off-subnet": "The MAC of the default gateway",
      "csma-cd-order":
        "1. Sense the channel until it is idle  2. Transmit the frame while listening  3. Detect a collision and send a jam signal  4. Wait a random backoff of K × 512 bit times  5. Sense the channel and retransmit",
      "csma-ca-why": "Radios cannot transmit and listen on the same channel at once, and distant stations may not hear each other",
      "hidden-terminal": "The hidden terminal problem: B's CTS, which C hears, makes C stay quiet while A sends",
      "aloha-max": "18.4% and 36.8%",
      "manchester-clock": "Every bit has a mid-bit transition, so the receiver can recover the clock even in a long run of identical bits",
      "switch-vs-hub": "A hub is one collision domain; each switch port is its own collision domain",
      "switch-learning": "It learns the source MAC address and arrival port of every frame it receives",
      "switch-flood-which": "A frame to the broadcast address FF:FF:FF:FF:FF:FF, A frame whose destination MAC is not in the table",
      "vlan-purpose": "Splits one physical switch into separate broadcast domains",
      "vlan-trunk": "An IEEE 802.1Q tag (4 bytes with the 12-bit VLAN ID) is inserted in the Ethernet header",
      "stp-why": "Redundant links create loops, and Ethernet frames have no TTL, so broadcasts would circulate forever (a broadcast storm)",
      "stp-root": "The lowest bridge ID wins: the priority (default 32768), with the MAC address breaking ties",
      "ipv4-ihl": "24 bytes",
      "ipv4-ttl-expiry": "Drops it and sends an ICMP Time Exceeded message to the source",
      "special-addresses": "127.0.0.1, 169.254.10.5, 192.168.4.9",
      "nat-pat": "The router rewrites the source address and port and keeps a table of (private IP, port) ↔ (public IP, port)",
      "nat-inbound": "The NAT table has no entry for an unsolicited inbound packet, so the router doesn't know which private host it is for",
      "ping-icmp": "ICMP echo request and echo reply",
      "traceroute-order":
        "1. Send a probe with TTL = 1  2. The first router drops it and returns ICMP Time Exceeded  3. Send the next probe with TTL = 2  4. Repeat until the destination replies, so the TTL was large enough",
      "path-mtu": "The router drops it and sends ICMP “fragmentation needed” (type 3, code 4) with the link's MTU",
      apipa: "169.254.x.y (link-local, APIPA)",
      "ipv6-size": "128 bits as eight groups of four hex digits",
      "ipv6-vs-ipv4": "The base header is a fixed 40 bytes, There is no header checksum, The TTL field is renamed Hop Limit",
      "ls-vs-dv": "Link-state routers flood every link cost to all routers and each runs Dijkstra on the full map; distance-vector routers only tell neighbours their own distance estimates",
      "rip-infinity": "16",
      "rip-update": "Its whole routing table every 30 seconds, over UDP port 520",
      "ospf-cost": "10",
      "ospf-areas": "To keep link-state flooding and each router's Dijkstra run small; every area connects to the backbone, area 0",
      "ospf-dr": "Routers form adjacencies only with the DR and BDR instead of a full mesh of 10, so there is much less flooding",
      "bgp-pathvector": "A router rejects any route whose AS_PATH already contains its own AS number",
      "ebgp-ibgp": "eBGP runs between routers in different ASes; iBGP runs between routers in the same AS to spread the externally learned routes",
      "bgp-policy": "Between ISPs, routes are chosen by business policy first (for example customer routes over peer routes over provider routes); AS-path length is only a later tie-breaker",
      "default-route": "It matches every destination, Any longer matching prefix wins over it, A stub network or home router typically uses it to send everything unknown to its ISP",
      "static-vs-dynamic": "A small stub network with a single exit, where the route never needs to change",
      "tcp-vs-udp": "Reliable in-order delivery and congestion control",
      "udp-header-size": "8 bytes",
      "socket-tuple": "TCP demultiplexes on the 4-tuple: source IP, source port, destination IP, destination port",
      "well-known-ports": "HTTPS: TCP 443, DNS queries: UDP 53 (TCP 53 for large replies), SMTP: TCP 25",
      "handshake-isn": "x + 1",
      "time-wait": "To let the final ACK be retransmitted if lost, and to let old duplicate segments die out before the 4-tuple is reused",
      "syn-flood": "The queue of half-open connections; SYN cookies",
      "flow-vs-congestion": "Flow control protects the receiver's buffer (rwnd); congestion control protects the network (cwnd)",
      "fast-retransmit": "3",
      aimd: "1. Slow start: cwnd doubles every RTT  2. cwnd reaches ssthresh, switch to congestion avoidance  3. Congestion avoidance: cwnd grows by 1 MSS per RTT  4. Three duplicate ACKs: ssthresh and cwnd are halved",
      "gbn-vs-sr": "Go-Back-N resends 3, 4 and 5; Selective Repeat buffers 4 and 5 and resends only 3",
      "head-of-line": "TCP delivers bytes in order, so one lost segment holds back later data that already arrived, HTTP/2 multiplexes streams over one TCP connection, so a loss can stall all of them, QUIC, over UDP, retransmits per stream so a loss stalls only that stream",
      "dns-record-types": "Name → IPv4 address: A; Name → IPv6 address: AAAA; Name → another name: CNAME; Domain → mail server: MX",
      "dns-resolution-order":
        "1. Ask a root server, which refers it to the .com TLD servers  2. Ask a .com TLD server, which refers it to example.com's authoritative server  3. Ask the authoritative server, which returns the A record  4. Return the answer to the host and cache it",
      "dns-recursive-vs-iterative": "A recursive query; the local server then queries iteratively",
      "dns-transport-port": "53",
      "http-status-classes":
        "2xx Success: 200 OK; 3xx Redirection: 301 Moved Permanently, 304 Not Modified; 4xx Client error: 403 Forbidden, 404 Not Found; 5xx Server error: 500 Internal Server Error, 503 Service Unavailable",
      "http-versions": "HTTP/1.1 over TCP, HTTP/2 over TCP, HTTP/3 over QUIC (UDP)",
      "http-idempotent": "GET, PUT, DELETE",
      "cookie-header": "It sends a Set-Cookie header; the browser returns it in a Cookie header on later requests",
      "conditional-get":
        "1. The cache sends GET with If-Modified-Since (or If-None-Match with an ETag)  2. The origin server checks whether the object changed  3. The server replies 304 Not Modified with no body  4. The cache serves its stored copy to the client",
      "mail-protocols": "Sending mail (push): SMTP; Reading mail (pull): IMAP, POP3",
      "dhcp-ports": "UDP; the server listens on 67 and the client on 68",
      "ssh-ftp": "FTP uses a control connection on port 21 and a separate data connection, SSH runs over TCP port 22 and encrypts the whole session",
      "tls13-handshake-order":
        "1. ClientHello with a key share  2. ServerHello with its key share  3. EncryptedExtensions, Certificate and CertificateVerify  4. Server Finished, then Client Finished",
      "sym-vs-asym": "Symmetric (one shared key): AES, ChaCha20; Asymmetric (public/private key pair): RSA, ECDSA",
      "hybrid-crypto": "Symmetric ciphers are far faster, so asymmetric crypto only sets up and authenticates the shared session key",
      "cert-chain-verify":
        "1. Check the server (leaf) certificate's name and validity dates  2. Verify the leaf's signature using the intermediate CA's public key  3. Verify the intermediate's signature using the root CA's public key  4. Confirm the root is in the browser's trust store",
      "cert-signing-key": "Signed with the CA's private key, verified with the CA's public key",
      "hash-properties": "The digest has a fixed size whatever the input length, It should be infeasible to recover an input from its digest, Changing one input bit should change about half of the output bits",
      "mac-vs-hash": "The HMAC needs a shared secret key, so the attacker cannot compute a valid tag for a changed message",
      "firewall-types":
        "Stateless packet filter: Rules look only at addresses, ports and protocol of each packet, Judges every packet on its own, with no memory of earlier ones; Stateful firewall: Keeps a connection table so replies to outgoing requests are allowed; Application-layer gateway: Relays requests after inspecting the HTTP content",
      "vpn-tunnel": "Encrypts and encapsulates them inside new packets addressed to the VPN gateway",
      "attack-kinds":
        "Availability (deny service): DDoS, SYN flood; Intercepts or alters traffic: Man-in-the-middle, ARP spoofing; Abuses a web page or browser session: XSS, CSRF",
      "xss-csrf-defences": "XSS: escape output and set a Content-Security-Policy; CSRF: anti-CSRF tokens and SameSite cookies",
      "syn-flood-defence": "SYN cookies: encode the connection details in the SYN-ACK's sequence number",
      "tls13-round-trips": "1",
      "https-guarantees": "The traffic's contents are encrypted, Tampering with the data in transit is detected, The server proves its identity with a certificate",
      "iv-tcp-vs-udp": "A late packet is worthless, so waiting for a retransmission only adds delay",
      "iv-lb-l4-l7": "Route by URL path, Host header or cookie",
      "iv-lb-sticky": "Store sessions in a shared store such as Redis, so any server can serve any request",
      "iv-cdn-benefits": "Edge servers near users cut the round-trip time, Cached copies take load off the origin server, Absorbing traffic at many edges helps withstand a DDoS",
      "iv-websocket-upgrade": "An ordinary HTTP GET with Upgrade: websocket, answered by 101 Switching Protocols",
      "iv-websocket-steps":
        "1. TCP three-way handshake  2. TLS handshake  3. HTTP GET with Upgrade: websocket and Sec-WebSocket-Key  4. Server answers 101 Switching Protocols  5. Both sides send WebSocket frames",
      "iv-nat-traversal": "It tells a peer its public IP address and port as the NAT mapped it",
      "iv-stun-turn-ice": "STUN: Reports your public IP and port, Carries no media itself; TURN: Relays the media when no direct path works, Costs the operator real bandwidth; ICE: Gathers candidates and tests which pair connects",
      "iv-subnet-hosts": "30",
      "iv-subnet-broadcast": "7",
      "iv-troubleshoot":
        "1. Check the link light and the host's IP configuration  2. Ping the default gateway  3. Ping a public IP address such as 1.1.1.1  4. Resolve the site's name with nslookup or dig  5. Connect to the port with curl or telnet",
      "iv-anycast": "Many sites announce the same IP prefix via BGP, and routers send you to the closest announcement",
      "iv-proxies": "A forward proxy fronts clients going out; a reverse proxy fronts servers receiving requests",
      "iv-502-504": "The upstream server did not answer within the proxy's timeout",
      "url-fragment": "The fragment, #setup",
      "url-journey-order":
        "1. Parse the URL and check local caches  2. Look for the IP in the browser and OS DNS caches  3. ARP for the default gateway's MAC address  4. DNS query to the recursive resolver  5. TCP three-way handshake with the server  6. TLS handshake  7. HTTP request: GET /  8. Server responds 200 OK with the HTML  9. Parse the HTML and render the page",
      "dns-before-tcp": "TCP can only connect to an IP address, and the URL has a name",
      "onlink-decision": "AND both addresses with the mask: they differ, so send it to the default gateway",
      "frame-dest-mac": "The default gateway's",
      "dns-transport": "A UDP datagram to port 53",
      "journey-nat": "Replaces the private source IP with its public IP, Replaces the source port with one from its pool and records the mapping, Recomputes the IP and TCP checksums",
      "journey-phases": "Finding the server: DNS query for the A record, ARP request for the gateway; Connection setup: TCP SYN, TLS ClientHello; Page transfer: HTTP GET /, HTTP 200 OK with the HTML",
      "journey-cdn-dns": "DNS returns the address of an edge close to the resolver (or via anycast)",
      "journey-http-cache": "Uses the cached copy with no network traffic at all",
      "journey-hsts": "The browser upgrades to https before sending anything",
      "journey-repeat-visit": "The DNS lookup, from a cached record, The ARP exchange, from the ARP cache, The TCP handshake, by reusing a keep-alive connection",
      "journey-render-blocking": "Parsing pauses until the script is downloaded and run",
      "dijkstra-steps":
        "1. Set the source's cost to 0 and every other node's to infinity  2. Settle the unsettled node with the smallest cost  3. Relax its neighbours: lower D(v) if D(u) + c(u,v) is smaller  4. Repeat until every node is settled",
      "ccna-l3-switch": "Route packets between VLANs and subnets in hardware",
      "ccna-ips-inline": "An intrusion prevention system (IPS)",
      "ccna-wlc": "Over a CAPWAP tunnel, which carries control and client data",
      "ccna-device-roles": "Forwards frames by MAC address: Layer-2 switch, Bridge; Forwards packets by IP address: Router; Joins wireless clients to the LAN: Access point; Filters traffic by security policy: Firewall",
      "ccna-utp-cat": "Category 6a",
      "ccna-utp-length": "100 m",
      "ccna-fibre": "It has a much narrower core (about 9 µm), It is driven by a laser and reaches kilometres",
      "ccna-poe-standards": "802.3af (PoE): 15.4 W; 802.3at (PoE+): 30 W; 802.3bt (PoE++): 60 W, 100 W",
      "ccna-poe-loss": "It is lost as heat in the cable",
      "ccna-auto-mdix": "Detects the cable type and swaps its transmit and receive pairs to match",
      "ccna-duplex-mismatch": "Late collisions",
      "ccna-interface-counters": "A frame shorter than 64 bytes: Runts; A frame longer than 1518 bytes: Giants; A frame that failed the FCS check: CRC errors",
      "ccna-crc-causes": "A damaged or over-length cable, Electromagnetic interference, A duplex mismatch",
      "ccna-ping-symbols": "Echo reply received: !; Timed out: .; Destination unreachable: U, N",
      "ccna-ping-first-dot": "The first echo waited on ARP, which timed out the first packet",
      "ccna-ping-u": "A router on the path replied with ICMP destination unreachable, often because it has no route",
      "ccna-traceroute-how": "It sends probes with TTL 1, 2, 3, … and each router that drops one returns ICMP time exceeded",
      "ccna-traceroute-stars": "Check the routing table and ACLs on hop 3, and that a route back exists",
      "ccna-tcp-refused": "The host is reachable but nothing is listening on that port (it answered with a TCP RST)",
      "ccna-tcp-timeout": "A firewall or ACL is dropping TCP port 443",
      "ccna-udp-closed": "ICMP destination unreachable, port unreachable",
      "acl-wildcard-24": "0.0.0.255",
      "acl-host-any": "0.0.0.0 (match every bit): host 10.1.1.1, 10.1.1.1 0.0.0.0; 255.255.255.255 (match no bit): any, 0.0.0.0 255.255.255.255",
      "acl-implicit-deny": "It is dropped by the implicit deny at the end",
      "acl-first-match": "It is permitted by line 1; line 2 is never reached",
      "acl-placement": "As close to the source as possible: Extended ACL (source, destination, protocol, port), Extended ACL that blocks Telnet from one subnet; As close to the destination as possible: Standard ACL (source address only)",
      "acl-numbers": "Standard: access-list 10, access-list 99, access-list 1350; Extended: access-list 100, access-list 150, access-list 2005",
      "acl-standard-match": "The source IP address only",
      "acl-direction": "One per protocol, per direction (one inbound and one outbound for IPv4)",
      "acl-outbound-router": "No: outbound ACLs only filter traffic passing through, not traffic the router originates",
      "acl-vty": "`access-class 5 in` under line vty 0 15",
      "acl-edit-named": "You can delete or insert single lines by sequence number",
      "acl-established": "TCP segments with the ACK or RST flag set (not the first SYN)",
      "acl-block-subnet": "172.16.32.0 0.0.15.255",
      "acl-log-order": "1. A packet arrives on the interface  2. The ACL is checked line by line from the top  3. The first matching line decides: permit or deny  4. If no line matches, the implicit deny drops it",
      "iprt-ad-order": "1. Connected (0)  2. Static (1)  3. EIGRP (90)  4. OSPF (110)  5. RIP (120)",
      "iprt-longest-prefix": "10.1.0.0/16 via RIP",
      "iprt-ad-tie": "OSPF, because 110 < 120",
      "iprt-floating": "ip route 192.168.9.0 255.255.255.0 10.0.0.2 130",
      "iprt-route-codes": "Learned dynamically: O  (OSPF), D  (EIGRP), R  (RIP); Configured or directly attached: S  (static), C  (connected), L  (local)",
      "iprt-local-route": "C 192.168.1.0/24 and L 192.168.1.1/32",
      "iprt-default-route": "ip route 0.0.0.0 0.0.0.0 203.0.113.1",
      "iprt-gateway-last-resort": "A default route exists; packets with no more specific match go to 10.0.0.2",
      "iprt-brackets": "Administrative distance and OSPF cost (metric)",
      "iprt-no-route": "Drops it and sends an ICMP destination unreachable to the sender",
      "iprt-equal-cost": "Installs both and load-balances (ECMP)",
      "iprt-ip-route-parts": "The static route is removed from the routing table",
      "ospf-cost-formula": "10",
      "ospf-gig-cost": "The reference bandwidth is 100 Mbps, so anything faster rounds up to the minimum cost of 1",
      "ospf-ref-bw": "auto-cost reference-bandwidth 10000",
      "ospf-states": "1. Down  2. Init  3. 2-Way  4. ExStart  5. Exchange  6. Loading  7. Full",
      "ospf-dr-election": "Highest interface priority, then highest router ID",
      "ospf-dr-nonpreempt": "Nothing: the election is not pre-emptive, the existing DR stays until it fails or OSPF restarts",
      "ospf-priority-zero": "The router can never become DR or BDR on that segment",
      "ospf-router-id": "Manual router-id, then highest loopback IP, then highest active interface IP",
      "ospf-twoway": "2-Way",
      "ospf-hello-match": "Area ID, Hello and dead timers, Subnet and mask on the link",
      "ospf-passive": "The network is still advertised, but no hellos are sent so no neighbours form on it",
      "ospf-multicast": "224.0.0.5",
      "ospf-area0": "Area 0, the backbone",
      "eigrp-metric-inputs": "Minimum bandwidth along the path and cumulative delay",
      "eigrp-successor": "A backup next hop whose reported distance is lower than the successor's feasible distance",
      "eigrp-config": "Autonomous system number and K values",
      "stp-root-election": "The lowest bridge ID: priority first, then the lowest MAC address",
      "stp-default-priority": "32778",
      "stp-root-port": "The port with the lowest total path cost to the root bridge",
      "stp-costs": "100, 19, 4",
      "stp-states": "Blocking, Listening, Learning, Forwarding",
      "stp-portfast": "Moves an edge port straight to forwarding; only on access ports facing hosts",
      "stp-bpduguard": "The port is put in err-disabled state",
      "rstp-vs-stp": "Sub-second to a few seconds convergence using proposal/agreement and alternate ports",
      "etherchannel-modes": "LACP active on one side, LACP passive on the other",
      "etherchannel-match": "Speed, duplex and VLAN/trunk configuration",
      "etherchannel-why": "STP treats the bundle as one link, so all member links forward and bandwidth adds up",
      "port-sec-modes": "restrict",
      "port-sec-default": "shutdown, 1 address",
      "port-sec-sticky": "Learns MAC addresses dynamically and adds them to the running config",
      "dhcp-snooping-trust": "Ports toward the legitimate DHCP server and uplinks",
      "dai-purpose": "ARP spoofing / poisoning (man-in-the-middle)",
      "router-on-a-stick": "One trunk link to the router with a subinterface per VLAN using dot1Q encapsulation",
      "native-vlan": "The VLAN whose frames are sent untagged (VLAN 1 by default)",
      "dtp-modes": "dynamic auto on both sides",
      "cdp-lldp": "CDP is Cisco-proprietary; LLDP (802.1AB) is the open standard",
      "v6-gua-range": "2000::/3",
      "v6-link-local": "Only on the local link; routers never forward it",
      "v6-ula": "Unique local, fc00::/7 (in practice fd00::/8)",
      "v6-no-broadcast": "Multicast, such as ff02::1 (all nodes)",
      "v6-eui64": "Insert FFFE in the middle of the MAC and flip the 7th bit of the first byte",
      "v6-slaac": "The /64 prefix from a Router Advertisement; the host builds the 64-bit interface ID itself",
      "v6-dhcpv6-modes": "The host forms its address by SLAAC and DHCPv6 only supplies extra options such as DNS servers",
      "v6-ndp-messages": "Router Solicitation, Router Advertisement, Neighbor Solicitation, Neighbor Advertisement",
      "v6-solicited-node": "The solicited-node multicast address ff02::1:ffXX:XXXX built from the last 24 bits of the target address",
      "v6-dad": "Sending a Neighbor Solicitation for the host's own tentative address; any reply means the address is in use",
      "v6-slaac-steps":
        "1. Build a link-local address (fe80::/64 + interface ID)  2. Run DAD on that link-local address  3. Send a Router Solicitation to ff02::2  4. Receive a Router Advertisement with the prefix  5. Build a global address from the prefix and run DAD again",
      "v6-routing-enable": "ipv6 unicast-routing",
      "v6-static-route": "fe80:: addresses repeat on every link, so the router cannot tell which link the next hop is on",
      "v6-ospfv3": "It runs per link, uses link-local addresses for neighbours, and still needs a 32-bit router ID",
      "v6-dualstack": "A host that runs IPv4 and IPv6 at the same time on its interface",
      "v6-transition": "Tunnelling (for example 6in4 or GRE)",
      "nat-types": "PAT (NAT overload)",
      "nat-inside-local": "The private address configured on the inside host, as seen on the inside network",
      "nat-inside-global": "Inside global",
      "nat-overload": "ip nat inside source list 1 interface GigabitEthernet0/1 overload",
      "nat-interfaces": "`ip nat inside` on the LAN-facing interface and `ip nat outside` on the Internet-facing one",
      "nat-pool-exhaust": "Three hosts are translated and the fourth is dropped until an entry times out",
      "ntp-stratum": "3",
      "ntp-port": "UDP 123",
      "dhcp-relay": "It forwards the clients' broadcast DHCP messages to the server as unicast",
      "dhcp-giaddr": "From the giaddr field the relay agent fills in",
      "dns-client": "ip name-server 8.8.8.8",
      "snmp-versions": "SNMPv3",
      "snmp-ports": "Agent listens on 161 for polls; manager listens on 162 for traps",
      "snmp-mib": "The tree of managed objects on a device, each identified by an object ID",
      "syslog-levels": "Warning",
      "syslog-trap": "Levels 0 to 4 (Emergency through Warning)",
      "qos-marking": "DSCP in the IP header (6 bits); CoS in the 802.1Q tag (3 bits)",
      "qos-ef": "EF (Expedited Forwarding, DSCP 46)",
      "qos-af": "Class 3 (queue), drop precedence 1; DSCP = 8×3 + 2×1 = 26",
      "qos-police-shape": "Policing drops or re-marks excess traffic; shaping buffers and delays it",
      "fhrp-purpose": "Hosts keep a working default gateway when one router fails",
      "fhrp-which": "HSRP and GLBP are Cisco proprietary; VRRP is an open standard",
      "hsrp-election": "The one with the higher interface IP address",
      "hsrp-preempt": "R2, until it fails or R1 is configured with preempt",
      "hsrp-vmac": "0000.0c07.ac0a",
      "hsrp-multicast": "224.0.0.102",
      "glbp-roles": "The active virtual gateway (AVG)",
      "wlan-24-channels": "1, 6 and 11",
      "wlan-5ghz": "More non-overlapping channels and less interference, at the cost of shorter range",
      "wlan-standards": "802.11ac",
      "wlan-ssid-bssid": "The SSID is the network name; the BSSID is the MAC address of one access point radio",
      "wlan-ap-modes": "A lightweight AP is configured and managed by a wireless LAN controller; an autonomous AP is configured on its own",
      "wlan-capwap": "CAPWAP",
      "wlan-wpa": "WPA3",
      "wlan-wpa2-cipher": "AES with CCMP",
      "wlan-8021x": "Supplicant (client), authenticator (AP or switch) and authentication server (RADIUS)",
      "sec-aaa": "Authentication, authorization and accounting",
      "sec-radius-tacacs": "TACACS+ uses TCP, separates the three A functions and encrypts the entire body; RADIUS uses UDP and encrypts only the password",
      "sec-threats": "Denial of service (SYN flood)",
      "sec-vpn-types": "Site-to-site VPN",
      "sec-ipsec-modes": "Transport mode protects only the payload and keeps the original IP header; tunnel mode encapsulates the whole original packet in a new IP header",
      "sec-ike": "Phase 1 builds a secure management channel (the IKE SA); phase 2 negotiates the IPsec SAs that protect the data",
      "sec-esp-ah": "ESP",
      "sec-ssh-telnet": "SSH encrypts the session, while Telnet sends everything, including passwords, in clear text",
      "sec-enable-secret": "enable secret",
      "sec-hardening": "Shut it down and move it to an unused VLAN",
      "sec-dos-l2": "A rogue DHCP server handing out bad gateway and DNS information",
      "sec-ports": "UDP 1812",
      "wlan-roaming": "It reassociates with the new AP (BSSID) while the SSID and subnet stay the same",
      "auto-planes": "Control plane",
      "auto-sdn": "The control plane is separated from the data plane and centralised in a controller",
      "auto-northbound": "The controller and the applications or orchestration above it",
      "auto-southbound": "NETCONF",
      "auto-controller-vs-trad": "Policy is defined once centrally and pushed to many devices, instead of configuring each device by hand",
      "auto-fabric": "Underlay",
      "auto-dnac": "Cisco DNA Center",
      "auto-rest-verbs": "POST",
      "auto-idempotent": "POST",
      "auto-status": "The request is not authenticated (missing or bad credentials)",
      "auto-404": "No device with that identifier exists at that URL",
      "auto-json": "Data is held as key/value pairs in { } objects and values in [ ] arrays, with keys in double quotes",
      "auto-yaml": "YAML",
      "auto-xml": "XML",
      "auto-netconf": "Over SSH (TCP 830) with XML-encoded RPCs",
      "auto-restconf": "A REST-style HTTP interface to YANG-modelled device data, using JSON or XML",
      "auto-yang": "A data model for the configuration and state data of network devices",
      "auto-ansible": "It is agentless, pushes changes over SSH or APIs and uses YAML playbooks",
      "auto-puppet-chef": "Puppet and Chef",
      "auto-terraform": "Declaring and provisioning infrastructure as code (typically cloud resources) with HCL",
      "auto-declarative": "Declarative describes the desired end state; imperative lists the steps to run",
      "auto-drift": "Configuration drift between devices that should be identical",
      "auto-json-read": "20",
      "auto-diff": "The interface IP address was replaced by 10.0.1.1/24",
      "lb-roundrobin-weak": "When requests differ a lot in cost or backends differ in capacity",
      "lb-weighted": "6",
      "lb-leastconn-when": "Long-lived or highly variable connections, such as WebSockets or uploads",
      "lb-iphash": "The same client reaches the same backend without any shared session store",
      "lb-p2c": "Sample two backends at random and send the request to the less loaded one",
      "lb-modn": "Changing N remaps most keys, so most of the cache goes cold at once",
      "lb-consistent": "Only the keys on the arcs the new node takes over, about 1/N of them",
      "lb-vnodes": "To even out load and to spread a failed node's keys across many survivors",
      "lb-healthcheck": "The balancer probes backends periodically and stops sending traffic to ones that fail",
      "lb-health-depth": "If the shared database fails, every backend is marked unhealthy and the whole service goes down",
      "lb-draining": "The backend stops receiving new connections but existing ones are allowed to finish before it is removed",
      "lb-l4-l7": "Route by URL path, host header or cookie",
      "lb-dsr": "The backend replies straight to the client, bypassing the load balancer",
      "lb-proxy-ip": "From the X-Forwarded-For header (or PROXY protocol for TCP)",
      "lb-sticky": "Sticky sessions (affinity), or better, move the session to a shared store",
      "lb-gslb-dns": "It answers with different IP addresses depending on resolver location, health and load",
      "lb-anycast": "The same IP prefix is announced from many locations, and routing (BGP) delivers each client to the nearest one",
      "lb-lb-ha": "Run a pair or cluster with a shared virtual IP (VRRP/keepalived) or front it with anycast/ECMP",
      "lb-retry-lb": "Idempotent ones such as GET and PUT",
      "lb-leastconn-new": "It is flooded with all new connections until it catches up (a thundering herd on the new node)",
      "lb-algos-match": "Round robin",
      "rl-why": "To protect capacity and fairness: one noisy or abusive client must not starve the others",
      "rl-429": "429 Too Many Requests with Retry-After",
      "rl-token-burst": "Bucket size controls the allowed burst; refill rate controls the sustained average rate",
      "rl-token-vs-leaky": "The leaky bucket smooths output to a constant rate; the token bucket permits bursts up to its size",
      "rl-fixed-flaw": "A burst straddling a window boundary can let through up to twice the limit",
      "rl-sliding-log": "It is exact but stores a timestamp for every request, so memory grows with the limit",
      "rl-sliding-counter": "It weights the previous window's count by the fraction of it still inside the sliding window, and adds the current count",
      "rl-distributed": "Keep the counters in a fast shared store such as Redis, using atomic operations (INCR, a Lua script)",
      "rl-key": "The authenticated API key or user ID, with IP address as a fallback for anonymous traffic",
      "rl-failopen": "Usually fail open (allow traffic) for ordinary APIs, so a limiter outage does not become a full outage; fail closed for abuse-sensitive endpoints such as login",
      "rl-retry-when": "Transient ones: timeouts, connection resets, 503 and 429 (after waiting)",
      "rl-backoff": "Waits grow after each failure, giving an overloaded service room to recover",
      "rl-jitter": "Without it, clients that failed together retry together in synchronised waves",
      "rl-herd": "A cache stampede (thundering herd); let one request rebuild while others wait, or refresh early / add jitter to TTLs",
      "rl-amplify": "Retries multiply down the chain, so one user request can become dozens of calls to the bottom service",
      "rl-timeout": "Without one, a hung dependency ties up threads and connections until the caller runs out of resources",
      "rl-breaker-states": "Closed (normal), open (fail fast), half-open (let a probe through)",
      "rl-breaker-why": "Fast failure that spares the dependency extra load and frees the caller's threads",
      "rl-idempotency": "The server stores the result for each key and returns it for a repeated request instead of charging twice",
      "rl-backpressure": "A signal that makes producers slow down when consumers cannot keep up (bounded queues, blocking writes, TCP windows)",
      "rl-shed": "Rejecting some requests early keeps latency good for the rest and avoids collapse where all requests time out",
      "rl-bulkhead": "Isolate resources (thread pools, connection pools) per dependency so one slow dependency cannot exhaust them all",
      "tp-cubic-bbr": "CUBIC reacts to packet loss; BBR models bottleneck bandwidth and minimum RTT and paces to that",
      "tp-sack": "The sender learns exactly which segments arrived after a hole, so it retransmits only the missing ones",
      "tp-wscale": "The 16-bit window field caps the window at 65,535 bytes, far below the bandwidth-delay product",
      "tp-iw10": "Most web responses are small, and a larger start saves several round trips of slow start",
      "tp-timewait": "To absorb delayed duplicate segments and make sure the final ACK can be retransmitted, for 2 × MSL",
      "tp-timewait-exhaust": "Ephemeral ports are tied up in TIME_WAIT, so there are none free for the same destination",
      "tp-reuseaddr": "REUSEADDR lets it bind while old connections sit in TIME_WAIT; REUSEPORT lets several sockets share one port so the kernel spreads connections among them",
      "tp-nagle": "The sender holds a small segment until the previous one is acknowledged, while the receiver delays that ACK waiting for data to piggyback it on",
      "tp-keepalive": "A dead or vanished peer (and keeps NAT or firewall state from expiring) on an otherwise idle connection",
      "tp-bufferbloat": "Oversized buffers on a bottleneck link fill up and add hundreds of milliseconds of queueing delay under load",
      "tp-quic-udp": "Middleboxes and operating systems already pass UDP, and QUIC can be updated in user space without waiting for kernel or network upgrades",
      "tp-quic-hol": "Each stream has its own ordering, so loss on one stream does not stall the others",
      "tp-quic-migration": "It is identified by a connection ID, not by the IP address and port four-tuple",
      "tp-0rtt": "Early data can be replayed by an attacker, so only idempotent requests should be accepted",
      "tp-http2-mux": "Many requests and responses share a single connection at once, instead of queueing one behind another",
      "tp-push-removed": "Servers often pushed resources the client already had cached, wasting bandwidth, and it proved hard to use well",
      "tp-http3": "HTTP semantics carried over QUIC instead of TCP",
      "tp-tls-resume": "The cost of a full handshake (certificate exchange and key agreement) on a repeat connection, using a ticket or PSK from the earlier session",
      "tp-ocsp": "The server attaches a recent signed OCSP response proving its certificate is not revoked, so the client needn't contact the CA",
      "tp-mathis": "It is proportional to 1/(RTT × √p): lower loss and lower RTT both help",
      "tp-bdp": "10 MB",
      "rt-poll-vs-long": "In long polling the server holds the request open until it has data or times out, instead of answering at once",
      "rt-sse": "One-way server-to-client streams (feeds, notifications) over plain HTTP, with automatic reconnect and Last-Event-ID",
      "rt-ws-upgrade": "An HTTP/1.1 request with Upgrade: websocket; the server answers 101 Switching Protocols and the same TCP connection carries WebSocket frames",
      "rt-ws-scale": "Each client holds a long-lived connection, so servers are stateful: connection limits, sticky routing and fan-out across nodes (pub/sub) become design concerns",
      "rt-webrtc": "UDP-based SRTP media with ICE (STUN/TURN) for NAT traversal and DTLS to set up the keys",
      "rt-stun-turn": "STUN only tells a client its public IP:port so peers can connect directly; TURN relays the media when a direct path is impossible",
      "rt-which": "Server-Sent Events (or a WebSocket)",
      "rt-udp-games": "A late packet is worthless, so they avoid TCP's retransmission delay and head-of-line blocking and handle loss in the application",
      "rt-jitter": "Variation in packet transit time; a jitter buffer holds packets briefly to play them at an even pace",
      "rt-rtp-fields": "Sequence number (order and loss) and timestamp (playout timing)",
      "rt-rtcp": "Carries periodic sender and receiver reports (loss, jitter, round-trip time) so the sender can adapt its bitrate",
      "rt-grpc": "HTTP/2 for transport and Protocol Buffers for compact, schema-defined messages",
      "rt-grpc-streams": "Unary, server streaming, client streaming and bidirectional streaming",
      "rt-grpc-lb": "One long-lived HTTP/2 connection carries many calls, so all calls from a client stick to one backend; balance per request at L7 or on the client",
      "rt-rest-graphql": "Over-fetching and under-fetching: the client asks for exactly the fields it needs in one request",
      "rt-graphql-cache": "Queries usually go to one POST endpoint, so URL-keyed caches and CDNs cannot tell them apart",
      "rt-pubsub": "They are decoupled: producers publish to a topic and the broker delivers to every subscriber, without the producer knowing them",
      "rt-queue-vs-pubsub": "In a queue each message goes to one worker in the group; in fan-out each subscriber gets its own copy",
      "rt-delivery": "The broker redelivers the message, so consumers must be idempotent",
      "rt-polling-cost": "About 2,000 requests per second, nearly all empty, plus radio wake-ups on every phone",
      "rt-heartbeat": "To keep NAT, proxy and load balancer idle timeouts from closing the connection, and to notice dead peers",
      "rt-adaptive": "Streaming tolerates seconds of buffering and benefits from CDNs and caching; a call needs low latency and cannot wait for retransmissions",
      "dc-leafspine": "Every spine, and never another leaf; servers attach only to leaves",
      "dc-vs-3tier": "East-west (server-to-server) traffic dominates, and a tree funnels it through oversubscribed upper layers; leaf-spine gives uniform paths and scales by adding spines",
      "dc-ecmp": "It hashes the 5-tuple, so every packet of one flow takes the same path while different flows spread out",
      "dc-elephant": "Hash collisions can put several elephant flows on the same link while others sit idle",
      "dc-oversub": "Servers could together send more than the uplinks can carry, so heavy traffic may queue or drop at the leaf",
      "dc-vxlan": "It tunnels Layer-2 segments over a Layer-3 network (MAC-in-UDP) so tenants get isolated virtual networks across the fabric",
      "dc-vxlan-mtu": "Raise the underlay MTU to at least 1550 (jumbo frames are common), or lower the guest MTU",
      "dc-vxlan-sport": "So the fabric's ECMP sees entropy and spreads different inner flows over different paths",
      "dc-vpc-sg-nacl": "Security groups are stateful and attach to instances; NACLs are stateless and apply per subnet, with ordered rules",
      "dc-public-subnet": "Its route table sends 0.0.0.0/0 to an internet gateway (and instances have public IPs)",
      "dc-nat-gw": "Instances can start outbound connections to the internet, but the internet cannot start inbound ones",
      "dc-peering": "A cannot reach C through B; you need a direct A-C peering or a transit gateway",
      "dc-k8s-pod": "Every pod gets its own IP and can reach every other pod without NAT",
      "dc-k8s-service": "Pods are ephemeral, so a Service gives a stable virtual IP and DNS name that load-balances across the current ready pods",
      "dc-k8s-types": "NodePort exposes a port on every node; LoadBalancer asks the cloud for an external load balancer in front of it; ClusterIP is internal only",
      "dc-ingress": "Layer-7 routing by host and path (plus TLS termination) to many Services behind one entry point",
      "dc-kubeproxy": "Programs rules (iptables, IPVS) so traffic to a Service IP is DNAT-ed to one of its backing pods",
      "dc-mesh": "Per-hop mTLS, retries, timeouts, load balancing and metrics without changing application code",
      "dc-mtls": "Both sides present certificates, so the server also authenticates the client (a workload identity)",
      "dc-discovery": "Client-side: the client asks a registry and picks an instance; server-side: a load balancer or proxy does the lookup",
      "dc-dns-ttl": "Clients keep resolving to instances that have already gone away until the cache expires",
      "dc-anycast": "The same IP is announced from many sites via BGP and routing sends each client to a nearby one",
    };
    expect(Object.keys(expected).sort()).toEqual(BANK.map((q) => q.id).sort());
    for (const q of BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
  });
});

describe("generators", () => {
  it("are deterministic, well-formed and never fail to build", () => {
    for (const g of GENERATORS) {
      for (const seed of SEEDS) {
        const q = g.generate(seed);
        expect(q.id.startsWith(g.id)).toBe(true);
        expect(q.topic).toBe(g.topic);
        expect(q.type).toBe(g.type);
        expect(q.difficulty).toBe(g.difficulty);
        checkShape(q);
        expect(g.generate(seed)).toEqual(q);
      }
    }
  });

  it("vary with the seed", () => {
    for (const g of GENERATORS) expect(new Set(SEEDS.map((s) => g.generate(s).id)).size).toBeGreaterThan(3);
  });

  it("match Forouzan's worked delay examples", () => {
    // Forouzan, Data Communications and Networking: 12,000 km at 2.4×10⁸ m/s → 50 ms.
    expect(propagationDelay(12_000_000, 2.4e8) * 1000).toBeCloseTo(50, 9);
    // …and a 2.5 kB e-mail on a 1 Gbps link → 0.020 ms of transmission time.
    expect(transmissionDelay(2500, 1e9) * 1000).toBeCloseTo(0.02, 12);
    const p = SEEDS.map((s) => propDelay.generate(s)).find((q) => q.id === "gen-prop-delay:12000:240000000");
    expect(p && p.kind === "numeric" && p.answer).toBeCloseTo(50, 9);
  });

  it("solve delays and the bandwidth-delay product", () => {
    for (const seed of SEEDS) {
      const t = txDelay.generate(seed);
      const [, bytes, mbps] = t.id.split(":").map(Number);
      if (t.kind !== "numeric") throw new Error("numeric");
      expect(t.answer).toBeCloseTo((bytes * 8) / (mbps * 1000), 9);
      const b = bandwidthDelay.generate(seed);
      const [, r, rtt] = b.id.split(":").map(Number);
      if (b.kind !== "numeric") throw new Error("numeric");
      expect(b.answer).toBe(r * rtt);
    }
    // 1,000 bytes on 1 Mbps → 8 ms (Kurose & Ross's L/R).
    const k = SEEDS.map((s) => txDelay.generate(s)).find((q) => q.id === "gen-tx-delay:1000:1");
    expect(k && answerText(k)).toBe("8 ms");
  });

  it("solve subnet sizes", () => {
    const byPrefix = new Map(SEEDS.map((s) => subnetHosts.generate(s)).map((q) => [q.id, q]));
    const h = (p: number) => {
      const q = byPrefix.get(`gen-subnet-hosts:${p}`);
      return q && q.kind === "numeric" ? q.answer : undefined;
    };
    expect(h(24)).toBe(254);
    expect(h(26)).toBe(62);
    expect(h(30)).toBe(2);
    expect(h(20)).toBe(4094);

    for (const seed of SEEDS) {
      const q = prefixForHosts.generate(seed);
      if (q.kind !== "numeric") throw new Error("numeric");
      const need = Number(q.id.split(":")[1]);
      expect(2 ** (32 - q.answer) - 2).toBeGreaterThanOrEqual(need);
      expect(2 ** (32 - (q.answer + 1)) - 2).toBeLessThan(need);
    }
  });

  it("solve network and broadcast addresses", () => {
    for (const seed of SEEDS) {
      const n = networkAddress.generate(seed);
      const b = broadcastAddress.generate(seed);
      expect(n.prompt).toContain(n.id.split(":")[1]);
      expect(b.prompt).toContain(b.id.split(":")[1]);
    }
    // Recompute every instance independently, with plain arithmetic instead of bit masks.
    const all = SEEDS.flatMap((s) => [networkAddress.generate(s), broadcastAddress.generate(s)]);
    for (const q of all) {
      const [ip, len] = q.id.split(":")[1].split("/");
      const [a, b, c, d] = ip.split(".").map(Number);
      const n = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
      const host = 2 ** (32 - Number(len));
      const net = n - (n % host);
      const want = q.id.startsWith("gen-network") ? net : net + host - 1;
      const dotted = [24, 16, 8, 0].map((s) => Math.floor(want / 2 ** s) % 256).join(".");
      expect(answerText(q)).toBe(dotted);
    }
  });
});

describe("gym 1 (models and basics) generators", () => {
  const all = <T,>(g: { generate(s: number): T }) => SEEDS.map((s) => g.generate(s));

  it("match Kurose & Ross's packet- and circuit-switching examples", () => {
    // §1.3: one packet over N links takes N·L/R; three packets over two links take 4·L/R.
    expect(storeAndForwardTime(1000, 1e6, 3)).toBeCloseTo(3 * 0.008, 12);
    expect(storeAndForwardTime(1000, 1e6, 2, 3)).toBeCloseTo(4 * 0.008, 12);
    expect(() => storeAndForwardTime(1000, 1e6, 0)).toThrow();
    // §1.3: a 640,000-bit file over a 1.536 Mbps, 24-slot TDM circuit with 500 ms setup takes 10.5 s.
    expect(circuitFileTime(640_000, 1.536e6, 24, 0.5)).toBeCloseTo(10.5, 9);
    // §1.3: a 1 Mbps link and 100 kbps users: 10 circuits; with 35 users active 10% of the time,
    // P(more than 10 active) ≈ 0.0004.
    expect(circuitUsers(1e6, 100e3)).toBe(10);
    expect(probMoreThanActive(35, 0.1, 10)).toBeCloseTo(0.000424, 5);
    expect(probMoreThanActive(10, 0.5, -1)).toBeCloseTo(1, 12);
    expect(probMoreThanActive(10, 0.5, 10)).toBe(0);
    // §1.4.4: a 32 Mbit file with Rs = 2 Mbps and Rc = 1 Mbps takes 32 s.
    expect(32e6 / bottleneck([2e6, 1e6])).toBe(32);
    expect(() => bottleneck([])).toThrow();
    // §1.4.2: La/R for 1,000-byte packets at 100/s on 1 Mbps = 0.8.
    expect(trafficIntensity(1000, 100, 1e6)).toBeCloseTo(0.8, 12);
  });

  it("solve one-hop delay, traffic intensity and store-and-forward", () => {
    for (const q of all(nodalDelay)) {
      const [, bytes, mbps, km] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer).toBeCloseTo((bytes * 8) / (mbps * 1000) + km / 200, 9);
    }
    for (const q of all(queuingIntensity)) {
      const [, bytes, pps, mbps] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer).toBeCloseTo((bytes * 8 * pps) / (mbps * 1e6), 12);
      expect(q.explain).toContain(q.answer >= 1 ? "without bound" : q.answer > 0.8 ? "shoots up" : "short queue");
    }
    for (const q of all(storeForward)) {
      const [, links, packets, bytes, mbps] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      // Simulate the pipeline: packet p finishes link k at (p + k)·L/R (0-based p, 1-based k).
      const lr = (bytes * 8) / (mbps * 1000);
      let done = 0;
      for (let p = 0; p < packets; p++) for (let k = 1; k <= links; k++) done = Math.max(done, (p + k) * lr);
      expect(q.answer).toBeCloseTo(done, 9);
    }
  });

  it("solve circuit switching and bottleneck throughput", () => {
    for (const q of all(circuitTime)) {
      const [, kbit, rate, slots, setup] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer).toBeCloseTo(setup / 1000 + (kbit * 1000 * slots) / rate, 9);
      expect(Number.isInteger(rate / slots)).toBe(true);
    }
    for (const q of all(circuitCapacity)) {
      const [, mbps, kbps] = q.id.split(":").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(q.answer * kbps).toBeLessThanOrEqual(mbps * 1000);
      expect((q.answer + 1) * kbps).toBeGreaterThan(mbps * 1000);
    }
    for (const q of all(pathThroughput)) {
      const [, path, mbit] = q.id.split(":");
      const rates = path.split("-").map(Number);
      if (q.kind !== "numeric") throw new Error("numeric");
      expect(new Set(rates).size).toBe(3);
      expect(q.answer).toBeCloseTo(Number(mbit) / Math.min(...rates), 9);
    }
  });

  it("place every protocol in its layer", () => {
    expect(PROTOCOL_LAYERS.TCP).toBe("Transport");
    expect(PROTOCOL_LAYERS.ICMP).toBe("Network");
    expect(PROTOCOL_LAYERS.Ethernet).toBe("Link");
    expect(PROTOCOL_LAYERS.DNS).toBe("Application");
    expect(new Set(Object.values(PROTOCOL_LAYERS))).toEqual(new Set(LAYERS_5));
    const seen = new Set<string>();
    for (const q of all(protocolLayer)) {
      const proto = q.id.split(":")[1];
      seen.add(proto);
      expect(answerText(q)).toBe(PROTOCOL_LAYERS[proto]);
      expect(q.prompt).toContain(proto);
    }
    expect(seen.size).toBe(Object.keys(PROTOCOL_LAYERS).length);
  });

  it("sort a protocol from every layer into its layer", () => {
    const seen = new Set<string>();
    for (const q of all(sortLayers)) {
      if (q.kind !== "sort") throw new Error("sort");
      expect(q.bins).toEqual([...LAYERS_5]);
      expect(q.items).toHaveLength(6);
      // Every layer gets at least one protocol, and one gets two.
      expect(new Set(q.items.map((it) => it.bin)).size).toBe(5);
      for (const it of q.items) {
        seen.add(it.label);
        expect(q.bins[it.bin]).toBe(PROTOCOL_LAYERS[it.label]);
        expect(q.explain).toContain(it.label);
      }
      expect(q.id).toBe(`gen-sort-layers:${q.items.map((it) => it.label).join("|")}`);
    }
    expect(seen.size).toBe(Object.keys(PROTOCOL_LAYERS).length);
    const fixed = sortLayers.generate(3);
    if (fixed.kind !== "sort") throw new Error("sort");
    const tcp = { ...fixed, items: [{ label: "TCP", bin: 1 }, { label: "Ethernet", bin: 3 }] };
    expect(answerText(tcp)).toBe("Transport: TCP; Link: Ethernet");
  });

  it("agree with the encapsulation engine on header overhead", () => {
    // The HTTP message is well over Ethernet's 46-byte minimum once in TCP + IP, so there is no padding.
    const [message, , , frame] = encapsulate("APPLICATION");
    const q = BANK.find((x) => x.id === "header-overhead")!;
    if (q.kind !== "numeric") throw new Error("numeric");
    expect(q.answer).toBe(totalBytes(frame) - totalBytes(message));
  });
});

describe("decks", () => {
  it("filters by topic and difficulty, adds one instance per generator, and is seeded", () => {
    const deck = buildDeck(BANK, GENERATORS, { seed: 9, size: 50, topics: ["network"] });
    expect(deck.every((q) => q.topic === "network")).toBe(true);
    const fixed = BANK.filter((q) => q.topic === "network").length;
    const gens = GENERATORS.filter((g) => g.topic === "network").length;
    expect(deck).toHaveLength(fixed + gens);
    expect(buildDeck(BANK, GENERATORS, { seed: 9, size: 50, topics: ["network"] })).toEqual(deck);

    const easy = buildDeck(BANK, GENERATORS, { seed: 2, size: 5, difficulties: [1] });
    expect(easy).toHaveLength(5);
    expect(easy.every((q) => q.difficulty === 1)).toBe(true);
  });
});
