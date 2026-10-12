import type { Palette, SpriteDef } from "./pixel";

/**
 * A tiny pixel painter for building creature sprites from shaded primitives.
 *
 * Each primitive is shaded like a 3-D volume lit from the upper left and its
 * brightness is quantised onto a *ramp*: a string of palette characters from
 * highlight to shadow (e.g. "ABCD"). Where a part overlaps an earlier one its
 * edge can get a `rim` line, and `outline()` wraps the finished silhouette in
 * a 1-px outline, so the result reads like hand-placed pixel art while poses
 * (for animation frames) stay a matter of changing numbers.
 *
 * Pure and deterministic (no DOM), so sprites can be unit tested in Node.
 */

export type Ramp = string;

interface PartOpts {
  /** Edge pixels that overlap an earlier part become this character (an inner line). */
  rim?: string;
  /** Brightness offset, e.g. +0.2 for a part catching more light. */
  bias?: number;
  /** Only paint where the canvas is already filled (for markings on a body). */
  clip?: boolean;
}

// Light from the upper left and slightly in front.
const L = (() => {
  const v = [-0.55, -0.7, 0.62];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / n) as [number, number, number];
})();

// 2×2 ordered dither so ramp steps break up a little instead of banding.
const DITHER = [
  [-0.025, 0.012],
  [0.025, -0.012],
];

export class Painter {
  readonly px: (string | null)[];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Array(w * h).fill(null);
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, ch: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = ch;
  }

  /** Picks a ramp character for a surface normal (nx, ny, nz). */
  static shade(ramp: Ramp, nx: number, ny: number, nz: number, x: number, y: number, bias = 0): string {
    const lit = nx * L[0] + ny * L[1] + nz * L[2] + bias + DITHER[y & 1][x & 1];
    // thresholds tuned for 3–5 step ramps: a small specular, broad mid-tones
    const t = ramp.length === 1 ? [] : ramp.length === 2 ? [0.3] : ramp.length === 3 ? [0.62, 0.12] : ramp.length === 4 ? [0.86, 0.5, 0.02] : [0.9, 0.62, 0.3, -0.12];
    let i = 0;
    while (i < t.length && lit < t[i]) i++;
    return ramp[Math.min(i, ramp.length - 1)];
  }

  /**
   * Paints every pixel for which `normal(x, y)` returns a normal (pixel centres
   * are sampled), handling rims and clipping. Returns the painted pixel count.
   */
  private fill(ramp: Ramp, opts: PartOpts, normal: (x: number, y: number) => [number, number, number] | null) {
    const mask = new Uint8Array(this.w * this.h);
    const before = this.px.slice();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const n = normal(x + 0.5, y + 0.5);
        if (!n) continue;
        if (opts.clip && !before[y * this.w + x]) continue;
        mask[y * this.w + x] = 1;
        this.px[y * this.w + x] = Painter.shade(ramp, n[0], n[1], n[2], x, y, opts.bias);
      }
    if (opts.rim) {
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          if (!mask[y * this.w + x]) continue;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
            const j = yy * this.w + xx;
            if (!mask[j] && before[j]) {
              this.px[y * this.w + x] = opts.rim;
              break;
            }
          }
        }
    }
    return mask.reduce((a, b) => a + b, 0);
  }

  /** A shaded ellipsoid, optionally rotated by `rot` radians. */
  ellipse(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, opts: PartOpts & { rot?: number } = {}) {
    const c = Math.cos(opts.rot ?? 0);
    const s = Math.sin(opts.rot ?? 0);
    return this.fill(ramp, opts, (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * c + dy * s) / rx;
      const v = (-dx * s + dy * c) / ry;
      const d = u * u + v * v;
      if (d > 1) return null;
      // back to screen space
      return [u * c - v * s, u * s + v * c, Math.sqrt(1 - d)];
    });
  }

  /**
   * A shaded tube through `pts` whose radius is interpolated along `radii`
   * (tails, ears, limbs). Round caps at both ends.
   */
  tube(pts: [number, number][], radii: number[], ramp: Ramp, opts: PartOpts = {}) {
    return this.fill(ramp, opts, (x, y) => {
      let best: [number, number, number] | null = null;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const vx = bx - ax;
        const vy = by - ay;
        const len2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
        const r = radii[i] + (radii[i + 1] - radii[i]) * t;
        const qx = x - (ax + vx * t);
        const qy = y - (ay + vy * t);
        const d = Math.hypot(qx, qy) / r;
        if (d <= 1 && d < bestD) {
          bestD = d;
          const k = d > 0 ? 1 / Math.hypot(qx, qy) : 0;
          best = [qx * k * d, qy * k * d, Math.sqrt(1 - d * d)];
        }
      }
      return best;
    });
  }

  /** A flat-shaded polygon (even-odd fill); `ch` is one palette character. */
  polygon(pts: [number, number][], ch: string, opts: { clip?: boolean } = {}) {
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    return this.fill(ch, opts, (x, y) => (inside(x, y) ? [0, 0, 1] : null));
  }

  /** Stamps a small hand-drawn patch; "." in `rows` leaves the canvas as is. */
  stamp(x0: number, y0: number, rows: string[], opts: { flip?: boolean } = {}) {
    rows.forEach((row, y) => {
      const r = opts.flip ? [...row].reverse() : [...row];
      r.forEach((ch, x) => {
        if (ch !== ".") this.set(x0 + x, y0 + y, ch);
      });
    });
  }

  /** Wraps the silhouette in a 1-px outline (4-neighbourhood) of `ch`. */
  outline(ch: string) {
    const src = this.px.slice();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[yy * this.w + xx];
        if (n(x + 1, y) || n(x - 1, y) || n(x, y + 1) || n(x, y - 1)) this.px[y * this.w + x] = ch;
      }
  }

  /** Mirrors the canvas left-to-right in place. */
  mirror() {
    for (let y = 0; y < this.h; y++) {
      const row = this.px.slice(y * this.w, (y + 1) * this.w).reverse();
      for (let x = 0; x < this.w; x++) this.px[y * this.w + x] = row[x];
    }
  }

  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let r = "";
      for (let x = 0; x < this.w; x++) r += this.px[y * this.w + x] ?? ".";
      out.push(r);
    }
    return out;
  }

  sprite(palette: Palette): SpriteDef {
    return { palette, rows: this.rows() };
  }
}
