import { describe, expect, it } from "vitest";
import { ANIMS } from "@/game/art/creature";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { CIDRAB } from "@/game/art/creatures/cidrab";
import { HOOTPATH, NODE_POS, ROUTE_LINKS, ROUTE_NODES, dijkstra } from "@/game/art/creatures/hootpath";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { STACKADON } from "@/game/art/creatures/stackadon";
import { TRACEVIX } from "@/game/art/creatures/tracevix";
import { Painter } from "@/lib/paint";
import { parseSprite, silhouette } from "@/lib/pixel";

const CREATURES = [PINGKIT, TRACEVIX, BRAIDWYRM, STACKADON, CIDRAB, HOOTPATH];

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
  for (const boss of [BRAIDWYRM, STACKADON, CIDRAB, HOOTPATH])
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
