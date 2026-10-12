import { Container, Sprite, Texture } from "pixi.js";
import { parseSprite, type SpriteDef } from "@/lib/pixel";

const cache = new WeakMap<SpriteDef, { color?: Texture; white?: Texture }>();

/** A nearest-neighbour texture for one sprite frame (cached). `white` gives a solid silhouette for hurt/evolve flashes. */
export function pixelTexture(def: SpriteDef, white = false): Texture {
  let entry = cache.get(def);
  if (!entry) cache.set(def, (entry = {}));
  const key = white ? "white" : "color";
  const hit = entry[key];
  if (hit) return hit;
  const grid = parseSprite(def);
  const c = document.createElement("canvas");
  c.width = grid.width;
  c.height = grid.height;
  const g = c.getContext("2d")!;
  grid.pixels.forEach((col, i) => {
    if (!col) return;
    g.fillStyle = white ? "#ffffff" : col;
    g.fillRect(i % grid.width, Math.floor(i / grid.width), 1, 1);
  });
  const tex = Texture.from(c);
  tex.source.scaleMode = "nearest";
  entry[key] = tex;
  return tex;
}

/**
 * A pixel creature on the stage: frame-cycling sprite plus a white silhouette
 * overlay (`flash`). Anchored at bottom centre so `position` is where its feet
 * touch the platform. `body` is what attack/hurt tweens move.
 */
export class PixelActor {
  readonly root = new Container();
  readonly body = new Container();
  private sprite: Sprite;
  private white: Sprite;
  private frame = 0;
  private acc = 0;
  homeX = 0;
  homeY = 0;

  constructor(
    private frames: SpriteDef[],
    scale: number,
    private fps = 3,
    facing: 1 | -1 = 1,
  ) {
    this.sprite = new Sprite(pixelTexture(frames[0]));
    this.white = new Sprite(pixelTexture(frames[0], true));
    for (const s of [this.sprite, this.white]) {
      s.anchor.set(0.5, 1);
      s.scale.set(scale * facing, scale);
      s.roundPixels = true;
    }
    this.white.alpha = 0;
    this.body.addChild(this.sprite, this.white);
    this.root.addChild(this.body);
  }

  get flash() {
    return this.white.alpha;
  }
  set flash(v: number) {
    this.white.alpha = v;
  }

  get height() {
    return this.sprite.height;
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 1 / this.fps) return;
    this.acc %= 1 / this.fps;
    this.frame = (this.frame + 1) % this.frames.length;
    this.sprite.texture = pixelTexture(this.frames[this.frame]);
    this.white.texture = pixelTexture(this.frames[this.frame], true);
  }
}
