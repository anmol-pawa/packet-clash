import { Container, Sprite, Texture } from "pixi.js";
import { parseSprite, type SpriteDef } from "@/lib/pixel";
import type { AnimName, AnimSet } from "@/game/art/creature";

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
 * A pixel creature on the stage: a frame-animated sprite plus a white
 * silhouette overlay (`flash`). Anchored at bottom centre so `position` is
 * where its feet touch the platform. `body` is what attack/hurt tweens move.
 *
 * The idle animation loops; `play()` runs another animation once and then
 * returns to idle (except `faint`, which holds its last frame).
 */
export class PixelActor {
  readonly root = new Container();
  readonly body = new Container();
  private sprite: Sprite;
  private white: Sprite;
  private anim: AnimName = "idle";
  private frame = 0;
  private acc = 0;
  private frameDur: number;
  private done: (() => void) | null = null;
  private silhouetteOnly = false;
  homeX = 0;
  homeY = 0;

  constructor(
    private anims: AnimSet,
    scale: number,
    private fps = 3,
    facing: 1 | -1 = 1,
  ) {
    this.frameDur = 1 / fps;
    this.sprite = new Sprite(pixelTexture(anims.idle[0]));
    this.white = new Sprite(pixelTexture(anims.idle[0], true));
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

  /** The first idle frame of the current creature (what evolution morphs from). */
  get idleFrame(): SpriteDef {
    return this.anims.idle[0];
  }

  get current(): AnimName {
    return this.anim;
  }

  /** Plays `name` once at `frameDur` seconds per frame; resolves when it ends. */
  play(name: AnimName, frameDur = 0.12): Promise<void> {
    this.done?.();
    this.anim = name;
    this.frame = 0;
    this.acc = 0;
    this.frameDur = frameDur;
    this.show();
    return new Promise((resolve) => (this.done = resolve));
  }

  /** Swaps in another creature's animations (evolution) and restarts its idle loop. */
  setAnims(anims: AnimSet, fps: number) {
    this.anims = anims;
    this.fps = fps;
    this.anim = "idle";
    this.frame = 0;
    this.acc = 0;
    this.frameDur = 1 / fps;
    this.show();
  }

  /**
   * Shows only a white silhouette `def` (already white, e.g. an evolve morph
   * frame) in place of the creature; `null` brings the coloured sprite back.
   */
  showSilhouette(def: SpriteDef | null) {
    this.silhouetteOnly = !!def;
    this.sprite.alpha = def ? 0 : 1;
    if (def) {
      this.white.texture = pixelTexture(def);
      this.white.alpha = 1;
    } else this.show();
  }

  private show() {
    if (this.silhouetteOnly) return;
    const f = this.anims[this.anim][this.frame];
    this.sprite.texture = pixelTexture(f);
    this.white.texture = pixelTexture(f, true);
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < this.frameDur) return;
    this.acc %= this.frameDur;
    const frames = this.anims[this.anim];
    if (this.anim === "idle") {
      this.frame = (this.frame + 1) % frames.length;
    } else if (this.frame < frames.length - 1) {
      this.frame++;
    } else {
      const finished = this.done;
      this.done = null;
      if (this.anim !== "faint") {
        this.anim = "idle";
        this.frame = 0;
        this.frameDur = 1 / this.fps;
      }
      finished?.();
      if (this.anim === "faint") return;
    }
    this.show();
  }
}
