/**
 * 5.2 rate limiting and resilience (FAANG SDE coverage): token and leaky buckets, window
 * counters, retries and backoff, timeouts, circuit breakers, idempotency, thundering herd
 * and backpressure. Answers are pinned in tests/ratelimit.test.ts and tests/questions.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "interview", type: "APPLICATION", difficulty, prompt, choices, answer: slot, explain };
}

export const RATELIMIT_BANK: readonly Question[] = [
  card("rl-why", 1, 1, "Why do APIs rate limit clients?", "To protect capacity and fairness: one noisy or abusive client must not starve the others",
    ["To make every response slower on purpose so that clients learn to ask less often", "To replace authentication, since a limit already tells the server who each caller is", "To reduce the size of response bodies so that they fit in a single TCP segment"],
    "Limits keep a shared service available, control cost and blunt scraping and brute force. The usual rejection is HTTP 429 Too Many Requests, often with a Retry-After header."),
  card("rl-429", 1, 3, "Which status code and header tell a client it was rate limited and when to come back?", "429 Too Many Requests with Retry-After",
    ["401 Unauthorized with WWW-Authenticate, asking the client to log in again", "503 Service Unavailable with Content-Length, telling the client the body size", "302 Found with Location, redirecting the client to a slower queue page"],
    "429 means the client sent too many requests. Retry-After (seconds or a date) says when to retry; a well-behaved client waits at least that long."),
  card("rl-token-burst", 2, 0, "What two parameters define a token bucket, and what does each control?", "Bucket size controls the allowed burst; refill rate controls the sustained average rate",
    ["Bucket size controls the sustained average rate; refill rate controls the largest burst", "Both parameters only control the average latency seen by each client", "Bucket size is the number of clients served; refill rate is the number of servers used"],
    "A full bucket of B tokens lets B requests through at once; after that the client is limited to the refill rate r. Long-run throughput can never exceed r."),
  card("rl-token-vs-leaky", 3, 2, "How does a leaky bucket (as a queue) differ from a token bucket?", "The leaky bucket smooths output to a constant rate; the token bucket permits bursts up to its size",
    ["The leaky bucket allows much bigger bursts than the token bucket, up to its depth", "The leaky bucket cannot limit an average rate, only a peak rate per packet", "They are the same algorithm, and only the textbook name for the counter differs"],
    "A leaky bucket queue emits at a fixed rate and drops overflow, shaping traffic. A token bucket lets a client that has been idle send a burst immediately."),
  card("rl-fixed-flaw", 2, 1, "What is the main flaw of a fixed-window counter?", "A burst straddling a window boundary can let through up to twice the limit",
    ["It uses far more memory than a sliding log, since it keeps every request", "It cannot be implemented in Redis because the counter needs to expire itself", "It blocks all requests for a short while at the start of each new window"],
    "With a limit of 100 per minute, a client can send 100 at 0:59 and 100 more at 1:00. Sliding windows and token buckets avoid that cliff."),
  card("rl-sliding-log", 3, 3, "What is the trade-off of a sliding window log?", "It is exact but stores a timestamp for every request, so memory grows with the limit",
    ["It is cheap in memory but can still allow about double the limit at an edge", "It needs no per-client state because the server can recompute the history", "It only works on a single server because timestamps cannot be shared"],
    "The log keeps each request's timestamp and counts those in the last W seconds: precise, but O(limit) memory per client. A sliding-window counter approximates it with two integers."),
  card("rl-sliding-counter", 3, 0, "How does a sliding-window counter estimate the rate?", "It weights the previous window's count by the fraction of it still inside the sliding window, and adds the current count",
    ["It averages the counts of the last 100 requests, whatever time they spanned", "It doubles the current window's count to leave room for the previous window", "It counts only the requests that arrived during the current second of the window"],
    "estimate = prev × (1 − elapsed/W) + current. It needs just two counters per client and is accurate to within a few percent for steady traffic."),
  card("rl-distributed", 3, 2, "Several app servers must enforce one shared limit per user. What is a common approach?", "Keep the counters in a fast shared store such as Redis, using atomic operations (INCR, a Lua script)",
    ["Give each server its own independent counter and simply ignore what the others see", "Store the counters in a cookie on the client so that every server can read it", "Ask the user to wait between clicks and trust the browser to follow the request"],
    "Independent counters let the real limit grow with the server count. A shared store with atomic updates avoids races; some systems trade accuracy for speed with local counters that sync periodically."),
  card("rl-key", 2, 1, "Which key is usually the best to rate limit by for a public API?", "The authenticated API key or user ID, with IP address as a fallback for anonymous traffic",
    ["Only the client's IP address, always, even when many users share one NAT", "The request's User-Agent string, because every client sets a unique value", "The time of day, so that all clients share one limit per hour"],
    "IP alone punishes many users behind one NAT and is easy to rotate; user or key limits are fairer. Layer limits: per user, per IP, per endpoint and global."),
  card("rl-failopen", 3, 3, "The rate limiter's Redis is unreachable. Should the API fail open or closed?", "Usually fail open (allow traffic) for ordinary APIs, so a limiter outage does not become a full outage; fail closed for abuse-sensitive endpoints such as login",
    ["Always fail closed and reject every request while the limiter is unreachable", "Always fail open for every endpoint, including password attempts and card checks", "Crash the server on purpose so that it restarts with a fresh connection to Redis"],
    "The limiter is protective infrastructure, not the product. Decide per endpoint: availability matters most for reads, while login and payment endpoints may prefer rejecting."),
  card("rl-retry-when", 1, 0, "Which failures are usually worth retrying?", "Transient ones: timeouts, connection resets, 503 and 429 (after waiting)",
    ["400 Bad Request and 404 Not Found, because a second try may change the result", "Every error at once, with no waiting, so the user sees the fastest success", "Only the 200 responses, so the client confirms that the call worked twice"],
    "A bad request will fail the same way each time. Transient errors may succeed on a later attempt, but only if the retry is delayed and bounded."),
  card("rl-backoff", 2, 2, "Why use exponential backoff instead of retrying at a fixed interval?", "Waits grow after each failure, giving an overloaded service room to recover",
    ["It makes every retry succeed because the server has had more time to recover", "It guarantees that the requests arrive at the server in their original order", "It lets clients ignore the server's response when it says to wait longer"],
    "Doubling the wait (up to a cap) quickly reduces the retry rate from a struggling client population. Fixed-interval retries keep hammering at a constant rate."),
  card("rl-jitter", 2, 1, "Why add jitter to backoff?", "Without it, clients that failed together retry together in synchronised waves",
    ["To make the wait longer on average so that the server sees fewer calls overall", "To avoid needing a maximum retry count, since random waits end the retries on their own", "To encrypt the retry so that an on-path observer cannot see the repeated request"],
    "Randomising each wait (for example uniform in [0, ceiling], 'full jitter') de-correlates clients and flattens the retry spikes that cause a thundering herd."),
  card("rl-herd", 3, 3, "A popular cache entry expires and thousands of requests hit the database at once. What is this called, and one fix?", "A cache stampede (thundering herd); let one request rebuild while others wait, or refresh early / add jitter to TTLs",
    ["A broadcast storm; raise the TTL to zero so the entry never expires again", "A SYN flood against the cache servers; use SYN cookies to stop it", "Head-of-line blocking in the HTTP connection; switch the clients to HTTP/3"],
    "Request coalescing (single flight), stale-while-revalidate and randomised TTLs stop the synchronised miss from overwhelming the origin."),
  card("rl-amplify", 3, 1, "Three services call each other in a chain and each retries failed calls 3 times. What is the risk?", "Retries multiply down the chain, so one user request can become dozens of calls to the bottom service",
    ["Latency drops because the retries at each tier run in parallel with each other", "Nothing to worry about: retries are always free for the service being called", "The chain can never fail, because each tier has a spare chance to try again"],
    "Per-layer retries multiply (3 × 3 × 3 = 27). Retry at one layer, enforce a retry budget (for example at most 10% extra requests) and propagate deadlines."),
  card("rl-timeout", 2, 0, "Why must every network call have a timeout?", "Without one, a hung dependency ties up threads and connections until the caller runs out of resources",
    ["Because HTTP forbids a client from waiting for a response longer than a minute", "To make successful calls faster, because the timeout sets the speed of the reply", "Because DNS requires every client call to include a timeout in the query"],
    "A call that waits forever turns one slow dependency into resource exhaustion everywhere upstream. Set timeouts from the latency budget and pass a deadline downstream."),
  card("rl-breaker-states", 2, 2, "What are the three states of a circuit breaker?", "Closed (normal), open (fail fast), half-open (let a probe through)",
    ["Up, down and degraded, the labels used by cloud health dashboards", "Connected, listening and closed, the usual states of a TCP socket", "Idle, active and blocked, the states a thread moves through in a scheduler"],
    "Closed passes calls and counts failures; open rejects immediately for a cooldown; half-open lets a few probes through and closes on success or reopens on failure."),
  card("rl-breaker-why", 2, 3, "What does a circuit breaker buy you when a dependency is failing?", "Fast failure that spares the dependency extra load and frees the caller's threads",
    ["It repairs the failing dependency automatically after the first few errors", "It makes the dependency's data consistent while the failure lasts", "It encrypts calls to the dependency so a failing node cannot leak data"],
    "Rejecting instantly avoids piling up slow, doomed requests. Pair it with a fallback (cached data, a default, or a degraded feature)."),
  card("rl-idempotency", 3, 1, "How do idempotency keys make retrying a payment safe?", "The server stores the result for each key and returns it for a repeated request instead of charging twice",
    ["The client sleeps for a fixed time between retries so the charge happens once", "The key encrypts the card number so the retry cannot be read on the way", "POST is made idempotent by HTTP itself, so a repeat is never charged twice"],
    "The client sends a unique key (such as a UUID) with the POST. If a timeout hides the first response, the retry carries the same key and the server replays the saved result."),
  card("rl-backpressure", 3, 0, "What is backpressure?", "A signal that makes producers slow down when consumers cannot keep up (bounded queues, blocking writes, TCP windows)",
    ["Encrypting data in transit more heavily whenever the system is under load", "Dropping the oldest log lines first so that the disk never fills up", "Adding more producers so that the consumers always find work waiting"],
    "Without it an unbounded queue just grows until memory runs out. TCP's receive window is a built-in example; at the application level use bounded queues, 429/503 responses and load shedding."),
  card("rl-shed", 3, 2, "Under overload, why is load shedding better than trying to serve everyone?", "Rejecting some requests early keeps latency good for the rest and avoids collapse where all requests time out",
    ["It lowers the electricity bill only; it has no effect on latency or errors", "It guarantees that every user is served eventually, however long the wait", "It hides errors from monitoring because shed requests never reach the metrics"],
    "A saturated server with a growing queue serves nobody within their timeout. Shed lowest-priority or excess work quickly (and cheaply) to keep goodput up."),
  card("rl-bulkhead", 3, 3, "What is the bulkhead pattern?", "Isolate resources (thread pools, connection pools) per dependency so one slow dependency cannot exhaust them all",
    ["Encrypt every service-to-service call with its own key pair per dependency", "Run all of the code in a single thread so nothing can block another task", "Retry each failed request on every server in turn until one answers"],
    "Like watertight compartments in a ship: a failure in one pool is contained, so the rest of the service stays responsive."),
];
