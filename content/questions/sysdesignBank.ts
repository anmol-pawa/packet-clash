/**
 * 5.9 system-design networking: which component solves which problem, with sizing intuition.
 * Answers are pinned in tests/questions.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "interview", type: "APPLICATION", difficulty, prompt, choices, answer: slot, explain };
}

function sortCard(id: string, difficulty: Difficulty, prompt: string, bins: string[], items: [string, number][], explain: string): Question {
  return { id, kind: "sort", topic: "interview", type: "APPLICATION", difficulty, prompt, bins, items: items.map(([label, bin]) => ({ label, bin })), explain };
}

export const SYSDESIGN_BANK: readonly Question[] = [
  card("sd-url-edge", 2, 1, "Design the edge of a URL shortener: redirects are 100x more frequent than creates and a short code never changes. What belongs at the edge?", "A CDN or edge cache that serves the 301/302 from cache by code, with only misses reaching the origin",
    ["A WebSocket per visitor", "A single global primary database queried for every redirect", "A TCP load balancer with no caching"],
    "Reads dominate and the mapping is immutable, so cache hard at the edge (high hit ratio, short path), keep the database for creates and misses, and mind cache-control for expired or deleted links."),
  card("sd-video-delivery", 2, 2, "Which approach fits streaming a popular video to millions of viewers on varying networks?", "Segment it into a few-second chunks at several bitrates (HLS/DASH), served from CDN caches near viewers",
    ["Stream one file from the origin over UDP with no adaptation", "Open one long TCP connection per viewer to the origin", "Send every viewer the highest bitrate"],
    "Chunked adaptive bitrate lets the player switch quality per chunk, and plain HTTP chunks are cacheable by any CDN, so the origin sees roughly one fetch per chunk per region."),
  card("sd-global-chat", 3, 3, "Which transport suits a global chat app that must push messages to online users within a second?", "A persistent WebSocket (or similar) to a nearby gateway, with a message bus fanning out between gateways",
    ["Short-polling every 30 seconds", "A new HTTPS request per message with no connection reuse", "Email as a fallback for every message"],
    "Persistent connections avoid per-message handshakes and let the server push. Gateways hold millions of idle connections; a pub/sub layer routes a message to whichever gateway holds the recipient."),
  card("sd-api-gateway", 2, 0, "What is an API gateway's job in front of many microservices?", "A single entry point doing TLS termination, authentication, rate limiting and routing to backend services",
    ["Storing each service's database", "Replacing DNS for service discovery inside the cluster", "Compiling the services' code"],
    "Cross-cutting edge concerns live in one place: TLS, authn, quotas, request routing, sometimes response shaping. It must be redundant itself, since everything flows through it."),
  card("sd-l4-l7", 2, 1, "You need to route `/api` to one pool and `/static` to another. Which load balancer?", "A Layer 7 (HTTP-aware) load balancer, because routing depends on the URL path",
    ["A Layer 4 load balancer, because it sees paths", "Round-robin DNS, because it sees paths", "A switch with VLANs"],
    "L4 balancers only see IPs and ports; paths, headers and cookies need a proxy that terminates and parses HTTP (L7). L4 is cheaper and faster when routing doesn't depend on content."),
  card("sd-anycast", 3, 2, "Why do large DNS and CDN providers use anycast?", "Many sites announce the same IP; BGP sends each client to a nearby one and failures reroute automatically",
    ["It encrypts traffic between the sites", "It gives each client a private address", "It removes the need for any routing protocol"],
    "Anycast moves load balancing into routing: the same prefix is originated from several locations and clients follow the shortest BGP path. Good for stateless or short UDP exchanges; long TCP flows can break if routes shift."),
  sortCard("sd-sort-tier", 2, "Place each component in the tier where it belongs in a typical web request path.",
    ["Edge", "Application tier", "Data tier"],
    [["CDN cache", 0], ["Anycast DNS", 0], ["Stateless web server", 1], ["API gateway", 1], ["Read replica", 2], ["Primary database", 2]],
    "Edge components sit near users and absorb reads and TLS; the application tier holds stateless logic that scales horizontally; state lives in the data tier."),
  sortCard("sd-sort-scale", 3, "Does each fix scale reads or writes?",
    ["Scales reads", "Scales writes"],
    [["Add read replicas", 0], ["Put a cache in front", 0], ["Shard by user ID", 1], ["Use a write-ahead queue to batch inserts", 1]],
    "Replicas and caches multiply read capacity but every write still hits one primary. Sharding splits the write load across primaries, and queued batching smooths and amortises it."),
  sortCard("sd-sort-stateful", 2, "Which components can be added behind a load balancer freely (stateless), and which need care (stateful)?",
    ["Stateless: add freely", "Stateful: needs partitioning or replication"],
    [["Web server holding no session", 0], ["Image resize worker", 0], ["Cache node", 1], ["Database primary", 1], ["WebSocket gateway", 1]],
    "Stateless servers are interchangeable. Anything holding data or connections (caches, databases, long-lived sockets) needs consistent hashing, replication or a registry to find the right node."),
  sortCard("sd-sort-protocol", 2, "Pick the transport that fits each workload best.",
    ["HTTP/2 or HTTP/3 over HTTPS", "WebSocket", "UDP-based (QUIC, RTP, DNS)"],
    [["Public REST API", 0], ["Static asset delivery", 0], ["Live chat presence", 1], ["Collaborative cursor updates", 1], ["Voice call media", 2], ["DNS lookup", 2]],
    "Request/response and cacheable content fit HTTP; bidirectional low-latency pushes fit a persistent WebSocket; real-time media and tiny lookups prefer UDP so a lost packet never stalls newer data."),
  {
    id: "sd-latency-ladder",
    kind: "order",
    topic: "interview",
    type: "APPLICATION",
    difficulty: 2,
    prompt: "Put these operations in order from fastest to slowest (typical latency numbers).",
    steps: ["L1 cache reference", "Main memory reference", "Read 4 KB randomly from an SSD", "Round trip within one datacenter", "Disk seek", "Round trip California to the Netherlands"],
    explain: "About 1 ns, 100 ns, 100 µs, 500 µs, 10 ms and 150 ms: each rung is roughly 10x or more slower. Network round trips dominate once you leave the machine, and the speed of light sets the floor for distance.",
  },
];
