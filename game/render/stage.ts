/**
 * BattleStage — the PixiJS battle field, drawn at a GBA-like logical
 * resolution (256×192) and scaled to fit. It owns the renderer, the pixel
 * background, both creatures, the effects layers and the camera, and exposes a
 * small promise-based API that the React battle screen drives:
 *
 *   await stage.intro()
 *   await stage.attack("player", 24, false)
 *   await stage.faint("foe")
 */
import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { PACKET, SPARK } from "@/game/art/effects";
import type { AnimSet } from "@/game/art/creature";
import { Camera } from "./fx";
import { Particles } from "./particles";
import { PixelActor, pixelTexture } from "./pixelTex";
import { Tweener, ease } from "./tween";

export const W = 256;
export const H = 192;
const HORIZON = 92;

export type Side = "player" | "foe";

/** A creature's animations as drawn on the stage, at an integer scale. */
export interface FighterArt {
  anims: AnimSet;
  scale: number;
  fps: number;
}

export interface StageOptions {
  player: FighterArt;
  foe: FighterArt;
  reducedMotion: boolean;
  /** Pixel display font family (resolved next/font name). */
  font: string;
}

/** Deterministic PRNG so the background looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export class BattleStage {
  private app = new Application();
  private fit = new Container();
  private camera = new Container();
  private bg = new Container();
  private fighters = new Container();
  private fxLayer = new Container();
  private top = new Container();
  private flashRect = new Graphics();
  private wipe = new Graphics();
  private leds: Graphics[] = [];
  private clouds: Graphics[] = [];
  private tw = new Tweener();
  private fx = new Particles();
  private cam!: Camera;
  private player!: PixelActor;
  private foe!: PixelActor;
  private t = 0;
  private scale = 1;
  private destroyed = false;

  private constructor(private opts: StageOptions) {}

  static async create(host: HTMLElement, opts: StageOptions): Promise<BattleStage> {
    const s = new BattleStage(opts);
    await s.app.init({
      resizeTo: host,
      background: 0x141029,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: "webgl",
    });
    host.appendChild(s.app.canvas);
    Object.assign(s.app.canvas.style, { width: "100%", height: "100%", display: "block" });
    s.app.canvas.classList.add("pixelated");
    s.build();
    s.app.renderer.on("resize", () => s.layout());
    s.layout();
    s.app.ticker.add((tk) => s.frame(Math.min(0.05, tk.deltaMS / 1000)));
    return s;
  }

  /* ------------------------------------------------------------ scene */

  private build() {
    this.fx.scale = this.opts.reducedMotion ? 0.35 : 1;
    this.drawBackground();

    this.player = new PixelActor(this.opts.player.anims, this.opts.player.scale, this.opts.player.fps, 1);
    this.player.homeX = 68;
    this.player.homeY = 166;
    this.foe = new PixelActor(this.opts.foe.anims, this.opts.foe.scale, this.opts.foe.fps, -1);
    this.foe.homeX = 190;
    this.foe.homeY = 102;
    for (const a of [this.player, this.foe]) a.root.position.set(a.homeX, a.homeY);
    this.fighters.addChild(this.foe.root, this.player.root);

    this.fxLayer.blendMode = "add";
    this.camera.addChild(this.bg, this.fighters, this.fx.container, this.fxLayer, this.top);
    this.fit.addChild(this.camera);

    this.flashRect.rect(0, 0, 16, 16).fill({ color: 0xffffff });
    this.flashRect.alpha = 0;
    this.app.stage.addChild(this.fit, this.flashRect, this.wipe);

    this.cam = new Camera(this.camera, this.flashRect, () => this.opts.reducedMotion);
    this.cam.focus = { x: W / 2, y: H / 2 };

    // Hidden until intro(): creatures off-stage, wipe bars closed.
    this.player.body.x = -200;
    this.foe.body.x = 200;
    this.wipeK = 0;
  }

  /** Background: banded sky, clouds, hills with relay towers, grass and two platforms. */
  private drawBackground() {
    const g = new Graphics();
    const r = rng(7);
    const X0 = -128;
    const X1 = W + 128;
    // sky: hard colour steps, like a limited palette
    const bands: [number, number][] = [
      [-64, 0x3a7fd5],
      [14, 0x4f95e2],
      [30, 0x6aaceb],
      [46, 0x8cc4f1],
      [60, 0xb3dbf5],
    ];
    bands.forEach(([y], i) => {
      const y1 = i + 1 < bands.length ? bands[i + 1][0] : HORIZON;
      g.rect(X0, y, X1 - X0, y1 - y).fill({ color: bands[i][1] });
    });
    // dithered band edges
    for (let i = 1; i < bands.length; i++) {
      for (let x = X0; x < X1; x += 4) g.rect(x + ((i % 2) * 2), bands[i][0] - 1, 2, 1).fill({ color: bands[i][1] });
    }
    this.bg.addChild(g);

    // clouds drift slowly (separate objects)
    for (let i = 0; i < 4; i++) {
      const c = new Graphics();
      const w = 22 + Math.floor(r() * 18);
      c.rect(4, 0, w - 8, 3).fill({ color: 0xffffff });
      c.rect(0, 3, w, 4).fill({ color: 0xffffff });
      c.rect(2, 7, w - 4, 2).fill({ color: 0xd6ebfa });
      c.position.set(Math.floor(X0 + r() * (X1 - X0)), 8 + Math.floor(r() * 36));
      this.clouds.push(c);
      this.bg.addChild(c);
    }

    const land = new Graphics();
    // far hills (stepped silhouettes)
    const hill = (base: number, amp: number, col: number, top: number, seed: number) => {
      const rr = rng(seed);
      let h = amp / 2;
      for (let x = X0; x < X1; x += 4) {
        h = Math.max(4, Math.min(amp, h + Math.floor((rr() - 0.5) * 6)));
        land.rect(x, base - h, 4, h).fill({ color: col });
        land.rect(x, base - h, 4, 1).fill({ color: top });
      }
    };
    hill(HORIZON, 26, 0x7fb4c9, 0x9fcadb, 3);
    hill(HORIZON, 14, 0x5f9b74, 0x7dbb86, 11);

    // relay towers: lattice masts with a blinking LED
    for (const [tx, th] of [
      [24, 44],
      [118, 34],
      [236, 40],
    ] as const) {
      const base = HORIZON;
      land.rect(tx - 1, base - th, 2, th).fill({ color: 0x45506e });
      for (let y = base - th + 4; y < base; y += 5) {
        land.rect(tx - 3, y, 6, 1).fill({ color: 0x5c6889 });
        land.rect(tx - 3 + ((y / 5) % 2 ? 4 : 0), y + 1, 2, 3).fill({ color: 0x45506e });
      }
      land.rect(tx - 4, base - th + 2, 8, 2).fill({ color: 0x2c3350 });
      const led = new Graphics();
      led.rect(tx - 1, base - th - 3, 2, 2).fill({ color: 0xff4f7b });
      this.leds.push(led);
    }

    // ground: grass rows with tufts
    const grass = [0x7cc96b, 0x67b65c, 0x58a352, 0x4b9249];
    for (let i = 0; i < grass.length; i++) {
      const y0 = HORIZON + i * 26;
      land.rect(X0, y0, X1 - X0, i === grass.length - 1 ? 200 : 26).fill({ color: grass[i] });
    }
    const tuft = rng(21);
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(X0 + tuft() * (X1 - X0));
      const y = Math.floor(HORIZON + 4 + tuft() * (H - HORIZON));
      land.rect(x, y, 1, 2).fill({ color: 0x3d7d3e });
      land.rect(x + 2, y - 1, 1, 3).fill({ color: 0x3d7d3e });
      land.rect(x + 1, y, 1, 1).fill({ color: 0x9fe08a });
    }

    // platforms: pixel ellipses with a lit rim and a shaded underside
    this.platform(land, 190, 97, 50, 10);
    this.platform(land, 68, 164, 56, 11);

    this.bg.addChild(land, ...this.leds);
  }

  private platform(g: Graphics, cx: number, cy: number, rx: number, ry: number) {
    const ellipse = (oy: number, shade: (dy: number) => number) => {
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
        g.rect(cx - half - 1, cy + oy + dy, half * 2 + 2, 1).fill({ color: 0x24402a });
        g.rect(cx - half, cy + oy + dy, half * 2, 1).fill({ color: shade(dy) });
      }
    };
    // soil rim (offset down), then the grassy top with a lit back edge
    ellipse(3, (dy) => (dy > ry * 0.5 ? 0x5a3b26 : 0x7a5434));
    ellipse(0, (dy) => (dy < -ry * 0.55 ? 0xb4e58a : dy < ry * 0.2 ? 0x8fcf6c : 0x6fae58));
  }

  /* ----------------------------------------------------------- layout */

  private wipeK = 0;

  private layout() {
    const { width, height } = this.app.screen;
    this.scale = Math.min(width / W, height / H);
    this.fit.scale.set(this.scale);
    this.fit.position.set(Math.round(width / 2 - (W / 2) * this.scale), Math.round(height / 2 - (H / 2) * this.scale));
    this.flashRect.width = width;
    this.flashRect.height = height;
    this.drawWipe();
  }

  /** Intro wipe: black bars that slide open from the middle (k=0 closed, 1 open). */
  private drawWipe() {
    const { width, height } = this.app.screen;
    const k = this.wipeK;
    const g = this.wipe;
    g.clear();
    if (k >= 1) return;
    const bars = 8;
    const bh = height / bars;
    for (let i = 0; i < bars; i++) {
      const dir = i % 2 ? 1 : -1;
      const off = k * width * dir;
      g.rect(off, Math.floor(i * bh), width, Math.ceil(bh) + 1).fill({ color: 0x0b0818 });
    }
  }

  private frame(realDt: number) {
    if (this.destroyed) return;
    const dt = this.cam.update(realDt);
    this.t += realDt;
    this.tw.update(dt);
    this.fx.update(dt);
    this.player.update(dt);
    this.foe.update(dt);
    // idle bob (2 px steps) once settled
    this.player.root.y = this.player.homeY - (Math.floor(this.t * 3) % 2);
    this.foe.root.y = this.foe.homeY - (Math.floor(this.t * 3 + 1) % 2);
    for (const c of this.clouds) {
      c.x += realDt * 3;
      if (c.x > W + 128) c.x = -170;
    }
    this.leds.forEach((l, i) => (l.alpha = Math.floor(this.t * 1.5 + i * 0.7) % 2 ? 1 : 0.25));
    this.drawWipe();
  }

  /* -------------------------------------------------------------- API */

  private actor(side: Side) {
    return side === "player" ? this.player : this.foe;
  }

  /** Screen wipe + flash, then both creatures slide in. */
  async intro() {
    this.cam.flash(0.9, 0xffffff);
    await this.tw.run(0.55, (k) => (this.wipeK = k), ease.inOutCubic);
    await Promise.all([this.tw.to(this.foe.body, { x: 0 }, 0.6, ease.outCubic), this.tw.to(this.player.body, { x: 0 }, 0.6, ease.outCubic)]);
  }

  /** `side` uses a move on the other side: lunge, packet flies, spark + shake + damage number. */
  async attack(side: Side, damage: number, crit: boolean, onHit?: () => void) {
    const me = this.actor(side);
    const them = this.actor(side === "player" ? "foe" : "player");
    const dir = side === "player" ? 1 : -1;
    // wind-up + lunge
    me.play("attack", 0.14);
    await this.tw.to(me.body, { x: -4 * dir }, 0.1, ease.outQuad);
    await this.tw.to(me.body, { x: 10 * dir }, 0.08, ease.inQuad);
    this.tw.to(me.body, { x: 0 }, 0.25, ease.outCubic);

    const from = { x: me.homeX + 18 * dir, y: me.homeY - me.height * 0.55 };
    const to = { x: them.homeX, y: them.homeY - them.height * 0.5 };
    const pkt = new Sprite(pixelTexture(PACKET));
    pkt.anchor.set(0.5);
    pkt.roundPixels = true;
    pkt.scale.set(side === "player" ? 1.5 : 1.25);
    this.top.addChild(pkt);
    await this.tw.run(
      0.42,
      (k) => {
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 18;
        pkt.position.set(Math.round(x), Math.round(y));
        pkt.rotation = Math.round(Math.sin(k * Math.PI * 4) * 2) * 0.1;
        if (Math.random() < 0.7 * this.fx.scale) this.fx.emit({ x, y, vx: -dir * 20, vy: (Math.random() - 0.5) * 20, size: 3, life: 0.3, color: 0xffd257 });
      },
      ease.inQuad,
    );
    pkt.destroy();
    onHit?.();
    this.impact(them, to, damage, crit, side === "player" ? 0xffffff : 0xff6a6a);
    await this.tw.wait(0.6);
  }

  private impact(target: PixelActor, at: { x: number; y: number }, damage: number, crit: boolean, num: number) {
    // spark: 3-frame sprite animation
    const spark = new Sprite(pixelTexture(SPARK[0]));
    spark.anchor.set(0.5);
    spark.scale.set(crit ? 3 : 2);
    spark.position.set(at.x, at.y);
    this.top.addChild(spark);
    let f = 0;
    const step = () => {
      f++;
      if (f >= SPARK.length) return spark.destroy();
      spark.texture = pixelTexture(SPARK[f]);
      this.tw.wait(0.07).then(step);
    };
    this.tw.wait(0.07).then(step);
    this.fx.burst(at.x, at.y, { count: crit ? 22 : 12, speed: 90, size: 3, life: 0.4, color: 0xffd257 });

    // hurt: hurt frames, white flash blinks + recoil
    if (target.current !== "faint") target.play("hurt", 0.16);
    const dir = target === this.foe ? 1 : -1;
    (async () => {
      for (let i = 0; i < 3; i++) {
        target.flash = 1;
        await this.tw.wait(0.06);
        target.flash = 0;
        await this.tw.wait(0.06);
      }
    })();
    this.tw.to(target.body, { x: 6 * dir }, 0.06).then(() => this.tw.to(target.body, { x: 0 }, 0.3, ease.outCubic));

    this.cam.shake(crit ? 5 : 3);
    this.cam.hitStop(crit ? 0.12 : 0.06);
    this.cam.flash(crit ? 0.4 : 0.15, 0xffffff);
    this.damageNumber(at.x, at.y - 14, `-${damage}`, crit ? 0xffd257 : num);
    if (crit) this.damageNumber(at.x, at.y - 30, "CRITICAL!", 0xffd257, 6);
  }

  private damageNumber(x: number, y: number, text: string, color: number, size = 10) {
    const t = new Text({
      text,
      style: { fontFamily: `${this.opts.font}, monospace`, fontSize: size, fill: color, stroke: { color: 0x0b0818, width: 3 } },
      resolution: Math.ceil(this.scale * (window.devicePixelRatio || 1)),
    });
    t.anchor.set(0.5);
    t.position.set(Math.round(x), Math.round(y));
    this.top.addChild(t);
    (async () => {
      await this.tw.to(t, { y: y - 6 }, 0.15, ease.outQuad);
      await this.tw.to(t, { y: y - 2 }, 0.1, ease.inQuad);
      await this.tw.wait(0.45);
      await this.tw.to(t, { y: y - 14, alpha: 0 }, 0.4, ease.inQuad);
      t.destroy();
    })();
  }

  /** Sink below the platform and fade. */
  async faint(side: Side) {
    const a = this.actor(side);
    await this.tw.wait(0.2);
    await a.play("faint", 0.22);
    await this.tw.to(a.body, { y: 24, alpha: 0 }, 0.6, ease.inCubic);
  }

  setReducedMotion(on: boolean) {
    this.opts.reducedMotion = on;
    this.fx.scale = on ? 0.35 : 1;
  }

  destroy() {
    this.destroyed = true;
    this.tw.dispose();
    this.fx.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
