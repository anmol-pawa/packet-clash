import type { SpriteDef } from "@/lib/pixel";

/**
 * Move-effect sprites. The basic attack is a packet: a sealed envelope with a
 * header stripe that flies across the field, then bursts into a 3-frame spark.
 */
const FX = { o: "#1a1433", W: "#ffffff", F: "#fff6d6", f: "#f7d77a", g: "#d9a441", h: "#ff4f7b", Y: "#ffe57a", y: "#ffb43b", r: "#ff6a3d" };

export const PACKET: SpriteDef = {
  palette: FX,
  rows: [
    "oooooooooooo",
    "ohhhhhhhhhho",
    "oFgFFFFFFgfo",
    "oFFgFFFFgffo",
    "oFFFggggfffo",
    "offfffffffgo",
    "oggggggggggo",
    "oooooooooooo",
  ],
};

export const SPARK: SpriteDef[] = [
  {
    palette: FX,
    rows: [
      ".............",
      ".............",
      ".............",
      "......Y......",
      ".....YWY.....",
      "....YWWWY....",
      "...YWWWWWY...",
      "....YWWWY....",
      ".....YWY.....",
      "......Y......",
      ".............",
      ".............",
      ".............",
    ],
  },
  {
    palette: FX,
    rows: [
      "......Y......",
      "......Y......",
      "..Y...y...Y..",
      "...Y..Y..Y...",
      "....yYWYy....",
      ".....WWW.....",
      "YYyYWWWWWYyYY",
      ".....WWW.....",
      "....yYWYy....",
      "...Y..Y..Y...",
      "..Y...y...Y..",
      "......Y......",
      "......Y......",
    ],
  },
  {
    palette: FX,
    rows: [
      "y.....r.....y",
      ".r.........r.",
      "..y.......y..",
      ".............",
      "......y......",
      ".....y.y.....",
      "r...y...y...r",
      ".....y.y.....",
      "......y......",
      ".............",
      "..y.......y..",
      ".r.........r.",
      "y.....r.....y",
    ],
  },
];
