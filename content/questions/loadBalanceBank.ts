/**
 * 5.1 load balancing and traffic management (FAANG SDE coverage): algorithms,
 * consistent hashing, health checks, draining, L4 DSR vs proxy, global load
 * balancing and sticky sessions. Answers are pinned in tests/loadbalance.test.ts
 * and tests/questions.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "interview", type: "APPLICATION", difficulty, prompt, choices, answer: slot, explain };
}

export const LOADBALANCE_BANK: readonly Question[] = [
  card("lb-roundrobin-weak", 1, 2, "When does plain round robin balance poorly?", "When requests differ a lot in cost or backends differ in capacity",
    ["When all backends are identical and requests are tiny", "When there is only one client", "When the backends are in the same rack"],
    "Round robin counts requests, not work. Long requests or a weaker backend pile up load unevenly, which is why weighted and least-connections variants exist."),
  card("lb-weighted", 1, 0, "Backends A and B have weights 3 and 1 in a weighted round-robin. Out of 8 requests, how many does A receive?", "6",
    ["3", "4", "8"],
    "Weights split traffic 3:1, so A gets 3/4 of 8 = 6 requests and B gets 2."),
  card("lb-leastconn-when", 2, 1, "Which workload benefits most from least-connections over round robin?", "Long-lived or highly variable connections, such as WebSockets or uploads",
    ["Identical, very short stateless requests", "A single static file served from cache", "Requests that must always hit the same backend"],
    "Least connections tracks live load, so a backend stuck with long connections is skipped. For uniform short requests it behaves almost like round robin."),
  card("lb-iphash", 2, 3, "What is the main benefit of hashing the client IP to choose a backend?", "The same client reaches the same backend without any shared session store",
    ["It spreads load perfectly evenly", "It hides the client's IP from the backend", "It removes the need for health checks"],
    "A deterministic hash gives stickiness for free. The drawbacks: clients behind one NAT hit the same backend, and changing the backend count remaps most clients."),
  card("lb-p2c", 3, 0, "In 'power of two choices', how is a backend picked?", "Sample two backends at random and send the request to the less loaded one",
    ["Always send to the less loaded of the two backends with the highest weight", "Hash the request twice and use the larger result", "Send each request to two backends and keep the first reply"],
    "Two random samples avoid the herd effect of everyone choosing the single least-loaded backend from stale data, yet cut the maximum load dramatically compared with purely random choice."),
  card("lb-modn", 3, 2, "Why is `hash(key) mod N` a poor way to shard a cache that may gain or lose servers?", "Changing N remaps most keys, so most of the cache goes cold at once",
    ["The hash function becomes slower as N grows", "It cannot spread keys evenly even with fixed N", "It requires every server to hold every key"],
    "Going from N to N+1 keeps only about 1/(N+1) of the keys on the same server. A consistent-hash ring moves only about 1/(N+1) of them."),
  card("lb-consistent", 2, 1, "In consistent hashing, which keys move when a new node joins the ring?", "Only the keys on the arcs the new node takes over, about 1/N of them",
    ["All keys, because the ring is rebuilt", "Only keys that were stored on the busiest node", "None: new nodes only receive new keys"],
    "Each key belongs to the next node clockwise from its hash. A new node claims only the keys between itself and its predecessor; every other key keeps its owner."),
  card("lb-vnodes", 3, 3, "Why do consistent-hash rings use many virtual nodes per server?", "To even out load and to spread a failed node's keys across many survivors",
    ["To make lookups faster than O(log n)", "To encrypt keys on the ring", "To avoid using a hash function"],
    "With one point per server, arcs are very uneven and a failure dumps all its keys on one neighbour. Dozens of points each smooth the distribution, and heterogeneous servers can get more points."),
  card("lb-healthcheck", 1, 0, "What do active health checks do?", "The balancer probes backends periodically and stops sending traffic to ones that fail",
    ["Backends push their CPU usage to the client", "The client retries until a backend answers", "DNS removes the backend after its TTL expires"],
    "Active checks (TCP connect, HTTP GET /healthz) detect a dead backend before users do. Passive checks watch real traffic for errors and timeouts instead."),
  card("lb-health-depth", 3, 2, "A /healthz endpoint always returns 200, even when the database is unreachable. What is the risk of making it check the database too?", "If the shared database fails, every backend is marked unhealthy and the whole service goes down",
    ["Health checks become too fast", "The balancer stops using round robin", "Backends can no longer serve static files"],
    "A deep check turns a dependency outage into a total outage and can trigger cascading failure. A common compromise: shallow liveness check for the balancer, deeper readiness check with care (and fail-open when all are unhealthy)."),
  card("lb-draining", 2, 1, "What is connection draining (deregistration delay)?", "The backend stops receiving new connections but existing ones are allowed to finish before it is removed",
    ["Closing every connection immediately to free memory", "Delaying new connections until the CPU is idle", "Copying connections to a standby balancer"],
    "Draining makes deploys and scale-in graceful: in-flight requests complete, then the instance is terminated after a timeout."),
  card("lb-l4-l7", 2, 3, "Which can an L7 (HTTP) load balancer do that an L4 balancer generally cannot?", "Route by URL path, host header or cookie",
    ["Balance TCP connections", "Forward packets without terminating TLS", "Operate on UDP traffic"],
    "L4 balancers see addresses and ports only. L7 balancers parse the HTTP request, so they can route /api and /static differently, rewrite headers and retry, at the cost of more CPU and terminating connections."),
  card("lb-dsr", 3, 0, "In direct server return (DSR), how do replies reach the client?", "The backend replies straight to the client, bypassing the load balancer",
    ["The reply is relayed back through the balancer on a second connection", "The reply goes through a CDN edge", "The backend sends the reply to the balancer's management port"],
    "In DSR the balancer rewrites only the destination MAC (the backend holds the VIP on a loopback). Responses, usually far bigger than requests, skip the balancer, which raises throughput. L7 or full-proxy modes sit in both directions."),
  card("lb-proxy-ip", 2, 2, "Behind an L7 proxy, the backend sees the proxy's IP as the source. How does it learn the client's real IP?", "From the X-Forwarded-For header (or PROXY protocol for TCP)",
    ["From the TCP source port", "From the Ethernet frame's source MAC", "It cannot; this is impossible"],
    "The proxy appends the client address to X-Forwarded-For, or sends a PROXY protocol header for non-HTTP traffic. The backend must trust only its own proxy, since clients can forge the header."),
  card("lb-sticky", 2, 1, "A shopping-cart service keeps sessions in each server's memory. What does the balancer need?", "Sticky sessions (affinity), or better, move the session to a shared store",
    ["Round robin with equal weights", "Smaller TCP windows", "A lower DNS TTL"],
    "Affinity (cookie or IP hash) keeps a user on one server, but loses the session if that server dies and skews load. Storing sessions in Redis or in a signed token makes servers stateless."),
  card("lb-gslb-dns", 2, 3, "How does DNS-based global load balancing steer users to a region?", "It answers with different IP addresses depending on resolver location, health and load",
    ["It rewrites the TCP sequence numbers", "It forwards packets between data centres at L2", "It sets the TTL of all packets to 1"],
    "GSLB/GeoDNS returns the nearest healthy region's address. The weakness is caching: resolvers and clients may keep an old answer until its TTL expires, and the resolver's location may not match the user's."),
  card("lb-anycast", 3, 0, "What is anycast?", "The same IP prefix is announced from many locations, and routing (BGP) delivers each client to the nearest one",
    ["One packet is copied to every host in a group", "One address is assigned to a single host that moves", "A client sends to the first server that answers a broadcast"],
    "Anycast fails over fast (withdraw the route) and needs no DNS trick, but a route change can move a client mid-connection, so it suits DNS, CDNs and DDoS absorption, or TCP services with care."),
  card("lb-lb-ha", 3, 2, "The load balancer itself is a single point of failure. What is a standard fix?", "Run a pair or cluster with a shared virtual IP (VRRP/keepalived) or front it with anycast/ECMP",
    ["Put a second balancer behind the first one", "Use a longer health-check interval", "Switch to UDP"],
    "Active-passive pairs share a VIP that moves on failure; at large scale routers spread flows over many balancers with ECMP. A balancer behind a balancer just moves the problem."),
  card("lb-retry-lb", 3, 1, "A balancer retries a failed request on another backend. Which requests are safe to retry blindly?", "Idempotent ones such as GET and PUT",
    ["POST that charges a credit card", "Any request, because retrying is free", "Only requests that returned 200"],
    "Retrying a non-idempotent request after a timeout can run it twice. Use idempotency keys for payments, and cap retries so they don't amplify an overload."),
  card("lb-leastconn-new", 3, 3, "A new backend joins a least-connections pool with 0 connections while the others hold 500 each. What can happen?", "It is flooded with all new connections until it catches up (a thundering herd on the new node)",
    ["Nothing: it receives the same traffic as the others", "It is ignored until all others have 0 connections", "The balancer marks it unhealthy"],
    "Fix with slow start: ramp its share (or weight) up over a period so a cold JIT, empty caches and connection pools are not hit at full rate."),
  card("lb-algos-match", 1, 0, "Which algorithm sends each request to the next backend in a fixed rotation?", "Round robin",
    ["Least connections", "IP hash", "Consistent hashing"],
    "Round robin cycles A, B, C, A, B, C and so on, ignoring load. The others choose by live connection counts or by a hash of the client or key."),
];
