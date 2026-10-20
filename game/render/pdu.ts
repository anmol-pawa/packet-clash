import { Container, Sprite } from "pixi.js";
import { CHIP_H, chipSprite, tagSprite } from "@/game/art/headers";
import type { Block, PduStep } from "@/game/engine/encap";
import { pixelTexture } from "./pixelTex";
import { Tweener, ease } from "./tween";

const W = 256;
const H = 192;

/**
 * An attack's PDU on the stage: a row of header chips with a tag naming the
 * PDU above it. `show(step)` animates to the next step: new headers slide in
 * from the side they're added on (`wrap`), or the outer ones lift off and fade
 * (`strip`). The row stays on screen however wide the frame gets.
 */
export class PduView {
  readonly root = new Container();
  private row = new Container();
  private chips = new Map<Block, Sprite>();
  private tag?: Sprite;
  at: { x: number; y: number };
  width = 0;

  constructor(
    private tw: Tweener,
    at: { x: number; y: number },
  ) {
    this.at = { ...at };
    this.root.addChild(this.row);
    this.moveTo(at.x, at.y);
  }

  /** Moves the PDU's centre, kept inside the field. */
  moveTo(x: number, y: number) {
    const half = this.width / 2;
    this.at = { x: Math.min(W - half - 2, Math.max(half + 2, x)), y: Math.min(H - CHIP_H, Math.max(16, y)) };
    this.root.position.set(Math.round(this.at.x), Math.round(this.at.y));
  }

  async show(step: PduStep, how: "pop" | "wrap" | "strip") {
    const widths = step.blocks.map((b) => pixelTexture(chipSprite(b)).width - 1);
    this.width = widths.reduce((a, b) => a + b, 1);
    const xs: number[] = [];
    let x = -Math.floor(this.width / 2);
    for (const w of widths) {
      xs.push(x);
      x += w;
    }
    const moves: Promise<void>[] = [];
    // outer blocks the new step no longer has lift off
    for (const [b, s] of this.chips) {
      if (step.blocks.includes(b)) continue;
      this.chips.delete(b);
      moves.push(this.tw.to(s, { y: s.y - 10, alpha: 0 }, 0.22, ease.outQuad).then(() => s.destroy()));
    }
    step.blocks.forEach((b, i) => {
      const old = this.chips.get(b);
      if (old) {
        moves.push(this.tw.to(old, { x: xs[i] }, 0.12, ease.outCubic));
        return;
      }
      const s = new Sprite(pixelTexture(chipSprite(b)));
      s.roundPixels = true;
      s.anchor.set(0, 0.5);
      this.chips.set(b, s);
      this.row.addChild(s);
      if (how === "wrap") {
        // headers come in from the front, trailers from the back
        s.position.set(xs[i] + (b.kind === "header" ? -10 : 10), -4);
        s.alpha = 0;
        moves.push(this.tw.to(s, { x: xs[i], y: 0, alpha: 1 }, 0.14, ease.outBack));
      } else {
        s.position.set(xs[i], 0);
      }
    });
    if (how === "pop") {
      this.row.scale.set(0.2);
      moves.push(this.tw.to(this.row.scale, { x: 1, y: 1 }, 0.16, ease.outBack));
    }
    this.setTag(step);
    this.moveTo(this.at.x, this.at.y);
    await Promise.all(moves);
  }

  private setTag(step: PduStep) {
    this.tag?.destroy();
    const t = new Sprite(pixelTexture(tagSprite(step.pdu.toUpperCase(), step.layer)));
    t.anchor.set(0.5, 1);
    t.roundPixels = true;
    t.position.set(0, -Math.ceil(CHIP_H / 2) - 1);
    this.root.addChild(t);
    this.tag = t;
  }

  /** The last PDU slams into the target and is gone. */
  async hit() {
    this.tag?.destroy();
    this.tag = undefined;
    await this.tw.to(this.root.scale, { x: 1.4, y: 1.4 }, 0.06, ease.outQuad);
    this.root.destroy({ children: true });
  }
}
