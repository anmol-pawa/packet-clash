import { describe, expect, it } from "vitest";
import { ANIMS } from "@/game/art/creature";
import { ACKORN, IDLE_BASE, SEGMENTS, WINDOW, lampPositions, maxWindow, segmentState, windowThroughput } from "@/game/art/creatures/ackorn";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { CIDRAB } from "@/game/art/creatures/cidrab";
import { ETHERNET, FIELDS, FRAMADILLO, IDLE_FIELDS, LAMP_POS as FRAME_LAMPS, ethernetFrame } from "@/game/art/creatures/framadillo";
import { FETCHIMERA, JOURNEY, LAMP_POS as JOURNEY_LAMPS, PAGE_POS, journeyFor, pageLoadTime, parseUrl } from "@/game/art/creatures/fetchimera";
import { AREADON, LINK_MBPS, RINGS, digitRows, litAreas, ospfCost } from "@/game/art/creatures/areadon";
import { ACLAW, ACL_LINES, BAR_Y, IMPLICIT_LINE, PROBES, clawBadge, lampBar, probeResult } from "@/game/art/creatures/aclaw";
import { HASHORN, KEYS, NODES, RING, RING_R, VNODES, angleOf, beadRows, keyPos, ownerBead, ownerOf } from "@/game/art/creatures/hashorn";
import { SPINEBACK, FABRIC, FLOWS, LEAVES, LEAF_X, LEAF_Y, LINKS, SPINES, SPINE_X, SPINE_Y, ecmpSpine, leafHops, linkPixels, plateRows } from "@/game/art/creatures/spineback";
import { ringLookup } from "@/lib/net/loadbalance";
import { NATTOPUS, NAT_TABLE, TAG_POS, tagRows, translatedArms } from "@/game/art/creatures/nattopus";
import { BLOCKED, PLATES, SPANTOISE, depth, litPlates } from "@/game/art/creatures/spantoise";
import { GIGAROC, PULSE_POS, bandwidthDelayProduct, bitWidth, nodalDelay, propagationDelay, storeAndForward, transmissionDelay } from "@/game/art/creatures/gigaroc";
import { HOOTPATH, NODE_POS, ROUTE_LINKS, ROUTE_NODES, dijkstra } from "@/game/art/creatures/hootpath";
import { GEM_POS, KEYHOLE_POS, KEYVERN, SHACKLE_POS, TLS13_HANDSHAKE, diffieHellman, lockState } from "@/game/art/creatures/keyvern";
import { NAME_SERVERS, ORACLYNX, ORB_POS, STONE_POS, messageCount, resolveIteratively } from "@/game/art/creatures/oraclynx";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { STACKADON } from "@/game/art/creatures/stackadon";
import { HANDSHAKE_STATES, LAMP_POS, STATE_LAMP, SYNACKLE, handshake } from "@/game/art/creatures/synackle";
import { TRACEVIX } from "@/game/art/creatures/tracevix";
import { DOT1Q, LAMP_POS as TAG_LAMPS, TAGGED_FIELDS, TAGGED_IDLE, TRUNKADILLO, taggedFrame, vlanTci } from "@/game/art/creatures/trunkadillo";
import { CWND_IDLE, HURT_LOST, OAKWIND, SEGMENTS as OAK_SEGMENTS, cwndTrace, lampPositions as oakLamps, segmentState as oakState } from "@/game/art/creatures/oakwind";
import { isPrivate, parseIp } from "@/lib/net/ipv4";
import { typesOf } from "@/game/engine/types";
import { Painter } from "@/lib/paint";
import { parseSprite, silhouette } from "@/lib/pixel";

const CREATURES = [PINGKIT, TRACEVIX, FRAMADILLO, TRUNKADILLO, ACKORN, OAKWIND, BRAIDWYRM, STACKADON, CIDRAB, HOOTPATH, SYNACKLE, ORACLYNX, KEYVERN, FETCHIMERA, GIGAROC, SPANTOISE, AREADON, NATTOPUS, ACLAW, HASHORN, SPINEBACK];

describe("creature art", () => {
  for (const c of CREATURES) {
    describe(c.name, () => {
      it("has every animation for front and back, at the creature's size", () => {
        expect(c.size).toBeGreaterThanOrEqual(64);
        for (const view of [c.front, c.back])
          for (const a of ANIMS) {
            expect(view[a].length, a).toBeGreaterThan(0);
            for (const f of view[a]) expect(parseSprite(f)).toMatchObject({ width: c.size, height: c.size });
          }
      });

      it("idles on 2–4 distinct frames", () => {
        for (const view of [c.front, c.back]) {
          expect(view.idle.length).toBeGreaterThanOrEqual(2);
          expect(view.idle.length).toBeLessThanOrEqual(4);
          expect(new Set(view.idle.map((f) => f.rows.join("\n"))).size).toBe(view.idle.length);
        }
      });

      it("attack, hurt and faint frames differ from the idle pose", () => {
        for (const view of [c.front, c.back])
          for (const a of ["attack", "hurt", "faint"] as const) expect(view[a][0].rows).not.toEqual(view.idle[0].rows);
        expect(c.front.idle[0].rows).not.toEqual(c.back.idle[0].rows);
      });

      it("keeps a limited palette and a closed outline", () => {
        const pal = c.front.idle[0].palette;
        expect(Object.keys(pal).length).toBeLessThanOrEqual(26);
        for (const view of [c.front, c.back])
          for (const a of ANIMS)
            for (const f of view[a]) {
              const rows = f.rows;
              rows.forEach((row, y) => {
                [...row].forEach((ch, x) => {
                  if (ch === ".") return;
                  const edge = [rows[y - 1]?.[x], rows[y + 1]?.[x], row[x - 1], row[x + 1]].some((n) => n === undefined || n === ".");
                  if (edge) expect(ch, `${a} (${x},${y})`).toBe("o");
                });
              });
            }
      });
    });
  }
});

describe("bosses", () => {
  for (const boss of [BRAIDWYRM, STACKADON, CIDRAB, HOOTPATH, SYNACKLE, ORACLYNX, KEYVERN, FETCHIMERA, GIGAROC, SPANTOISE, AREADON, NATTOPUS, ACLAW, HASHORN, SPINEBACK])
  it(`${boss.name} is a 96×96 boss whose drawing fits the frame with room to rear up`, () => {
    expect(boss.size).toBe(96);
    expect(boss.signature).toMatch(/^[A-Z ]+$/);
    for (const view of [boss.front, boss.back])
      for (const a of ANIMS)
        for (const f of view[a]) {
          // nothing touches the top 8 rows, so the attack rear-up never clips
          expect(f.rows.slice(0, 8).every((r) => /^\.+$/.test(r)), a).toBe(true);
          // the coil sits on the bottom of the frame (anchored to the platform)
          expect(f.rows.slice(84).some((r) => /[^.]/.test(r)), a).toBe(true);
        }
  });

  it("Stackadon's idle loop lights one layer per frame, climbing link → application", () => {
    // seam colours per layer (bright), bottom → top
    const lit = ["a", "c", "e", "g"];
    for (const view of [STACKADON.front, STACKADON.back]) {
      view.idle.forEach((f, i) => {
        const text = f.rows.join("");
        lit.forEach((ch, layer) => expect(text.includes(ch), `frame ${i} layer ${layer}`).toBe(layer === i));
      });
      // hurt and faint frames go dark
      for (const f of [...view.hurt, ...view.faint]) expect(/[aceg]/.test(f.rows.join(""))).toBe(false);
    }
  });
});

describe("Cidrab's bit-lamps", () => {
  /** Reads the eight lamps (3×2 each, 5 px apart) along the shell, left → right as drawn. */
  const lamps = (f: { rows: string[] }) => {
    const lit = f.rows.join("").split("e").length - 1;
    const dark = f.rows.join("").split("f").length - 1;
    // every lamp is 6 px: a lit one shows 5 "e" plus a glint, a dark one 6 "f"
    return { on: lit / 5, off: dark / 6 };
  };
  // a /n mask's last octet: the top (n − 24) bits set
  const lastOctet = (n: number) => (0xff << (32 - n)) & 0xff;

  it("borrows one host bit per idle frame: /25, /26, /27, /28", () => {
    const masks = [25, 26, 27, 28];
    expect(masks.map(lastOctet)).toEqual([128, 192, 224, 240]);
    for (const view of [CIDRAB.front, CIDRAB.back])
      view.idle.forEach((f, i) => {
        // the number of lit lamps is the popcount of the mask's last octet
        const ones = lastOctet(masks[i]).toString(2).split("1").length - 1;
        expect(lamps(f), `idle ${i}`).toEqual({ on: ones, off: 8 - ones });
      });
  });

  it("lights the network bits as one contiguous run from bit 7, like a real mask", () => {
    // both finished views have bit 7 on the right (the front is mirrored to face the player)
    for (const view of [CIDRAB.front, CIDRAB.back])
      for (const f of view.idle) {
        const row = f.rows.findLast((r) => /[ef]/.test(r))!;
        const bits = row
          .replace(/[^ef]+/g, " ")
          .trim()
          .split(" ")
          .map((lamp) => (lamp === "eee" ? "1" : lamp === "fff" ? "0" : "?"))
          .reverse()
          .join("");
        expect(bits).toMatch(/^1+0+$/);
        expect(bits).toHaveLength(8);
      }
  });

  it("flares every lamp on the attack and goes dark when hurt or fainting", () => {
    for (const view of [CIDRAB.front, CIDRAB.back]) {
      for (const f of view.attack) expect(lamps(f)).toEqual({ on: 8, off: 0 });
      for (const f of [...view.hurt, ...view.faint]) expect(lamps(f)).toEqual({ on: 0, off: 8 });
    }
  });
});

describe("Hootpath's route lamps", () => {
  /** Every simple path's cost from S, minimised: a brute-force check on Dijkstra. */
  const bruteForce = (target: string): number => {
    let best = Infinity;
    const walk = (at: string, seen: Set<string>, cost: number) => {
      if (at === target) best = Math.min(best, cost);
      for (const [a, b, w] of ROUTE_LINKS) {
        const next = a === at ? b : b === at ? a : null;
        if (next && !seen.has(next)) walk(next, new Set([...seen, next]), cost + w);
      }
    };
    walk("S", new Set(["S"]), 0);
    return best;
  };

  it("runs Dijkstra from S: settles S, B, A, C at distances 0, 1, 3, 4", () => {
    const order = dijkstra();
    expect(order).toEqual([
      { node: "S", dist: 0, via: null },
      { node: "B", dist: 1, via: "S" },
      { node: "A", dist: 3, via: "B" },
      { node: "C", dist: 4, via: "A" },
    ]);
    // the cheapest route to A is two hops (S→B→A = 3), not the direct link (4)
    expect(ROUTE_LINKS.find(([a, b]) => a === "S" && b === "A")![2]).toBeGreaterThan(order[2].dist);
    for (const { node, dist } of order) expect(dist).toBe(bruteForce(node));
    // distances never decrease in settle order
    expect(order.map((o) => o.dist)).toEqual([...order.map((o) => o.dist)].sort((a, b) => a - b));
  });

  /** Which node lamps are lit in a frame, read at the lamp centres (front art is mirrored). */
  const lit = (f: { rows: string[] }, front: boolean) =>
    ROUTE_NODES.filter((n) => {
      const [x, y] = NODE_POS[n];
      const ch = f.rows[y][front ? 95 - x : 96 - x];
      expect("ef").toContain(ch);
      return ch === "e";
    });

  it("settles one more node per idle frame, in Dijkstra order, lighting the tree edges", () => {
    const order = dijkstra().map((o) => o.node);
    for (const [view, front] of [
      [HOOTPATH.front, true],
      [HOOTPATH.back, false],
    ] as const)
      view.idle.forEach((f, i) => {
        expect(lit(f, front).sort(), `idle ${i}`).toEqual(order.slice(0, i + 1).sort());
        // lit links appear once a node has been reached through one
        expect(f.rows.join("").includes("h"), `idle ${i}`).toBe(i > 0);
      });
  });

  it("lights the whole network on the attack and goes dark when hurt or fainting", () => {
    for (const view of [HOOTPATH.front, HOOTPATH.back]) {
      // every lamp is 3×3: a glint and eight lit pixels
      for (const f of view.attack) expect(f.rows.join("").split("e").length - 1).toBe(4 * 8);
      for (const f of [...view.hurt, ...view.faint]) {
        expect(f.rows.join("")).not.toMatch(/[eh]/);
      }
    }
  });
});

describe("Synackle's handshake", () => {
  it("numbers the three segments like Kurose & Ross: SYN x, SYN-ACK y / x+1, ACK x+1 / y+1", () => {
    // the textbook's Telnet example uses client ISN 42 and server ISN 79
    expect(handshake(42, 79)).toEqual([
      { from: "client", flags: ["SYN"], seq: 42, ack: null },
      { from: "server", flags: ["SYN", "ACK"], seq: 79, ack: 43 },
      { from: "client", flags: ["ACK"], seq: 43, ack: 80 },
    ]);
    // sequence numbers are 32-bit and wrap
    expect(handshake(2 ** 32 - 1, 0)[1].ack).toBe(0);
    expect(handshake(5, 2 ** 32 - 1)[2]).toMatchObject({ seq: 6, ack: 0 });
  });

  it("steps both ends through the RFC 793 states", () => {
    expect(HANDSHAKE_STATES).toEqual([
      { client: "CLOSED", server: "LISTEN" },
      { client: "SYN_SENT", server: "LISTEN" },
      { client: "SYN_SENT", server: "SYN_RCVD" },
      { client: "ESTABLISHED", server: "SYN_RCVD" },
      { client: "ESTABLISHED", server: "ESTABLISHED" },
    ]);
    // each step changes exactly one end: the one that just sent a segment
    const segs = handshake(0, 0);
    for (let i = 1; i < HANDSHAKE_STATES.length - 1; i++) {
      const [a, b] = [HANDSHAKE_STATES[i - 1], HANDSHAKE_STATES[i]];
      expect(a.client !== b.client ? "client" : "server").toBe(segs[i - 1].from);
      expect(a.client !== b.client && a.server !== b.server).toBe(false);
    }
  });

  /** Lamp colours (client, server) at the lamp centres; the back view sits flipped. */
  const lamps = (f: { rows: string[] }, front: boolean) =>
    (["client", "server"] as const).map((w) => {
      const [x, y] = LAMP_POS[w];
      return f.rows[y][front ? x : 96 - x];
    });

  it("lights the lamps for each idle frame's state, ending ESTABLISHED on both", () => {
    for (const [view, front] of [
      [SYNACKLE.front, true],
      [SYNACKLE.back, false],
    ] as const)
      view.idle.forEach((f, i) => {
        const s = HANDSHAKE_STATES[i + 1];
        expect(lamps(f, front), `idle ${i}`).toEqual([STATE_LAMP[s.client], STATE_LAMP[s.server]]);
      });
  });

  it("sends a segment along the arch on the first three idle frames only, from the right twin", () => {
    // the segment's white core sits on the client's half for SYN and ACK, the server's for SYN-ACK
    const coreX = (f: { rows: string[] }) => {
      const xs: number[] = [];
      f.rows.slice(0, 50).forEach((r) => [...r].forEach((ch, x) => ch === "g" && xs.push(x)));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const segs = handshake(0, 0);
    SYNACKLE.front.idle.slice(0, 3).forEach((f, i) => {
      const x = coreX(f)!;
      expect(x, `idle ${i}`).not.toBeNull();
      // a segment in flight has just left its sender, so it's on the sender's half
      expect(x < 48 ? "client" : "server", `idle ${i}`).toBe(segs[i].from);
    });
    expect(coreX(SYNACKLE.front.idle[3])).toBeNull();
  });

  it("is all green on the attack and dark when hurt or fainting", () => {
    // two 3×3 lamps; the lunge moves them, so count colours instead of reading a spot
    const count = (f: { rows: string[] }, ch: string) => f.rows.join("").split(ch).length - 1;
    for (const view of [SYNACKLE.front, SYNACKLE.back]) {
      for (const f of view.attack) expect([count(f, "e"), count(f, "a"), count(f, "b"), count(f, "f")]).toEqual([18, 0, 0, 0]);
      for (const f of [...view.hurt, ...view.faint]) expect([count(f, "e"), count(f, "a"), count(f, "b"), count(f, "f")]).toEqual([0, 0, 0, 18]);
    }
  });
});

describe("painter", () => {
  it("shades an ellipse light at the upper left and dark at the lower right", () => {
    const p = new Painter(21, 21);
    p.ellipse(10.5, 10.5, 9, 9, "ABCD");
    expect(p.get(6, 5)).toBe("A");
    expect(p.get(16, 16)).toBe("D");
    expect(p.get(0, 0)).toBeNull();
  });

  it("outlines a silhouette with 1 px on the 4-neighbourhood", () => {
    const p = new Painter(5, 5);
    p.set(2, 2, "A");
    p.outline("o");
    expect(p.rows()).toEqual([".....", "..o..", ".oAo.", "..o..", "....."]);
  });

  it("draws rims only where a part overlaps an earlier one", () => {
    const p = new Painter(12, 6);
    p.polygon(
      [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
      "A",
    );
    p.tube(
      [
        [5, 3],
        [10, 3],
      ],
      [2, 2],
      "B",
      { rim: "r" },
    );
    expect(p.get(3, 3)).toBe("r"); // tube edge over the square
    expect(p.get(11, 3)).toBe("B"); // tube edge over empty space stays fill
  });

  it("silhouette() whitens every colour", () => {
    const s = silhouette(PINGKIT.front.idle[0]);
    expect(new Set(Object.values(s.palette))).toEqual(new Set(["#ffffff"]));
  });
});

describe("Oraclynx's lookup", () => {
  it("resolves gaia.cs.umass.edu like Kurose & Ross: root, then the edu TLD, then umass.edu's authoritative server", () => {
    expect(resolveIteratively("gaia.cs.umass.edu")).toEqual([
      { server: "a.root-servers.net", zone: ".", reply: { kind: "referral", zone: "edu.", server: "a.edu-servers.net" } },
      { server: "a.edu-servers.net", zone: "edu.", reply: { kind: "referral", zone: "umass.edu.", server: "dns.umass.edu" } },
      { server: "dns.umass.edu", zone: "umass.edu.", reply: { kind: "answer", address: "128.119.245.12" } },
    ]);
    // the textbook counts eight DNS messages for this lookup
    expect(messageCount(resolveIteratively("gaia.cs.umass.edu"))).toBe(8);
    // names are case-insensitive and the trailing root dot is optional
    expect(resolveIteratively("GAIA.cs.umass.edu.").at(-1)!.reply).toEqual({ kind: "answer", address: "128.119.245.12" });
  });

  it("follows the longest matching delegation and stops at a server that has no answer", () => {
    // umass.edu, not a sibling zone whose name is a plain string suffix
    const servers = [
      ...NAME_SERVERS.filter((s) => s.zone !== "edu."),
      { name: "a.edu-servers.net", zone: "edu.", delegations: { "umass.edu.": "dns.umass.edu", "ss.edu.": "ns.ss.edu" }, records: {} },
    ];
    expect(resolveIteratively("gaia.cs.umass.edu", servers)[1].reply).toMatchObject({ zone: "umass.edu." });
    expect(resolveIteratively("www.example.org").map((s) => s.reply.kind)).toEqual(["nxdomain"]);
    expect(resolveIteratively("nope.umass.edu").map((s) => s.reply.kind)).toEqual(["referral", "referral", "nxdomain"]);
  });

  const at = (f: { rows: string[] }, [x, y]: readonly [number, number]) => f.rows[y][x];
  const stones = (f: { rows: string[] }) => (["root", "tld", "auth"] as const).map((k) => at(f, STONE_POS[k]));

  it("lights the stone being asked on each idle frame, in lookup order, then the answer lands in the orb", () => {
    const order = resolveIteratively("gaia.cs.umass.edu").map((s) => s.zone);
    expect(order).toEqual([".", "edu.", "umass.edu."]);
    for (const view of [ORACLYNX.front, ORACLYNX.back]) {
      expect(view.idle).toHaveLength(order.length + 1);
      view.idle.forEach((f, i) => {
        expect(stones(f), `idle ${i}`).toEqual([0, 1, 2].map((s) => (s === i ? "v" : "f")));
        expect(at(f, ORB_POS) === "g", `idle ${i}`).toBe(i === 3);
      });
    }
  });

  it("lights every stone and the orb on the attack, and goes dark when hurt or fainting", () => {
    for (const view of [ORACLYNX.front, ORACLYNX.back]) {
      for (const f of view.attack) expect(stones(f)).toEqual(["v", "v", "v"]);
      for (const f of [...view.hurt, ...view.faint]) {
        expect(f.rows.join("")).not.toMatch(/[vg]/);
      }
    }
  });
});

describe("Keyvern's handshake", () => {
  it("computes Diffie-Hellman key shares and a shared secret like Stallings's worked example", () => {
    // q = 353, α = 3, X_A = 97, X_B = 233 → Y_A = 40, Y_B = 248, K = 160
    expect(diffieHellman(353, 3, 97, 233)).toEqual({ A: 40, B: 248, clientSecret: 160, serverSecret: 160 });
    // the small p = 23, g = 5 example: A = 4, B = 10, s = 18
    expect(diffieHellman(23, 5, 4, 3)).toEqual({ A: 4, B: 10, clientSecret: 18, serverSecret: 18 });
    // both sides always agree
    for (let a = 1; a < 30; a++) {
      const k = diffieHellman(101, 2, a, 31 - a);
      expect(k.clientSecret).toBe(k.serverSecret);
    }
  });

  it("follows RFC 8446's 1-RTT handshake: everything after the ServerHello is encrypted", () => {
    expect(TLS13_HANDSHAKE.map((f) => f.from)).toEqual(["client", "server", "client", "client"]);
    const all = TLS13_HANDSHAKE.flatMap((f) => f.messages);
    expect(all.slice(0, 2)).toEqual(["ClientHello + key_share", "ServerHello + key_share"]);
    for (const m of all.slice(2)) expect(m).toMatch(/^[{[].*[}\]]$/);
    // the certificate is proven with CertificateVerify, then each side sends Finished
    expect(TLS13_HANDSHAKE[1].messages.slice(2)).toEqual(["{Certificate}", "{CertificateVerify}", "{Finished}"]);
    expect([0, 1, 2, 3].map((i) => lockState(i))).toEqual([
      { client: true, server: false, secret: false, locked: false },
      { client: true, server: true, secret: true, locked: false },
      { client: true, server: true, secret: true, locked: false },
      { client: true, server: true, secret: true, locked: true },
    ]);
  });

  const at = (f: { rows: string[] }, [x, y]: readonly [number, number]) => f.rows[y][x];

  it("lights the gems, keyhole and shackle to match each idle frame's handshake step", () => {
    for (const view of [KEYVERN.front, KEYVERN.back]) {
      expect(view.idle).toHaveLength(TLS13_HANDSHAKE.length);
      view.idle.forEach((f, i) => {
        const s = lockState(i);
        expect(at(f, GEM_POS.client), `idle ${i}`).toBe(s.client ? "c" : "f");
        expect(at(f, GEM_POS.server), `idle ${i}`).toBe(s.server ? "s" : "f");
        expect(at(f, KEYHOLE_POS) === "y", `idle ${i}`).toBe(s.secret);
        expect("hi".includes(at(f, SHACKLE_POS)), `idle ${i}`).toBe(s.locked);
      });
    }
  });

  it("blazes on the attack and goes dark when hurt or fainting", () => {
    for (const view of [KEYVERN.front, KEYVERN.back]) {
      for (const f of view.attack) expect(f.rows.join("")).toMatch(/c[^]*s|s[^]*c/);
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/[csy]/);
    }
  });
});

describe("Fetchimera's URL journey", () => {
  it("parses URLs with the scheme's default port", () => {
    expect(parseUrl("https://Example.com/index.html?q=1")).toEqual({ scheme: "https", host: "example.com", port: 443, path: "/index.html?q=1" });
    expect(parseUrl("http://gaia.cs.umass.edu")).toEqual({ scheme: "http", host: "gaia.cs.umass.edu", port: 80, path: "/" });
    expect(parseUrl("http://localhost:8080/api").port).toBe(8080);
    expect(() => parseUrl("ftp://x.org/")).toThrow();
    expect(journeyFor("https://example.com/")).toEqual(["DNS", "TCP", "TLS", "HTTP"]);
    expect(journeyFor("http://example.com/")).toEqual(["DNS", "TCP", "HTTP"]);
  });

  it("times page loads like Kurose & Ross chapter 2, P7 and P8", () => {
    const dnsRtts = [3, 5, 7]; // RTT1..RTTn, summing to 15
    const rtt = 10; // RTT0
    const t = (objects: number, mode: Parameters<typeof pageLoadTime>[0]["mode"], parallel?: number) =>
      pageLoadTime({ dnsRtts, rtt, objects, mode, parallel });
    // P7: one object → RTT1 + … + RTTn + 2·RTT0
    expect(t(0, "non-persistent")).toBe(15 + 2 * rtt);
    // P8: eight more small objects on the same server
    expect(t(8, "non-persistent")).toBe(15 + 18 * rtt); // serial, no parallel connections
    expect(t(8, "non-persistent-parallel", 5)).toBe(15 + 6 * rtt); // 5 parallel connections
    expect(t(8, "persistent")).toBe(15 + 10 * rtt); // persistent, no pipelining
    expect(t(8, "persistent-pipelined")).toBe(15 + 3 * rtt); // persistent with pipelining
    // a cached address skips DNS; the K&R response time for one file is 2 RTT
    expect(pageLoadTime({ dnsRtts: [], rtt, objects: 0, mode: "persistent" })).toBe(2 * rtt);
    // https adds TLS to each new connection: TLS 1.3 one RTT, TLS 1.2 two
    expect(pageLoadTime({ dnsRtts: [], rtt, objects: 0, mode: "persistent", tlsRtts: 1 })).toBe(3 * rtt);
    expect(pageLoadTime({ dnsRtts: [], rtt, objects: 0, mode: "persistent", tlsRtts: 2 })).toBe(4 * rtt);
    expect(pageLoadTime({ dnsRtts: [], rtt, objects: 2, mode: "non-persistent", tlsRtts: 1 })).toBe(9 * rtt);
  });

  const at = (f: { rows: string[] }, [x, y]: readonly [number, number]) => f.rows[y][x];

  it("lights one more stage lamp per idle frame and fetches the page on the last", () => {
    expect(JOURNEY.map((j) => j.stage)).toEqual(["DNS", "TCP", "TLS", "HTTP"]);
    for (const view of [FETCHIMERA.front, FETCHIMERA.back]) {
      expect(view.idle).toHaveLength(JOURNEY.length);
      view.idle.forEach((f, i) => {
        JOURNEY_LAMPS.forEach((pos, j) => expect(at(f, pos), `idle ${i} lamp ${j}`).toBe(j <= i ? JOURNEY[j].lamp : "f"));
        // the envelope's green seal sits at the page centre only once HTTP has answered
        expect(at(f, PAGE_POS) === "g", `idle ${i}`).toBe(i === JOURNEY.length - 1);
      });
    }
  });

  it("lights every lamp on the attack and goes dark when hurt or fainting", () => {
    for (const view of [FETCHIMERA.front, FETCHIMERA.back]) {
      // the body moves on the attack, so look for each lamp's full 5×5 glow anywhere
      for (const f of view.attack)
        for (const { lamp } of JOURNEY) expect(f.rows.join("").split(lamp).length - 1, lamp).toBeGreaterThanOrEqual(15);
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/[dtsg]/);
    }
  });
});

describe("Gigaroc's backbone link", () => {
  it("solves Kurose & Ross P25: bandwidth-delay product and the width of a bit", () => {
    // two hosts 20,000 km apart, R = 2 Mbps, s = 2.5·10^8 m/s
    const R = 2e6;
    const m = 2e7;
    const s = 2.5e8;
    expect(propagationDelay(m, s)).toBeCloseTo(0.08, 12);
    expect(bandwidthDelayProduct(R, m, s)).toBeCloseTo(160_000, 6);
    // an 800,000-bit file sent at once: at most R·d_prop bits are ever on the link
    expect(Math.min(800_000, bandwidthDelayProduct(R, m, s))).toBeCloseTo(160_000, 6);
    expect(bitWidth(R, s)).toBe(125);
    expect(m / bandwidthDelayProduct(R, m, s)).toBeCloseTo(125, 9);
  });

  it("times store-and-forward like Kurose & Ross §1.3.1 and P31", () => {
    const L = 1500 * 8;
    // §1.3.1: three packets over source → router → destination arrive by 4L/R
    expect(storeAndForward({ messageBits: 3 * L, packetBits: L, rate: 1e6, links: 2 })).toBeCloseTo((4 * L) / 1e6, 12);
    // P31: an 8·10^6-bit message over 3 links of 2 Mbps
    const msg = { messageBits: 8e6, rate: 2e6, links: 3 };
    expect(transmissionDelay(8e6, 2e6)).toBe(4); // one hop, unsegmented
    expect(storeAndForward({ ...msg, packetBits: 8e6 })).toBeCloseTo(12, 9);
    // segmented into 800 packets of 10,000 bits: the first lands at 15 ms, the last at 4.01 s
    expect(storeAndForward({ ...msg, messageBits: 1e4, packetBits: 1e4 })).toBeCloseTo(0.015, 12);
    expect(storeAndForward({ ...msg, packetBits: 1e4 })).toBeCloseTo(4.01, 9);
  });

  it("adds up nodal delay from its four parts", () => {
    // a 1500-byte packet on 10 Mbps is 1.2 ms of transmission; 2,000 km of fibre is 10 ms of propagation
    expect(transmissionDelay(12_000, 10e6)).toBeCloseTo(0.0012, 12);
    expect(nodalDelay({ bits: 12_000, rate: 10e6, metres: 2e6, speed: 2e8 })).toBeCloseTo(0.0112, 12);
    expect(nodalDelay({ bits: 12_000, rate: 10e6, metres: 2e6, speed: 2e8, queuing: 0.003, processing: 0.0001 })).toBeCloseTo(0.0143, 12);
  });

  const at = (f: { rows: string[] }, [x, y]: readonly [number, number]) => f.rows[y][x];

  it("sends one light pulse from shoulder to wingtip across the idle loop", () => {
    // positions run from the shoulder (lower right) up the wing to the tip (upper left)
    for (let i = 1; i < PULSE_POS.length; i++) {
      expect(PULSE_POS[i][0]).toBeLessThan(PULSE_POS[i - 1][0]);
      expect(PULSE_POS[i][1]).toBeLessThan(PULSE_POS[i - 1][1]);
    }
    for (const view of [GIGAROC.front, GIGAROC.back]) {
      expect(view.idle).toHaveLength(PULSE_POS.length);
      view.idle.forEach((f, i) => {
        PULSE_POS.forEach((pos, j) => expect(at(f, pos), `idle ${i} pos ${j}`).toBe(j === i ? "y" : "f"));
        // the fibre ends on its tail glow while it idles
        expect(f.rows.join("")).toMatch(/c/);
      });
    }
  });

  it("fills the whole link on the attack and goes dark when hurt or fainting", () => {
    for (const view of [GIGAROC.front, GIGAROC.back]) {
      for (const f of view.attack) expect(f.rows.join("").split("y").length - 1).toBeGreaterThanOrEqual(PULSE_POS.length);
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/[cy]/);
    }
  });
});

describe("Framadillo's frame shell", () => {
  /** The 3×3 lamp of band `b`: its centre pixel. */
  const lamp = (f: { rows: string[] }, view: "front" | "back", b: number, dy = 0) => {
    const [x, y] = FRAME_LAMPS[view][b];
    return f.rows[y + 1 + dy][x + 1];
  };

  it("has the six Ethernet II fields in transmission order", () => {
    expect(FIELDS).toEqual(["preamble", "destination MAC", "source MAC", "EtherType", "payload", "FCS"]);
    // every field goes out exactly once across the idle loop, in order
    expect(IDLE_FIELDS.flat()).toEqual([0, 1, 2, 3, 4, 5]);
    // lamps run from the head (right) back to the tail
    for (const view of ["front", "back"] as const) {
      const xs = FRAME_LAMPS[view].map(([x]) => x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1]);
    }
  });

  it("idles by sending its fields onto the wire, with a green FCS at the end", () => {
    for (const view of ["front", "back"] as const) {
      FRAMADILLO[view].idle.forEach((f, i) => {
        // idle frames 1 and 2 bob down a pixel
        const dy = i === 1 || i === 2 ? 1 : 0;
        FIELDS.forEach((_, b) => {
          const lit = IDLE_FIELDS[i].includes(b);
          expect(lamp(f, view, b, dy), `${view} frame ${i} band ${b}`).toBe(lit ? "m" : "x");
        });
        expect(f.rows.join("").includes("g")).toBe(i === 3);
      });
    }
  });

  it("lights every field on the attack, fails the CRC when hurt and goes dark when fainting", () => {
    for (const view of ["front", "back"] as const) {
      for (const f of FRAMADILLO[view].attack) {
        FIELDS.forEach((_, b) => expect(lamp(f, view, b)).toBe("m"));
        expect(f.rows.join("").includes("g")).toBe(true);
      }
      for (const f of FRAMADILLO[view].hurt) {
        const t = f.rows.join("");
        expect(t.includes("r")).toBe(true);
        expect(/[megf]/.test(t)).toBe(false);
      }
      for (const f of FRAMADILLO[view].faint) expect(/[megfr]/.test(f.rows.join(""))).toBe(false);
    }
  });

  it("is Link type", () => {
    expect(typesOf("framadillo")).toEqual(["LINK"]);
  });

  it("pads short Ethernet payloads to the 64-byte minimum frame", () => {
    // Header 14 + FCS 4: a 46-byte payload is the smallest frame, 64 bytes.
    expect(ethernetFrame(46)).toMatchObject({ pad: 0, frame: 64, wire: 84 });
    // A 1-byte payload is padded with 45 bytes.
    expect(ethernetFrame(1)).toMatchObject({ pad: 45, frame: 64 });
    // A TCP ACK in IPv4 (20 + 20 = 40 bytes) needs 6 bytes of padding.
    expect(ethernetFrame(40)).toMatchObject({ pad: 6, frame: 64 });
    expect(ethernetFrame(0).pad).toBe(ETHERNET.minPayload);
  });

  it("caps frames at 1518 bytes and 1538 on the wire, about 97.5% efficient", () => {
    const full = ethernetFrame(1500);
    expect(full).toMatchObject({ pad: 0, frame: 1518, wire: 1538 });
    expect(full.efficiency).toBeCloseTo(0.9753, 4);
    // a minimum frame carries 46 bytes in 84 on the wire
    expect(ethernetFrame(46).efficiency).toBeCloseTo(46 / 84, 6);
    expect(() => ethernetFrame(1501)).toThrow(RangeError);
    expect(() => ethernetFrame(-1)).toThrow(RangeError);
    expect(() => ethernetFrame(1.5)).toThrow(RangeError);
  });
});

describe("Trunkadillo's tagged-frame shell", () => {
  const lamp = (f: { rows: string[] }, view: "front" | "back", b: number, dy = 0) => {
    const [x, y] = TAG_LAMPS[view][b];
    return f.rows[y + 1 + dy][x + 1];
  };
  const TAG = TAGGED_FIELDS.indexOf("802.1Q tag");

  it("inserts the 802.1Q tag between the source MAC and the EtherType", () => {
    expect([...TAGGED_FIELDS]).toEqual(["preamble", "destination MAC", "source MAC", "802.1Q tag", "EtherType", "payload", "FCS"]);
    expect(TAGGED_FIELDS.filter((f) => f !== "802.1Q tag")).toEqual([...FIELDS]);
    expect(TAGGED_IDLE.flat()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const view of ["front", "back"] as const) {
      const xs = TAG_LAMPS[view].map(([x]) => x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1]);
    }
  });

  it("idles by sending the tagged frame field by field, the tag in violet and a green FCS last", () => {
    for (const view of ["front", "back"] as const) {
      TRUNKADILLO[view].idle.forEach((f, i) => {
        const dy = i === 1 || i === 2 ? 1 : 0;
        TAGGED_FIELDS.forEach((_, b) => expect(lamp(f, view, b, dy), `${view} frame ${i} band ${b}`).toBe(TAGGED_IDLE[i].includes(b) ? "m" : "x"));
        const t = f.rows.join("");
        expect(t.includes("v"), `${view} frame ${i}`).toBe(TAGGED_IDLE[i].includes(TAG));
        expect(t.includes("g")).toBe(i === 3);
      });
    }
  });

  it("lights every field on the attack, fails the CRC when hurt and goes dark when fainting", () => {
    for (const view of ["front", "back"] as const) {
      for (const f of TRUNKADILLO[view].attack) {
        TAGGED_FIELDS.forEach((_, b) => expect(lamp(f, view, b)).toBe("m"));
        expect(/v/.test(f.rows.join("")) && /g/.test(f.rows.join(""))).toBe(true);
      }
      for (const f of TRUNKADILLO[view].hurt) {
        const t = f.rows.join("");
        expect(t.includes("r")).toBe(true);
        expect(/[megfv]/.test(t)).toBe(false);
      }
      for (const f of TRUNKADILLO[view].faint) expect(/[megfvr]/.test(f.rows.join(""))).toBe(false);
    }
  });

  it("is Link type, like Framadillo", () => {
    expect(typesOf("trunkadillo")).toEqual(["LINK"]);
  });

  it("packs priority, DEI and the VLAN ID into the tag's TCI", () => {
    expect(DOT1Q.tpid).toBe(0x8100);
    expect(vlanTci(0, 0, 100)).toBe(0x0064);
    expect(vlanTci(5, 0, 10)).toBe(0xa00a);
    expect(vlanTci(7, 1, 4094)).toBe(0xfffe);
    expect(vlanTci(0, 1, 1)).toBe(0x1001);
    expect(() => vlanTci(0, 0, 0)).toThrow(RangeError);
    expect(() => vlanTci(0, 0, 4095)).toThrow(RangeError);
    expect(() => vlanTci(8, 0, 1)).toThrow(RangeError);
  });

  it("keeps the 64-byte minimum (42-byte payload) and allows 1522-byte tagged frames", () => {
    expect(taggedFrame(42)).toMatchObject({ pad: 0, frame: 64, wire: 84 });
    expect(taggedFrame(40)).toMatchObject({ pad: 2, frame: 64 });
    expect(taggedFrame(1500)).toMatchObject({ pad: 0, frame: DOT1Q.maxFrame, wire: 1542 });
    // the tag costs 4 bytes over the untagged frame once no padding is needed
    expect(taggedFrame(1000).frame - ethernetFrame(1000).frame).toBe(4);
    expect(() => taggedFrame(1501)).toThrow(RangeError);
  });
});

describe("Ackorn's sliding-window tail", () => {
  /** Centre pixel of segment `s`'s lamp in an idle frame. */
  const lamp = (f: { rows: string[] }, i: number, s: number) => {
    const pose = { dy: i === 1 || i === 2 ? 1 : 0, tail: [0, 1, 2, 1][i] };
    const [x, y] = lampPositions(pose)[s];
    return f.rows[y + 1][x + 1];
  };
  const STATE_PIXEL = { acked: "a", flight: "m", unsent: "x", lost: "r" } as const;

  it("slides a 3-segment window one ACK per idle frame", () => {
    expect(SEGMENTS).toBe(6);
    expect(WINDOW).toBe(3);
    expect(IDLE_BASE).toEqual([0, 1, 2, 3]);
    // the last frame's window ends on the last segment
    expect(IDLE_BASE[3] + WINDOW).toBe(SEGMENTS);
    expect([0, 1, 2, 3, 4, 5].map((s) => segmentState({ kind: "window", base: 2 }, s))).toEqual(["acked", "acked", "flight", "flight", "flight", "unsent"]);
    expect(segmentState({ kind: "lost", base: 1, lost: 2 }, 2)).toBe("lost");
    expect(segmentState({ kind: "lost", base: 1, lost: 2 }, 3)).toBe("flight");
  });

  it("draws each idle frame's window on the tail", () => {
    for (const view of ["front", "back"] as const)
      ACKORN[view].idle.forEach((f, i) => {
        for (let s = 0; s < SEGMENTS; s++) {
          const want = STATE_PIXEL[segmentState({ kind: "window", base: IDLE_BASE[i] }, s)];
          expect(lamp(f, i, s), `${view} frame ${i} segment ${s}`).toBe(want);
        }
      });
  });

  it("has the whole stream in flight on the attack, a lost segment when hurt and goes dark when fainting", () => {
    for (const view of ["front", "back"] as const) {
      for (const f of ACKORN[view].attack) expect(f.rows.join("")).not.toMatch(/[xar]/);
      for (const f of ACKORN[view].hurt) expect(f.rows.join("").split("r").length - 1).toBe(5);
      for (const f of ACKORN[view].faint) expect(f.rows.join("")).not.toMatch(/[myYacr]/);
    }
  });

  it("is Transport type, so the starters are Link, Network and Transport", () => {
    expect(typesOf("ackorn")).toEqual(["TRANSPORT"]);
  });

  it("caps the window by the sequence-number space (Kurose & Ross)", () => {
    // 3-bit sequence numbers (0–7): Go-Back-N can send 7, Selective Repeat 4.
    expect(maxWindow(3, "GBN")).toBe(7);
    expect(maxWindow(3, "SR")).toBe(4);
    // Stop-and-wait is a 1-bit sequence number with a window of 1.
    expect(maxWindow(1, "GBN")).toBe(1);
    expect(maxWindow(1, "SR")).toBe(1);
    expect(() => maxWindow(0, "SR")).toThrow();
  });

  it("limits throughput to one window per round trip", () => {
    // The classic 64 KB receive window over a 100 ms RTT: about 5.24 Mbps.
    const t = windowThroughput(65535, 0.1, 1e9);
    expect(t.bps).toBeCloseTo(5_242_800, 0);
    expect(t.utilisation).toBeCloseTo(0.0052428, 6);
    // Stop-and-wait, 1 KB frames, 30 ms RTT on a 1 Gbps link (Kurose & Ross 3.4.2: 8000 bits / 30.008 ms ≈ 267 kbps).
    expect(windowThroughput(1000, 0.030008, 1e9).bps).toBeCloseTo(266_595, -1);
    expect(windowThroughput(1e9, 0.01, 1e9).utilisation).toBe(1);
    expect(() => windowThroughput(0, 0.1)).toThrow();
  });
});

describe("Oakwind's congestion-window tail", () => {
  /** Centre pixel of segment `s`'s lamp for a pose. */
  const lamp = (f: { rows: string[] }, pose: { dy?: number; tail?: number }, s: number) => {
    const [x, y] = oakLamps(pose)[s];
    return f.rows[y + 1][x + 1];
  };
  const IDLE_POSE = [0, 1, 2, 3].map((i) => ({ dy: i === 1 || i === 2 ? 1 : 0, tail: [0, 1, 2, 1][i] }));
  const STATE_PIXEL = { flight: "m", unsent: "x", lost: "r" } as const;

  it("puts eight separate lamps on the tail, root to tip", () => {
    expect(OAK_SEGMENTS).toBe(8);
    for (const pose of IDLE_POSE) {
      const ps = oakLamps(pose);
      for (let a = 0; a < ps.length; a++)
        for (let b = a + 1; b < ps.length; b++) expect(Math.max(Math.abs(ps[a][0] - ps[b][0]), Math.abs(ps[a][1] - ps[b][1]))).toBeGreaterThanOrEqual(4);
    }
  });

  it("idles through slow start: the window doubles every round trip", () => {
    expect(CWND_IDLE).toEqual([1, 2, 4, 8]);
    expect(cwndTrace(4, { ssthresh: 64, variant: "reno" }).map((r) => r.cwnd)).toEqual(CWND_IDLE);
    for (const view of ["front", "back"] as const)
      OAKWIND[view].idle.forEach((f, i) => {
        for (let s = 0; s < OAK_SEGMENTS; s++) expect(lamp(f, IDLE_POSE[i], s), `${view} frame ${i} segment ${s}`).toBe(s < CWND_IDLE[i] ? "m" : "x");
      });
  });

  it("sends the whole window on the attack, halves it around a lost segment when hurt and goes dark when fainting", () => {
    const lost = { kind: "lost", cwnd: 4, lost: HURT_LOST } as const;
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((s) => oakState(lost, s))).toEqual(["flight", "flight", "flight", "flight", "lost", "unsent", "unsent", "unsent"]);
    for (const view of ["front", "back"] as const) {
      const poses = { attack: [{ tail: -2 }, { tail: 3 }], hurt: [{ tail: -1 }, {}], faint: [{ dy: 2, tail: -1 }, { dy: 3, tail: -2 }] };
      OAKWIND[view].attack.forEach((f, i) => {
        for (let s = 0; s < OAK_SEGMENTS; s++) expect(lamp(f, poses.attack[i], s)).toBe("m");
      });
      OAKWIND[view].hurt.forEach((f, i) => {
        for (let s = 0; s < OAK_SEGMENTS; s++) expect(lamp(f, poses.hurt[i], s), `${view} hurt ${i} segment ${s}`).toBe(STATE_PIXEL[oakState(lost, s)]);
      });
      for (const f of OAKWIND[view].faint) expect(/[myYr]/.test(f.rows.join(""))).toBe(false);
    }
  });

  it("is Transport type, like Ackorn", () => {
    expect(typesOf("oakwind")).toEqual(["TRANSPORT"]);
  });

  it("traces Kurose & Ross's Reno example: slow start to ssthresh 8, then a triple duplicate ACK at cwnd 12", () => {
    const reno = cwndTrace(12, { ssthresh: 8, variant: "reno", events: { 8: "3dup" } });
    expect(reno.map((r) => r.cwnd)).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 9, 10, 11, 12]);
    // once cwnd reaches ssthresh (round 4) it grows linearly
    expect(reno.slice(0, 3).every((r) => r.phase === "slow start")).toBe(true);
    expect(reno.slice(3).every((r) => r.phase === "congestion avoidance")).toBe(true);
    expect(reno[8].ssthresh).toBe(6);
  });

  it("drops to 1 MSS on a Tahoe triple duplicate ACK and on any timeout, and slow-starts back to the new ssthresh", () => {
    const tahoe = cwndTrace(14, { ssthresh: 8, variant: "tahoe", events: { 8: "3dup" } });
    expect(tahoe.map((r) => r.cwnd)).toEqual([1, 2, 4, 8, 9, 10, 11, 12, 1, 2, 4, 6, 7, 8]);
    const timeout = cwndTrace(10, { ssthresh: 8, variant: "reno", events: { 8: "timeout" } });
    expect(timeout.slice(8).map((r) => r.cwnd)).toEqual([1, 2]);
    // ssthresh never drops below 2 MSS
    expect(cwndTrace(3, { ssthresh: 8, variant: "reno", events: { 2: "3dup" } })[2]).toMatchObject({ cwnd: 5, ssthresh: 2 });
    expect(() => cwndTrace(0, { ssthresh: 8, variant: "reno" })).toThrow(RangeError);
  });
});

describe("Spantoise's shell", () => {
  it("is a spanning tree: seven switches, six tree links, one root", () => {
    expect(PLATES).toHaveLength(7);
    expect(PLATES.filter((p) => p.parent === null).map((p) => p.id)).toEqual(["R"]);
    const ids = new Set(PLATES.map((p) => p.id));
    for (const p of PLATES) if (p.parent) expect(ids.has(p.parent)).toBe(true);
    // every plate reaches the root, so the tree is connected and loop-free
    for (const p of PLATES) expect(depth(p.id)).toBeLessThan(PLATES.length);
    expect(PLATES.filter((p) => p.parent)).toHaveLength(PLATES.length - 1);
  });

  it("blocks only redundant links, never a tree link", () => {
    const tree = new Set(PLATES.filter((p) => p.parent).flatMap((p) => [`${p.parent}-${p.id}`, `${p.id}-${p.parent}`]));
    for (const [a, b] of BLOCKED) expect(tree.has(`${a}-${b}`)).toBe(false);
  });

  it("idles as a BPDU spreading from the root, one hop deeper per frame", () => {
    expect(litPlates(0)).toEqual(["R"]);
    expect(litPlates(1)).toEqual(["R", "A", "B", "C"]);
    expect(litPlates(2)).toHaveLength(7);
    for (const view of [SPANTOISE.front, SPANTOISE.back]) {
      const lit = view.idle.map((f) => (f.rows.join("").match(/y/g) ?? []).length);
      expect(lit[0]).toBeLessThan(lit[1]);
      expect(lit[1]).toBeLessThan(lit[2]);
      // hurt and faint frames go dark
      for (const f of view.faint) expect(f.rows.join("")).not.toMatch(/c/);
    }
  });
});

describe("Areadon's OSPF rings", () => {
  it("computes OSPF cost as reference bandwidth over link bandwidth", () => {
    expect(ospfCost(10)).toBe(10);
    expect(ospfCost(100)).toBe(1);
    expect(ospfCost(1000)).toBe(1); // faster than the reference still costs 1
    expect(ospfCost(1.544)).toBe(64); // T1, the classic Cisco default of 64
    expect(ospfCost(1000, 10000)).toBe(10); // reference raised to 10 Gbps
    expect(() => ospfCost(0)).toThrow(RangeError);
  });

  it("has a backbone ring and two areas, each linked to the backbone", () => {
    expect(RINGS.map((g) => g.area)).toEqual([0, 1, 2]);
    expect(Object.keys(LINK_MBPS).map(Number)).toEqual([1, 2]);
  });

  it("floods the backbone first, then each area", () => {
    expect(litAreas(-1)).toEqual([]);
    expect(litAreas(0)).toEqual([0]);
    expect(litAreas(1)).toEqual([0, 1]);
    expect(litAreas(3)).toEqual([0, 1, 2]);
    for (const view of [AREADON.front, AREADON.back]) {
      const lit = view.idle.map((f) => (f.rows.join("").match(/y/g) ?? []).length);
      expect(lit[0]).toBeLessThan(lit[1]);
      expect(lit[1]).toBeLessThan(lit[2]);
      expect(lit[2]).toBeLessThan(lit[3]); // costs appear last
    }
  });

  it("draws cost digits in a 3x5 font", () => {
    expect(digitRows(10)[0]).toHaveLength(7);
    expect(digitRows(1)).toEqual([".y.", "yy.", ".y.", ".y.", "yyy"]);
  });
});

describe("Nattopus's address tags", () => {
  it("translates private inside locals to one shared public inside global (PAT)", () => {
    expect(NAT_TABLE).toHaveLength(TAG_POS.length);
    for (const e of NAT_TABLE) {
      expect(isPrivate(parseIp(e.insideLocal.split(":")[0]))).toBe(true);
      expect(isPrivate(parseIp(e.insideGlobal.split(":")[0]))).toBe(false);
    }
    expect(new Set(NAT_TABLE.map((e) => e.insideGlobal.split(":")[0])).size).toBe(1);
    // overload: the source ports tell the flows apart
    expect(new Set(NAT_TABLE.map((e) => e.insideLocal.split(":")[1])).size).toBe(NAT_TABLE.length);
  });

  it("translates the arms one after another", () => {
    expect(translatedArms(-1)).toEqual([]);
    expect(translatedArms(0)).toEqual([]);
    expect(translatedArms(2)).toEqual([0, 1]);
    expect(translatedArms(4)).toEqual([0, 1, 2, 3]);
  });

  it("draws 7x7 L, G and dark tag plates", () => {
    for (const k of ["L", "G", "dark"] as const) {
      const rows = tagRows(k);
      expect(rows).toHaveLength(7);
      for (const row of rows) expect(row).toHaveLength(7);
    }
    expect(tagRows("L")[3]).not.toBe(tagRows("G")[3]);
  });

  it("shows more cyan global plates each idle frame, and none when hurt or fainted", () => {
    for (const view of [NATTOPUS.front, NATTOPUS.back]) {
      const cyan = view.idle.map((f) => (f.rows.join("").match(/c/g) ?? []).length);
      for (let i = 1; i < cyan.length; i++) expect(cyan[i]).toBeGreaterThan(cyan[i - 1]);
      expect(cyan[0]).toBe(0);
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/c/);
    }
  });
});

describe("Aclaw's access list", () => {
  it("evaluates the probes first-match-wins, falling through to the implicit deny", () => {
    expect(ACL_LINES).toHaveLength(3);
    expect(PROBES.map((_, i) => probeResult(i))).toEqual([
      { line: 0, action: "permit" },
      { line: 1, action: "deny" },
      { line: 2, action: "permit" },
      { line: IMPLICIT_LINE, action: "deny" },
    ]);
    expect(BAR_Y).toHaveLength(IMPLICIT_LINE + 1);
  });

  it("draws 21x3 lamp bars (implicit deny dashed) and 9x7 claw badges", () => {
    for (let l = 0; l <= IMPLICIT_LINE; l++) for (const s of ["lit", "dim", "dark"] as const) {
      const rows = lampBar(l, s);
      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row).toHaveLength(21);
    }
    expect(lampBar(IMPLICIT_LINE, "lit")[0]).toContain(".");
    expect(lampBar(0, "lit")[0]).not.toContain(".");
    for (const k of ["permit", "deny"] as const) for (const s of ["lit", "dim", "dark"] as const) {
      const rows = clawBadge(k, s);
      expect(rows).toHaveLength(7);
      for (const row of rows) expect(row).toHaveLength(9);
    }
    expect(clawBadge("permit", "lit")[3]).not.toBe(clawBadge("deny", "lit")[3]);
  });

  it("lights the matching claw and line in each idle frame, and everything on the attack", () => {
    for (const view of [ACLAW.front, ACLAW.back]) {
      view.idle.forEach((f, i) => {
        const text = f.rows.join("");
        const res = probeResult(i);
        // the winning claw is lit (bright fill), the other dim
        expect(text.includes("g") && text.includes("r"), `frame ${i}`).toBe(true);
        expect(res.action === "permit" ? /H/.test(text) : /Q/.test(text)).toBe(true);
      });
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/[grGRHQ]/);
      for (const f of view.attack) expect(f.rows.join("")).toMatch(/H[\s\S]*Q|Q[\s\S]*H/);
    }
  });
});

describe("Hashorn's hash ring", () => {
  it("places three servers with three virtual nodes each, sorted around the ring", () => {
    expect(NODES).toHaveLength(3);
    expect(RING).toHaveLength(NODES.length * VNODES);
    for (const n of NODES) expect(RING.filter((p) => p.node === n)).toHaveLength(VNODES);
    for (let i = 1; i < RING.length; i++) expect(RING[i].pos).toBeGreaterThanOrEqual(RING[i - 1].pos);
    expect(RING_R).toBeGreaterThan(0);
  });

  it("sends each key to the first bead clockwise at or after its hash, wrapping around", () => {
    KEYS.forEach((k, i) => {
      const bead = RING[ownerBead(i)];
      expect(bead.node).toBe(ownerOf(i));
      expect(bead.node).toBe(ringLookup(RING, k));
      const h = keyPos(i);
      if (ownerBead(i) === 0) expect(h > RING[RING.length - 1].pos || h <= RING[0].pos).toBe(true);
      else {
        expect(bead.pos).toBeGreaterThanOrEqual(h);
        expect(RING[ownerBead(i) - 1].pos).toBeLessThan(h);
      }
      expect(angleOf(h)).toBeGreaterThanOrEqual(0);
      expect(angleOf(h)).toBeLessThan(Math.PI * 2);
    });
  });

  it("uses keys that land on distinct beads and all three servers", () => {
    expect(new Set(KEYS.map((_, i) => ownerBead(i))).size).toBe(KEYS.length);
    expect(new Set(KEYS.map((_, i) => ownerOf(i)))).toEqual(new Set(NODES));
  });

  it("draws 5x5 beads", () => {
    for (const n of NODES) for (const s of ["lit", "dim", "dark"] as const) {
      const rows = beadRows(n, s);
      expect(rows).toHaveLength(5);
      for (const row of rows) expect(row).toHaveLength(5);
    }
  });

  it("shows the key and lit bead in idle, flares every bead on the attack, and goes dark when hurt or fainted", () => {
    for (const view of [HASHORN.front, HASHORN.back]) {
      view.idle.forEach((f, i) => {
        const text = f.rows.join("");
        expect(text.includes("y"), `frame ${i}`).toBe(true);
        expect(text).toMatch(/[APC]/);
      });
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/[AaCcPpy]/);
      for (const f of view.attack) expect(f.rows.join("")).toMatch(/A[\s\S]*C[\s\S]*P|P[\s\S]*C[\s\S]*A|A[\s\S]*P[\s\S]*C|C[\s\S]*A[\s\S]*P|C[\s\S]*P[\s\S]*A|P[\s\S]*A[\s\S]*C/);
    }
  });
});

describe("Spineback's leaf-spine fabric", () => {
  it("matches the leaf-spine formulas: every leaf reaches every other leaf in two hops, one path per spine", () => {
    expect(LEAVES).toBe(4);
    expect(SPINES).toBe(2);
    expect(FABRIC).toEqual({ downPerLeaf: 6, leaves: 4, servers: 24, pathsBetweenLeaves: 2 });
    expect(FABRIC.leaves).toBe(LEAVES);
    expect(FABRIC.pathsBetweenLeaves).toBe(SPINES);
    expect(LINKS).toBe(8);
    expect(leafHops(0, 3)).toBe(2);
    expect(leafHops(1, 1)).toBe(0);
  });

  it("draws every leaf-spine link, from the leaf plate up to the spine sail", () => {
    expect(LEAF_X).toHaveLength(LEAVES);
    expect(SPINE_X).toHaveLength(SPINES);
    for (let l = 0; l < LEAVES; l++) for (let s = 0; s < SPINES; s++) {
      const px = linkPixels(l, s);
      expect(px[0][0]).toBe(LEAF_X[l]);
      expect(px[0][1]).toBeGreaterThan(SPINE_Y);
      expect(px[px.length - 1][0]).toBe(SPINE_X[s]);
      expect(px[0][1]).toBeLessThan(LEAF_Y);
    }
  });

  it("hashes each flow onto one spine (ECMP) deterministically, and the idle flows use both spines", () => {
    for (const f of FLOWS) {
      expect(f.src).not.toBe(f.dst);
      expect(ecmpSpine(f)).toBe(ecmpSpine({ ...f }));
      expect(ecmpSpine(f)).toBeGreaterThanOrEqual(0);
      expect(ecmpSpine(f)).toBeLessThan(SPINES);
    }
    expect(new Set(FLOWS.map((f) => ecmpSpine(f)))).toEqual(new Set([0, 1]));
    expect(ecmpSpine(FLOWS[0], 1)).toBe(0);
  });

  it("draws 9x5 plates", () => {
    for (const k of ["leaf", "spine"] as const) for (const s of ["lit", "dim", "dark"] as const) {
      const rows = plateRows(k, s);
      expect(rows).toHaveLength(5);
      for (const row of rows) expect(row).toHaveLength(9);
    }
  });

  it("lights the ECMP path in idle (packet, amber link, sail), the whole fabric on the attack, and nothing when hurt or fainted", () => {
    for (const view of [SPINEBACK.front, SPINEBACK.back]) {
      view.idle.forEach((f, i) => {
        const text = f.rows.join("");
        expect(text.includes("y"), `frame ${i}`).toBe(true);
        expect(text.includes("A"), `frame ${i}`).toBe(true);
        expect(text.includes("P"), `frame ${i}`).toBe(true);
      });
      for (const f of [...view.hurt, ...view.faint]) expect(f.rows.join("")).not.toMatch(/[AaPpSsy]/);
      for (const f of view.attack) expect(f.rows.join("")).toMatch(/A[\s\S]*P|P[\s\S]*A/);
    }
  });
});
