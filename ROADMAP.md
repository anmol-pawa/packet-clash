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
- [ ] 2.2 Physical and data link: encoding, framing, **error detection** (parity, checksum, CRC with generated division problems, Hamming code), MAC/CSMA-CD/CSMA-CA, Ethernet, switches and MAC learning, VLANs, ARP.
  - [x] 2.2a Error detection: `lib/net/errors` solvers (parity, Hamming distance, the Internet checksum, CRC by mod-2 long division with its XOR steps, Hamming SEC encode/syndrome) checked against Kurose & Ross, Forouzan, Tanenbaum and RFC 1071, with seeded generators and hand-written cards for gym 2.
  - [ ] 2.2b Link layer: line encoding (NRZ, Manchester), framing (byte/bit stuffing generators), MAC protocols (CSMA/CD with binary exponential backoff and the minimum frame size calculation, CSMA/CA and RTS/CTS, slotted vs pure ALOHA efficiency), the Ethernet frame, and ARP.
  - [ ] 2.2c Switches: a MAC-learning simulator question (given a frame sequence, fill the switch table and say which ports flood vs forward), VLANs and trunking, and loops/STP at interview depth.
  - [ ] 2.2d Gym 2 concept lessons: illustrated cards (CRC long division, Hamming check positions, CSMA/CD, MAC learning) shown before the gym battle.
- [ ] 2.3 Network layer and addressing: IPv4 header, **subnetting and CIDR drills** (network/broadcast/host range/subnet count, VLSM), private ranges, NAT/PAT, fragmentation (offset calculations), ICMP, IPv6 basics.
- [ ] 2.4 Routing: **Dijkstra / link-state** and **Bellman-Ford / distance-vector** with generated graphs where the player fills routing tables (solver-checked), count-to-infinity, RIP/OSPF/BGP at interview depth.
- [ ] 2.5 Transport: UDP vs TCP, ports and sockets, the **3-way handshake and teardown** (animated state machine), sequence/ack number problems, flow control (sliding window, Go-Back-N, Selective Repeat simulations), **congestion control** (slow start, AIMD, fast retransmit/recovery: plot cwnd over RTTs).
- [ ] 2.6 Application layer: DNS resolution (iterative vs recursive, order the steps, record types), HTTP/1.1 vs 2 vs 3, status codes, cookies, caching headers, REST, email (SMTP/IMAP), DHCP (DORA), FTP/SSH basics.
- [ ] 2.7 Security: TLS 1.3 handshake ordering, symmetric vs asymmetric crypto, certificates and PKI, hashing and MACs, firewalls, VPNs, common attacks (MITM, DDoS, spoofing, XSS/CSRF at interview level).
- [ ] 2.8 "What happens when you type a URL": a full end-to-end animated journey (DNS, ARP, TCP, TLS, HTTP, rendering) as an order-the-steps boss battle.
- [ ] 2.9 Interview gauntlet: the top networking interview questions (TCP vs UDP, how DNS works, HTTP vs HTTPS, subnetting on the spot, load balancers L4 vs L7, CDN, WebSockets, NAT traversal) as a timed mock interview with a scorecard.

## 3. Polish

- [ ] 3.1 Daily challenge (date-seeded) and streaks.
- [ ] 3.2 Accessibility and performance pass on iPhone.
