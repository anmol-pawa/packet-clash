/**
 * 5.4 real-time and API protocols (FAANG SDE coverage): polling vs long polling vs SSE vs
 * WebSockets vs WebRTC, gRPC, REST vs GraphQL, pub/sub, UDP for media, jitter buffers and RTP/RTCP.
 * Answers are pinned in tests/questions.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "interview", type: "APPLICATION", difficulty, prompt, choices, answer: slot, explain };
}

export const REALTIME_BANK: readonly Question[] = [
  card("rt-poll-vs-long", 1, 0, "What is the main difference between short polling and long polling?", "In long polling the server holds the request open until it has data or times out, instead of answering at once",
    ["Long polling uses UDP datagrams, so the server can answer later without holding a connection", "Short polling keeps a socket open for hours and the server writes into it whenever data appears", "Long polling needs no HTTP at all and runs over a raw TCP stream between browser and server"],
    "Short polling asks on a timer and mostly gets empty replies. Long polling parks the request so an event is delivered the moment it happens, then the client immediately asks again."),
  card("rt-sse", 2, 1, "When is Server-Sent Events (SSE) a better fit than WebSockets?", "One-way server-to-client streams (feeds, notifications) over plain HTTP, with automatic reconnect and Last-Event-ID",
    ["Two-way binary game traffic, where the client sends input many times per second over the same channel", "Peer-to-peer video between two browsers, where media must flow without passing through a server", "Sending large uploads from the client, since SSE streams request bodies in chunks to the server"],
    "SSE is a text/event-stream response that stays open. It works through ordinary HTTP infrastructure, reconnects automatically and resumes from the last event ID, but it is server-to-client only."),
  card("rt-ws-upgrade", 2, 2, "How does a WebSocket connection start?", "An HTTP/1.1 request with Upgrade: websocket; the server answers 101 Switching Protocols and the same TCP connection carries WebSocket frames",
    ["A UDP handshake on port 80, after which the browser and server exchange datagram frames directly", "A DNS TXT lookup for the socket address, followed by a plain TCP connection with no HTTP request", "A TLS-only connection with no HTTP at all, where the first record already carries WebSocket frames"],
    "The handshake is an HTTP GET with Upgrade, Connection and Sec-WebSocket-Key headers. After 101 the connection is full duplex with small framed messages, so it suits chat, games and live collaboration."),
  card("rt-ws-scale", 3, 3, "Why are WebSockets harder to scale than ordinary HTTP requests?", "Each client holds a long-lived connection, so servers are stateful: connection limits, sticky routing and fan-out across nodes (pub/sub) become design concerns",
    ["WebSocket frames are always larger than HTTP responses, so each node saturates its network link first", "Browsers allow only one WebSocket per machine, so a server can never see more than one client per host", "They cannot be sent through a load balancer at all, so every client must connect to a node directly"],
    "Memory and file descriptors scale with open connections, deploys must drain them, and a message for user B must reach whichever node holds B's socket, usually via Redis pub/sub or a message bus."),
  card("rt-webrtc", 3, 0, "What does WebRTC use to carry real-time audio and video between browsers?", "UDP-based SRTP media with ICE (STUN/TURN) for NAT traversal and DTLS to set up the keys",
    ["HTTP long polling to a central server, which relays each audio and video chunk to the other browser", "SMTP relays that queue short media clips and deliver them to the other participant's mailbox", "A fresh TCP connection for every video frame, with TLS renegotiated before each one is sent"],
    "ICE gathers candidate addresses, STUN discovers the public mapping, TURN relays when direct paths fail. Media is encrypted RTP over UDP so late packets can be dropped rather than delayed by retransmission."),
  card("rt-stun-turn", 3, 2, "What is the difference between STUN and TURN?", "STUN only tells a client its public IP:port so peers can connect directly; TURN relays the media when a direct path is impossible",
    ["STUN encrypts the media stream between the peers; TURN only compresses it before it is sent", "STUN is used for TCP connections only; TURN is used for UDP connections only, and each needs its own port", "They are the same server under two names, and either one can relay media or report the public address"],
    "Symmetric NATs and strict firewalls can defeat hole punching. TURN then forwards all traffic, which costs bandwidth, so ICE prefers direct and server-reflexive candidates and falls back to relay."),
  card("rt-which", 2, 1, "A stock ticker page needs updates pushed from server to browser, tens per second, no client messages. Which is the simplest good choice?", "Server-Sent Events (or a WebSocket)",
    ["Short polling once per minute, which would show data up to a minute old and waste most requests", "SMTP, which delivers each update as an email message to a mailbox the browser then fetches", "A brand-new TCP connection for every tick, repeating the handshake tens of times per second"],
    "One-directional push over a long-lived HTTP response is exactly what SSE offers. A WebSocket also works, but SSE is simpler and passes proxies more easily."),
  card("rt-udp-games", 2, 3, "Why do real-time games and video calls favour UDP over TCP for state or media updates?", "A late packet is worthless, so they avoid TCP's retransmission delay and head-of-line blocking and handle loss in the application",
    ["UDP is faster because it uses bigger packets, so each game update carries more state per datagram", "UDP guarantees delivery order, so game updates never need sequence numbers at the application level", "TCP cannot carry small packets, so every state update must be padded out to a full segment first"],
    "If frame 10 is lost, TCP holds frames 11-12 until it is resent. A game would rather skip to the newest position. Reliable data (chat, purchases) can still ride a separate reliable channel."),
  card("rt-jitter", 2, 0, "What is jitter in a voice call, and what absorbs it?", "Variation in packet transit time; a jitter buffer holds packets briefly to play them at an even pace",
    ["Packet corruption in transit; a stronger checksum on each datagram removes the problem entirely", "A fixed one-way delay on the path; a shorter or faster cable removes it for all later calls", "Echo of the speaker's own voice; a stateful firewall in front of the phone removes it from the audio"],
    "Packets from the same call can take different queueing delays. The receiver buffers a few tens of milliseconds and plays out on a schedule. A bigger buffer hides more jitter but adds latency."),
  card("rt-rtp-fields", 3, 2, "Which RTP header fields let a receiver reorder packets, play them at the right time and detect loss?", "Sequence number (order and loss) and timestamp (playout timing)",
    ["Source port and checksum, which identify the sender and detect bit errors in each datagram", "TTL and protocol number, which bound how long a packet lives and say which transport it carries", "Window size and urgent pointer, which control the flow of data and mark out-of-band bytes"],
    "The sequence number increments per packet, so gaps mean loss; the timestamp reflects the sampling instant, so jitter can be measured and audio and video synchronised."),
  card("rt-rtcp", 3, 1, "What does RTCP do alongside RTP?", "Carries periodic sender and receiver reports (loss, jitter, round-trip time) so the sender can adapt its bitrate",
    ["Encrypts the media stream between the two endpoints and negotiates the SRTP keys for it", "Assigns IP addresses to the endpoints and tells them which port the RTP stream will use", "Replaces the RTP sequence numbers so that receivers no longer need to reorder the packets"],
    "RTCP uses a small share of the session bandwidth (about 5%). Receiver reports include fraction lost, cumulative loss and the RFC 3550 interarrival jitter estimate."),
  card("rt-grpc", 2, 3, "What does gRPC build on?", "HTTP/2 for transport and Protocol Buffers for compact, schema-defined messages",
    ["HTTP/1.1 with JSON bodies, opening one connection per call and describing messages with an OpenAPI file", "UDP datagrams with XML payloads, relying on the application to resend any lost call itself", "WebSockets with YAML messages, where each call is a text frame parsed by the receiving server"],
    "HTTP/2 gives multiplexed streams and header compression, protobuf gives a binary typed contract with generated clients. The result is faster and stricter than JSON over HTTP/1.1."),
  card("rt-grpc-streams", 3, 0, "Which four call shapes does gRPC support?", "Unary, server streaming, client streaming and bidirectional streaming",
    ["GET, POST, PUT and DELETE, which are the four HTTP methods a gRPC service maps onto its calls", "Query, mutation, subscription and fragment, which are the building blocks of a GraphQL document", "Request, reply, ack and nack, which are the four message types of the gRPC wire protocol"],
    "All four use one HTTP/2 stream per call. Streaming suits log tails, uploads and chat. Browsers need grpc-web or a proxy because they cannot control HTTP/2 framing directly."),
  card("rt-grpc-lb", 3, 2, "Why does a plain L4 load balancer balance gRPC badly?", "One long-lived HTTP/2 connection carries many calls, so all calls from a client stick to one backend; balance per request at L7 or on the client",
    ["gRPC uses UDP, which a layer-4 load balancer cannot forward to any backend server at all", "gRPC messages are too large for TCP segments, so the balancer cannot reassemble them from packets", "Layer-4 balancers drop HTTP/2 headers, so a gRPC call never reaches the backend application"],
    "L4 spreads connections, not requests. A client multiplexing everything over one connection pins to one server. Use an L7 proxy such as Envoy, or client-side load balancing with name resolution."),
  card("rt-rest-graphql", 2, 1, "What problem does GraphQL address compared with a typical REST API?", "Over-fetching and under-fetching: the client asks for exactly the fields it needs in one request",
    ["It removes the need for a server, because the client queries the database directly over HTTP", "It encrypts all fields end to end, so intermediaries can never read the data being requested", "It guarantees caching by URL, because every query gets its own address and cache headers"],
    "REST often needs several round trips or returns fields the client ignores. GraphQL has one endpoint and a typed schema, at the cost of harder HTTP caching, N+1 resolver pitfalls and query-cost control."),
  card("rt-graphql-cache", 3, 3, "Why is HTTP caching harder with GraphQL than with REST?", "Queries usually go to one POST endpoint, so URL-keyed caches and CDNs cannot tell them apart",
    ["GraphQL responses are always encrypted at the field level, so a shared cache cannot store them", "GraphQL forbids cache headers in its specification, so servers cannot mark a response cacheable", "GraphQL runs only over UDP, and CDNs cannot cache connectionless traffic between nodes"],
    "REST resources have stable URLs and GET semantics. With GraphQL you cache at the client by entity ID, use persisted queries with GET, or cache at the resolver or field level."),
  card("rt-pubsub", 2, 0, "In publish/subscribe messaging, how are producers and consumers related?", "They are decoupled: producers publish to a topic and the broker delivers to every subscriber, without the producer knowing them",
    ["Each producer must open a connection to each consumer and send every message to them directly", "Consumers poll the producer's disk directly and read the files it writes, one file per topic", "Only one consumer may ever read a topic, and a second subscriber is rejected by the broker"],
    "A broker (Kafka, NATS, Redis, SNS) sits in between over long-lived TCP connections. That decouples timing and scale, but adds the broker as a component to run and a delivery guarantee to choose."),
  card("rt-queue-vs-pubsub", 3, 2, "How does a work queue differ from pub/sub fan-out?", "In a queue each message goes to one worker in the group; in fan-out each subscriber gets its own copy",
    ["A queue duplicates every message to all workers; fan-out hands each message to only one subscriber", "Queues use UDP between the broker and workers; fan-out uses TCP between the broker and subscribers", "They are identical, since the only difference between them is the name the broker gives the topic"],
    "Consumer groups (Kafka) or competing consumers (RabbitMQ, SQS) share the work of a topic. Separate groups or fan-out exchanges each receive every message."),
  card("rt-delivery", 3, 1, "A consumer crashes after processing a message but before acknowledging it. With at-least-once delivery, what happens?", "The broker redelivers the message, so consumers must be idempotent",
    ["The message is lost forever, since the broker deleted it as soon as it was handed to the consumer", "The message is delivered exactly once anyway, because the broker detects the crash and skips it", "The producer is blocked permanently until the crashed consumer restarts and acknowledges it"],
    "At-least-once never loses a message but may repeat it. Exactly-once effects come from idempotent handlers or deduplication keys, not from the network."),
  card("rt-polling-cost", 2, 3, "10,000 mobile clients poll every 5 seconds and the data changes rarely. What is the main cost?", "About 2,000 requests per second, nearly all empty, plus radio wake-ups on every phone",
    ["The server runs out of IPv4 addresses, because each poll opens a new connection from a new address", "The DNS TTL expires every five seconds, so every poll forces a fresh lookup of the server name", "TCP stops working after 100 requests on one connection, so each phone must reconnect constantly"],
    "Load is clients / interval = 2,000 req/s. Event latency averages half the interval (2.5 s), so shortening the interval raises load. Push (SSE, WebSocket, push notifications) fixes both."),
  card("rt-heartbeat", 2, 0, "Why do WebSocket and SSE connections send periodic pings or comment lines?", "To keep NAT, proxy and load balancer idle timeouts from closing the connection, and to notice dead peers",
    ["To refresh the TLS certificate before it expires, since certificates are renewed over the open stream", "To change the port number from time to time, which makes the connection harder to block or track", "Because browsers require at least one packet per second on every open connection or they close it"],
    "Intermediaries drop idle connections after tens of seconds to minutes. A small ping resets those timers, and a missing pong tells the app to reconnect with backoff and resume from the last event."),
  card("rt-adaptive", 3, 2, "Streaming video (HLS or DASH) usually uses HTTP over TCP, while a video call uses RTP over UDP. Why the difference?", "Streaming tolerates seconds of buffering and benefits from CDNs and caching; a call needs low latency and cannot wait for retransmissions",
    ["HTTP cannot carry video at all, because its responses are limited to text and small binary files", "UDP is cheaper per byte than TCP, so calls use it to save money on the carrier's data charges", "Calls need guaranteed in-order delivery, which only RTP over UDP provides and HTTP over TCP does not"],
    "On-demand video downloads small segments ahead of playback and adapts quality to throughput. Interactive media has a latency budget of about 150-200 ms, so late data is dropped and loss is concealed."),
];
