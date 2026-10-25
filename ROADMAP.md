# Packet Clash roadmap

The hourly routine works top to bottom: take the first unchecked box. Split big items into sub-boxes when you start them.

## 0. Bootstrap (reuse Query Clash's engine)

- [x] 0.1 Scaffold Next.js 16 + TypeScript + Tailwind 4 + Vitest + ESLint, copying configs from Query Clash. Static export with `BASE_PATH=/packet-clash`, the PWA manifest and icons (an original "PC" pixel icon), the offline service worker (with the worker-fragment fix), and `ci.yml` + `pages.yml`. Ship a placeholder title screen that deploys and installs.
- [x] 0.2 Port the Pixi battle engine (stage, tweens, particles, camera, audio synth, battle reducer, UI kit, save) and get a demo battle running.
- [x] 0.3 Sprite system and first art (see the Art quality bar in CLAUDE.md): a starter creature and one boss with full idle/attack/hurt/faint animations, plus one illustrated battle background.
  - [x] 0.3a Shaded-primitive pixel painter (`lib/paint.ts`), the starter **Pingkit** (64×64 front + back, idle/attack/hurt/faint frames), named animations on the stage actor, and the `/dev/sprites` viewer.
  - [x] 0.3b A 96×96 boss creature (front + back, full animations) replacing the Glitchling stand-in as the demo foe.
  - [x] 0.3c An illustrated battle background (sky, terrain, props) drawn as pixel art, replacing the vector-ish demo field.
  - [x] 0.3d Evolve animation on the stage (white silhouette morph between two forms) and a second Pingkit form to evolve into.
- [x] 0.4 GBA-style battle screen: foe front sprite on a platform top-right, player creature back sprite bottom-left, HP/XP boxes, typed-out message box, and a move menu of 4 answer options (tap-friendly).

## 1. Game structure

- [x] 1.1 Overworld map shaped like a network (towns = subnets, routes = links) with 9 gyms, one per chapter below, and an original boss creature per gym (e.g. a cable-serpent for the physical layer, a collision beetle for MAC, a router owl, a handshake twin-creature for TCP, a DNS oracle…). Badges are earned per gym.
  - [x] 1.1a World data (9 towns as /24 subnets joined by /30 point-to-point routes, one gym per chapter, badges, unlock order) with an IPv4/CIDR helper under test, and a painted pixel overworld map page (`/map`) with tappable towns, a badge case and a town info window.
  - [x] 1.1b Walk the map: an animated player sprite that travels along routes between unlocked towns, water shimmer and blinking router lights on the map.
  - [x] 1.1c Gym flow: enter a gym from its town, fight its boss, earn and save the badge, unlock the next town (with a badge-get screen).
  - [x] 1.1d Stackadon, the gym 1 boss (96×96, front/back, full animations), wired to Layer Landing so a fresh save can earn the first badge.
  - [x] 1.1e Cidrab, the gym 3 boss (Octet Harbor): a subnet crab whose shell lamps show the mask's last octet.
  - [x] 1.1f Hootpath, the gym 4 boss (Hopwood): a router owl whose chest network lights node by node in Dijkstra's settle order.
  - [x] 1.1g Synackle, the gym 5 boss (Synport): twin otters sharing one tail whose idle loop runs TCP's three-way handshake, with RFC 793 state lamps.
  - [x] 1.1h Oraclynx, the gym 6 boss (Resolvia): a seer lynx whose floating rune stones light root → TLD → authoritative in an iterative DNS lookup, with the answer landing in its orb.
  - [x] 1.1i Keyvern, the gym 7 boss (Cipher Keep): a padlocked wyvern whose wing-wrist gems trade key shares through a TLS 1.3 handshake until its shackle snaps shut.
  - [x] 1.1j Fetchimera, the gym 8 boss (Waypoint): a hound/ram/serpent chimera whose harness lamps light DNS → TCP → TLS → HTTP before its hound head fetches the page.
  - [x] 1.1k Gigaroc, the gym 9 boss (Backbone Summit): a crimson storm roc on the summit crag whose wing fibre carries a light pulse from shoulder to wingtip (propagation delay), and fills the whole link on the attack (bandwidth-delay product).
- [x] 1.2 Move types (Physical, Link, Network, Transport, Application, Security…) with a type chart and super-effective messages. Tests for the chart.
  - [x] 1.2a Type engine: six types, a chart built on "each layer serves the one above it" plus a security triangle (with a reason per matchup), creature types, typed moves in the battle reducer (question type → player move, foe's first type → its hit), "It's super effective!" messages with the reason, and type chips in the HP boxes and move menu.
  - [x] 1.2b Pixel type icons (one small drawn emblem per type, used in the chips) and a type chart screen reachable from the map and the battle, showing the grid and each matchup's reason.
- [x] 1.3 Starter creature choice, XP and levels, evolution at gym milestones, and a capture box ("Packetdex").
  - [x] 1.3a Saved partner creature: species, level and total XP in the save, gym battles fought with it, boss EXP and level-ups kept after a win, evolution when a milestone gym's badge is won (Pingkit → Tracevix at badge 3), and a partner card on the world map.
  - [x] 1.3b A second starter line, base form: an original 64×64 creature (front/back, idle/attack/hurt/faint) of another layer's type. (Framadillo, Link: an armadillo whose shell bands are an Ethernet II frame.)
  - [x] 1.3c A third starter line, base form, of a third type (so the three starters form a type triangle).
  - [x] 1.3d Starter choice screen for a new save (three starters on pedestals, type chips and blurbs), stored as the partner.
  - [x] 1.3e Evolved forms for the two new starters, with their gym milestones.
    - [x] 1.3e1 Trunkadillo, Framadillo's evolved form at badge 3 (Link): its shell gains the 802.1Q VLAN tag band.
    - [x] 1.3e2 Oakwind, Ackorn's evolved form at badge 3 (Transport): its tail shows TCP slow start and multiplicative decrease.
  - [x] 1.3f The Packetdex: seen/caught records from battles and a dex page with each creature's sprite, types and blurb (unseen ones as silhouettes).
- [x] 1.4 A question engine with MCQ / multi-select / numeric / order-the-steps / generated problems, explanations after every answer, and a Leitner spaced-repetition box.
  - [x] 1.4a Question model and pure grader (MCQ, multi-select, numeric with unit and tolerance, order-the-steps), seeded generators answered by `lib/net` solvers (delays, bandwidth-delay product, subnet sizes, network/broadcast addresses), decks, and a starter bank of each kind.
  - [x] 1.4b Leitner box: a pure 5-box engine (promote on right, back to box 1 on wrong, due by session), saved per question id, and a deck picker that prefers due questions.
  - [x] 1.4c Battle UI for every kind (multi-select toggles, a numeric keypad, tap-to-move order steps) and an explanation box after every answer, with gym battles drawing their questions from the bank and generators.
- [x] 1.5 **Packet animations**: attacks are packets travelling between creatures, with headers that visibly encapsulate and decapsulate layer by layer.

## 2. Curriculum (each gym: concept lessons → generated battles → boss)

- [x] 2.1 Models and basics: OSI vs TCP/IP layers (drag a protocol to its layer), encapsulation, PDU names, circuit vs packet switching, **delay calculations** (transmission, propagation, queuing; bandwidth-delay product).
  - [x] 2.1a Gym 1's question set: hand-written cards for OSI vs TCP/IP, encapsulation and decapsulation, PDU names, devices per layer, circuit vs packet switching, delay types and traffic intensity, plus seeded generators answered by `lib/net` solvers (one-hop delay, La/R, store-and-forward over N links, TDM circuit file time, circuit capacity, bottleneck throughput, protocol → layer), checked against Kurose & Ross §1.3–1.4.
  - [x] 2.1a2 Numeral readability: in Pixelify Sans (the body font), 5 reads as 8 ("1.536 Mbps" looks like "1.836", "250 ms" like "280"). Now that gym 1 asks numeric problems, fix it: clear, unambiguous digits in prompts, explanations and the keypad display (e.g. numbers set in a clearer pixel face), checked in screenshots on iPhone 14.
  - [x] 2.1b "Sort into layers": a new question kind where the player taps each protocol, then the layer it belongs to (tap-to-place, no drag needed on iPhone), graded per item, with generated sets from `PROTOCOL_LAYERS`.
  - [x] 2.1c Gym 1 concept lessons: short illustrated lesson cards (the layer stack, encapsulation, packet vs circuit switching, the four delays) shown before the gym battle and reachable from the town.
- [x] 2.2 Physical and data link: encoding, framing, **error detection** (parity, checksum, CRC with generated division problems, Hamming code), MAC/CSMA-CD/CSMA-CA, Ethernet, switches and MAC learning, VLANs, ARP.
  - [x] 2.2a Error detection: `lib/net/errors` solvers (parity, Hamming distance, the Internet checksum, CRC by mod-2 long division with its XOR steps, Hamming SEC encode/syndrome) checked against Kurose & Ross, Forouzan, Tanenbaum and RFC 1071, with seeded generators and hand-written cards for gym 2.
  - [x] 2.2b Link layer: line encoding (NRZ, Manchester), framing (byte/bit stuffing generators), MAC protocols (CSMA/CD with binary exponential backoff and the minimum frame size calculation, CSMA/CA and RTS/CTS, slotted vs pure ALOHA efficiency), the Ethernet frame, and ARP.
  - [x] 2.2c Switches: a MAC-learning simulator question (given a frame sequence, fill the switch table and say which ports flood vs forward), VLANs and trunking, and loops/STP at interview depth.
  - [x] 2.2d Gym 2 concept lessons: illustrated cards (CRC long division, Hamming check positions, CSMA/CD, MAC learning) shown before the gym battle.
- [x] 2.3 Network layer and addressing: IPv4 header, **subnetting and CIDR drills** (network/broadcast/host range/subnet count, VLSM), private ranges, NAT/PAT, fragmentation (offset calculations), ICMP, IPv6 basics.
  - [x] 2.3a Addressing solvers and generators: `lib/net/addressing` (split, VLSM, aggregation, longest-prefix match, fragmentation) with seeded gym 3 generators, checked against Kurose & Ross / Forouzan examples.
  - [x] 2.3b Gym 3 hand-written cards: IPv4 header fields, private ranges and special addresses, NAT/PAT, ICMP (ping/traceroute/TTL), DHCP-less basics, IPv6 basics (128-bit, :: shorthand, no fragmentation by routers), plus an IPv6 address-compression generator.
  - [x] 2.3c Gym 3 concept lessons: illustrated cards (subnetting by borrowing bits, VLSM, longest-prefix match, fragmentation).
- [x] 2.4 Routing: **Dijkstra / link-state** and **Bellman-Ford / distance-vector** with generated graphs where the player fills routing tables (solver-checked), count-to-infinity, RIP/OSPF/BGP at interview depth.
  - [x] 2.4a Routing solvers and generators: `lib/net/routing` (Dijkstra with settle order and next hops, Bellman-Ford rounds, synchronous distance vector with link changes, count-to-infinity and poisoned reverse) with six seeded gym 4 generators, checked against Kurose & Ross §5.2.
  - [x] 2.4b Gym 4 hand-written cards: link state vs distance vector, RIP (hop count, 16 = infinity, 30 s updates), OSPF (areas, DR, Dijkstra, cost from bandwidth), BGP (AS, eBGP vs iBGP, path vector, policy), autonomous systems, static vs dynamic routing, default routes.
  - [x] 2.4c Gym 4 concept lessons: illustrated cards (Dijkstra table steps, Bellman-Ford rounds, count-to-infinity, AS-level BGP paths).
- [x] 2.5 Transport: UDP vs TCP, ports and sockets, the **3-way handshake and teardown** (animated state machine), sequence/ack number problems, flow control (sliding window, Go-Back-N, Selective Repeat simulations), **congestion control** (slow start, AIMD, fast retransmit/recovery: plot cwnd over RTTs).
  - [x] 2.5a Transport solvers and generators: `lib/net/transport` (sequence/ack numbers, handshake, TCP state machine, Go-Back-N vs Selective Repeat, window utilisation, flow control, per-RTT slow start/AIMD/Reno/Tahoe) with seven seeded gym 5 generators, checked against Kurose & Ross §3.4–3.7.
  - [x] 2.5b Gym 5 hand-written cards: UDP vs TCP, ports and sockets, handshake and teardown (TIME_WAIT, SYN flood), flow vs congestion control, fast retransmit, Nagle/delayed ACK, head-of-line blocking.
  - [x] 2.5c Gym 5 concept lessons: illustrated cards (handshake and teardown with TCP states, sliding window GBN/SR, cwnd sawtooth).
  - [x] 2.5d The animated TCP state machine: step through handshake and teardown, both sides' states highlighted, on its own page linked from the gym 5 lessons.
- [x] 2.6 Application layer: DNS resolution (iterative vs recursive, order the steps, record types), HTTP/1.1 vs 2 vs 3, status codes, cookies, caching headers, REST, email (SMTP/IMAP), DHCP (DORA), FTP/SSH basics.
  - [x] 2.6a Application solvers and generators: `lib/net/application` (DNS cost iterative vs recursive with caches, HTTP page-load RTTs, web-cache delay and access-link utilisation, DHCP T1/T2) with five seeded gym 6 generators.
  - [x] 2.6b Gym 6 hand-written cards: DNS records and resolution order, HTTP versions, status codes, cookies, caching headers, REST, SMTP/IMAP/POP3, DHCP DORA, FTP/SSH.
  - [x] 2.6c Gym 6 concept lessons: illustrated cards (DNS resolution, HTTP/1.1 vs 2 vs 3 timelines, DORA).
- [x] 2.7 Security: TLS 1.3 handshake ordering, symmetric vs asymmetric crypto, certificates and PKI, hashing and MACs, firewalls, VPNs, common attacks (MITM, DDoS, spoofing, XSS/CSRF at interview level).
  - [x] 2.7a Security solvers and generators: `lib/net/security` (modPow, Diffie-Hellman, toy RSA, key counts, brute-force time, password entropy, TLS 1.3 order) with five seeded gym 7 generators and a new `security` topic.
  - [x] 2.7b Gym 7 hand-written cards: TLS 1.3 handshake order, symmetric vs asymmetric, certificates/PKI, hashing and MACs, firewalls, VPNs, attacks (MITM, DDoS, spoofing, XSS/CSRF).
  - [x] 2.7c Gym 7 concept lessons: illustrated cards (TLS 1.3 handshake, certificate chain, Diffie-Hellman).
- [x] 2.8 "What happens when you type a URL": a full end-to-end animated journey (DNS, ARP, TCP, TLS, HTTP, rendering) as an order-the-steps boss battle.
  - [x] 2.8a URL journey solver and generators: `lib/net/journey` (ordered steps, RTT cost of DNS + connection setup + request) with gym 8 generators and a `journey` topic.
  - [x] 2.8b Gym 8 hand-written cards: URL parts, full journey order, DNS before TCP, on-link/off-link and gateway MAC, DNS transport, NAT, CDN, HTTP cache, HSTS, repeat visits, render blocking.
  - [x] 2.8c Gym 8 concept lessons: illustrated cards (the whole journey as a timeline, RTT budget bars for cold vs warm, TLS 1.2 vs 1.3 vs QUIC).
  - [x] 2.8d Animated journey page (`/url`): step through the nine stages with packets travelling laptop → router → resolver → server, linked from the gym 8 lessons.
- [x] 2.9 Interview gauntlet: the top networking interview questions (TCP vs UDP, how DNS works, HTTP vs HTTPS, subnetting on the spot, load balancers L4 vs L7, CDN, WebSockets, NAT traversal) as a timed mock interview with a scorecard.
  - [x] 2.9a Gym 9 interview bank: 14 hand-written gauntlet cards (TCP vs UDP, L4 vs L7 load balancers, sticky sessions, CDN, WebSockets, STUN/TURN/ICE, subnetting on the spot, troubleshooting order, anycast, proxies, 502 vs 504) under a new `interview` topic that gym 9 asks.
  - [x] 2.9b Timed mock interview page (`/interview`): 8 seeded questions against a per-question clock, explanations, a difficulty-weighted scorecard with a verdict and the questions to revisit; linked from the map.

## 3. Polish

- [x] 3.1 Daily challenge (date-seeded) and streaks: `/daily`, five questions per local day, streak and best saved, linked from the map.
- [x] 3.2 Accessibility and performance pass on iPhone: focus ring, 44px touch targets, global reduced-motion, one h1 per page.

## 4. CCNA (200-301) coverage gaps

Audit (2026-10-25): sections 1-3 cover OSI/TCP-IP, link layer, IPv4/VLSM/IPv6 basics, routing theory, transport, DNS/HTTP/DHCP, security and a URL journey, which is strong on theory. Missing for CCNA: Cisco-style config and show-command reading, wildcard masks/ACLs, OSPF specifics, EtherChannel, FHRP, wireless, device management, QoS, automation. Each item is a new gym-style chapter of cards plus seeded generators solved by code under test (checked against Odom's CCNA Official Cert Guide and Cisco docs); add a `ccna` boss/town on the map if the 9-gym layout needs extending.

- [ ] 4.1 Network fundamentals II: device roles (router/L2 vs L3 switch/AP/WLC/firewall/IPS), cabling (UTP categories, straight vs crossover, fibre SM/MM, PoE standards), interface errors (duplex mismatch, CRC, runts, giants), TCP/UDP troubleshooting with ping/traceroute output.
- [ ] 4.2 Wildcard masks and ACLs: `lib/net/acl` (wildcard from mask, matching, standard vs extended, first-match with implicit deny, placement rules), generators that decide permit/deny for a packet against an ACL.
- [ ] 4.3 IP routing on Cisco: administrative distance table, route selection (longest prefix, then AD, then metric), reading `show ip route` codes, static/floating/default routes, OSPF (neighbour states, DR/BDR election by priority/router-ID, cost from reference bandwidth, areas, passive interface), EIGRP metric basics.
- [ ] 4.4 Switching II: STP (root bridge election by bridge ID, port roles and states, root path cost, PortFast/BPDU guard, RSTP), EtherChannel (LACP/PAgP modes, what forms a bundle), port security (violation modes, sticky MACs), DHCP snooping and DAI, inter-VLAN routing (router-on-a-stick, SVI), native VLAN/DTP, CDP/LLDP. Generators: STP root and port-role elections on a small topology.
- [ ] 4.5 IPv6 in depth: address types (GUA/ULA/link-local/multicast), EUI-64 generation, SLAAC vs stateful/stateless DHCPv6, NDP (NS/NA/RS/RA, DAD), IPv6 static and OSPFv3 basics, dual stack and tunnelling. Generators: EUI-64 and subnet-ID problems.
- [ ] 4.6 IP services: NAT types (static/dynamic/PAT) with inside local/global terminology and table-building generators, NTP, DHCP relay (`ip helper-address`), DNS client config, SNMP (v2c vs v3, traps, MIB/OID), syslog severity levels 0-7, QoS (classification, marking DSCP/CoS, queuing, policing vs shaping, PHB EF/AF), FHRP (HSRP/VRRP/GLBP roles, virtual IP/MAC, preemption).
- [ ] 4.7 Wireless and security fundamentals: 802.11 a/b/g/n/ac/ax, channels (2.4 GHz 1/6/11), SSID/BSSID, autonomous vs lightweight AP with WLC (CAPWAP), WPA2/WPA3 and 802.1X/EAP, AAA (RADIUS vs TACACS+), threat types, VPN site-to-site vs remote access (IPsec modes, IKE phases), device hardening (SSH vs Telnet, enable secret, `service password-encryption`).
- [ ] 4.8 Automation and programmability: SDN (control/data/management planes, northbound/southbound APIs, controller-based vs traditional), REST verbs and JSON/XML/YAML reading, Ansible/Puppet/Chef/Terraform at concept level, NETCONF/RESTCONF, Cisco DNA Center. Cards that read a JSON snippet or config diff.
- [ ] 4.9 CCNA lab-style questions: a reading-a-config page (`/lab`) showing a small IOS config and `show` output with tap-to-answer questions (what is the root bridge, why is ping failing, what does this ACL block, next hop for X), 12+ seeded scenarios, each answer solved or checked by code.
- [ ] 4.10 CCNA mock exam: `/ccna` 40-question timed exam drawn across the exam blueprint domains (fundamentals 20%, access 20%, IP connectivity 25%, IP services 10%, security 15%, automation 10%) with a domain-weighted scorecard.

## 5. FAANG SDE interview coverage gaps

Audit: gym 9 and `/interview` cover the classic questions (TCP vs UDP, L4 vs L7, CDN, WebSockets, STUN/TURN, proxies, 502 vs 504). Missing the system-design-flavoured networking that SDE loops ask: algorithms behind load balancers, rate limiting, consistent hashing, modern transport (QUIC, BBR), datacenter design, real-time protocols, and debugging with captures.

- [ ] 5.1 Load balancing and traffic management: algorithms (round robin, weighted, least connections, IP hash, power of two choices), consistent hashing with virtual nodes (simulator: keys moved when a node is added or removed), health checks, connection draining, L4 DSR vs proxy, global load balancing (DNS GSLB, anycast, GeoDNS), sticky sessions. Generators solved by code.
- [ ] 5.2 Rate limiting and resilience: token bucket, leaky bucket, fixed vs sliding window (simulators that decide allow/deny for a request trace), retries with exponential backoff and jitter, timeouts, circuit breakers, idempotency, thundering herd, backpressure.
- [ ] 5.3 Modern transport and performance: TCP in depth (CUBIC vs BBR, SACK, window scaling, initial cwnd, TIME_WAIT exhaustion, Nagle/delayed-ACK interaction, keepalive, SO_REUSEADDR/REUSEPORT), bufferbloat, QUIC (streams, connection migration, 0-RTT, HoL blocking), HTTP/2 multiplexing and server push removal, HTTP/3, TLS session resumption and OCSP stapling, BDP and throughput generators (Mathis equation).
- [ ] 5.4 Real-time and API protocols: polling vs long polling vs SSE vs WebSockets vs WebRTC (when to pick which), gRPC (HTTP/2, protobuf, streaming kinds), REST vs GraphQL, pub/sub and message queues over TCP, UDP use in games/video, jitter buffers, RTP/RTCP basics, chat/video-call design networking sketch.
- [ ] 5.5 Datacenter and cloud networking: leaf-spine/Clos topology, ECMP and flow hashing, oversubscription ratio generators, overlay networks (VXLAN), VPC concepts (subnets, route tables, NAT gateway, security groups vs NACLs, peering, transit gateway), Kubernetes networking (pod IPs, Services, kube-proxy, Ingress, CNI), service mesh and mTLS, service discovery.
- [ ] 5.6 Sockets and OS networking: the socket API call order (server and client), blocking vs non-blocking, select/poll/epoll and the C10K problem, accept queue and SYN backlog, zero-copy, file descriptors limits, epoll edge vs level triggered, thread-per-connection vs event loop; cards plus an order-the-calls sorter.
- [ ] 5.7 Web security for SDE: cookies (SameSite, HttpOnly, Secure), CORS and preflight, CSRF vs XSS defences, CSP, OAuth 2.0/OIDC flows, JWT pitfalls, TLS certificate validation, mTLS, DDoS mitigation (SYN cookies, rate limits, scrubbing), DNS attacks (cache poisoning, DNSSEC), HSTS preload.
- [ ] 5.8 Debugging with captures and tools: reading a packet capture (a pretty-printed tcpdump/Wireshark trace page where the player spots retransmissions, RST, zero window, handshake failures), `dig`, `curl -v`, `ss`/`netstat`, `traceroute`/`mtr` output, MTU/PMTUD black holes, "why is this request slow" latency-budget scenarios.
- [ ] 5.9 System-design networking drills: back-of-envelope generators (bandwidth, QPS, connections per server, latency numbers every programmer should know, CDN hit-rate savings, egress cost), plus 10 scenario cards ("design a URL shortener's edge", "video streaming delivery", "global chat", "API gateway") with correct-component sorting.
- [ ] 5.10 FAANG mock loop: `/loop` three-round mock (rapid-fire concepts, a debugging scenario, a design-flavoured round) with a hire/no-hire scorecard, drawing from gyms 1-9 and the new chapters; update `/interview` to include the new banks.

## 6. Game integration for the new chapters

- [ ] 6.1 Extend the world: two new regions after the Backbone Summit (a CCNA "Cisco Cove" arc with 4 gyms and a FAANG "Scale Citadel" arc with 3 gyms), town data, badges, unlock order, and an original boss creature per gym following the Art quality bar (96x96, front/back, full animations), done one boss per run.
- [ ] 6.2 Lesson cards and figures for the new chapters (ACL matching, STP election, EtherChannel, consistent-hash ring, token bucket, Clos fabric), one per run, each on `/dev/sprites` and reviewed in screenshots.
- [ ] 6.3 Update the Leitner box, daily challenge and interview deck to draw from the new topics; migrate saves safely (older saves load with empty progress for new gyms).
