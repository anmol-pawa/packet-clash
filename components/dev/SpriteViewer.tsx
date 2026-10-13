"use client";
import Link from "next/link";
import { useState } from "react";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { copperfield } from "@/game/art/backgrounds/copperfield";
import { ANIMS, type CreatureArt } from "@/game/art/creature";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { CIDRAB } from "@/game/art/creatures/cidrab";
import { HOOTPATH } from "@/game/art/creatures/hootpath";
import { KEYVERN } from "@/game/art/creatures/keyvern";
import { ORACLYNX } from "@/game/art/creatures/oraclynx";
import { SYNACKLE } from "@/game/art/creatures/synackle";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { STACKADON } from "@/game/art/creatures/stackadon";
import { TRACEVIX } from "@/game/art/creatures/tracevix";
import { EVOLUTIONS, morphFrames } from "@/game/art/evolve";
import { badgeFrames } from "@/game/art/world/badges";
import { COURIER } from "@/game/art/world/courier";
import { TOWNS } from "@/content/world";
import { PACKET, SPARK } from "@/game/art/effects";
import { silhouette } from "@/lib/pixel";

const CREATURES: CreatureArt[] = [PINGKIT, TRACEVIX, STACKADON, BRAIDWYRM, CIDRAB, HOOTPATH, SYNACKLE, ORACLYNX, KEYVERN];

/**
 * /dev/sprites: every creature's front and back animations side by side, plus
 * the white silhouette used for hurt flashes and the evolve morph, and the
 * move-effect sprites. For reviewing art from screenshots.
 */
export function SpriteViewer() {
  const [scale, setScale] = useState(3);
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-pixel text-sm text-[#ffd257] sm:text-base">SPRITE VIEWER</h1>
        <div className="flex items-center gap-2">
          {[2, 3, 4].map((s) => (
            <button key={s} onClick={() => setScale(s)} className={`pixel-button px-3 py-2 text-xs ${s === scale ? "brightness-125" : "opacity-70"}`} aria-pressed={s === scale}>
              ×{s}
            </button>
          ))}
          <Link href="/" className="pixel-button px-3 py-2 text-xs">
            HOME
          </Link>
        </div>
      </header>

      {CREATURES.map((c) => (
        <section key={c.id} className="flex flex-col gap-3">
          <h2 className="font-pixel text-xs text-white">
            {c.name.toUpperCase()} <span className="text-[#9ab]">· {c.size}×{c.size}</span>
          </h2>
          <p className="max-w-prose text-base text-[#cde]">{c.blurb}</p>
          {(["front", "back"] as const).map((view) => (
            <div key={view} className="flex flex-col gap-2">
              <h3 className="font-pixel text-[10px] text-[#9ab]">{view.toUpperCase()}</h3>
              <div className="flex flex-wrap gap-3">
                {ANIMS.map((a) => (
                  <figure key={a} className="sprite-cell flex flex-col items-center gap-1 p-2">
                    <PixelSprite frames={c[view][a]} scale={scale} frameMs={a === "idle" ? 1000 / c.idleFps : 320} label={`${c.name} ${view} ${a}`} />
                    <figcaption className="font-pixel text-[9px] text-[#cde]">
                      {a} · {c[view][a].length}f
                    </figcaption>
                  </figure>
                ))}
                <figure className="sprite-cell flex flex-col items-center gap-1 p-2">
                  <PixelSprite frames={[c[view].idle[0], silhouette(c[view].idle[0])]} scale={scale} frameMs={400} label={`${c.name} ${view} evolve silhouette`} />
                  <figcaption className="font-pixel text-[9px] text-[#cde]">evolve</figcaption>
                </figure>
              </div>
            </div>
          ))}
        </section>
      ))}

      <EvolveSection scale={scale} />

      <CourierSection scale={scale} />
      <BadgeSection scale={scale} />

      <BackgroundSection scale={scale} />

      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-xs text-white">MOVE EFFECTS</h2>
        <div className="flex flex-wrap gap-3">
          <figure className="sprite-cell flex flex-col items-center gap-1 p-2">
            <PixelSprite frames={[PACKET]} scale={scale + 1} label="packet projectile" />
            <figcaption className="font-pixel text-[9px] text-[#cde]">packet</figcaption>
          </figure>
          <figure className="sprite-cell flex flex-col items-center gap-1 p-2">
            <PixelSprite frames={SPARK} scale={scale + 1} frameMs={140} label="impact spark" />
            <figcaption className="font-pixel text-[9px] text-[#cde]">spark · {SPARK.length}f</figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}

/** Each evolution: the looping morph (colour → silhouette dissolve → colour) and its silhouette frames. */
function EvolveSection({ scale }: { scale: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel text-xs text-white">EVOLUTIONS</h2>
      {EVOLUTIONS.map(({ from, to }) => {
        const morph = morphFrames(from.front.idle[0], to.front.idle[0], 8);
        const loop = [from.front.idle[0], ...morph, to.front.idle[0], to.front.idle[0]];
        return (
          <div key={from.id} className="flex flex-col gap-2">
            <h3 className="font-pixel text-[10px] text-[#9ab]">
              {from.name.toUpperCase()} → {to.name.toUpperCase()}
            </h3>
            <div className="flex flex-wrap gap-3">
              <figure className="sprite-cell flex flex-col items-center gap-1 p-2">
                <PixelSprite frames={loop} scale={scale} frameMs={220} label={`${from.name} evolving into ${to.name}`} />
                <figcaption className="font-pixel text-[9px] text-[#cde]">morph loop</figcaption>
              </figure>
              {morph.map((f, i) => (
                <figure key={i} className="sprite-cell flex flex-col items-center gap-1 p-2">
                  <PixelSprite frames={[f]} scale={Math.max(1, scale - 1)} label={`morph frame ${i + 1}`} />
                  <figcaption className="font-pixel text-[9px] text-[#cde]">{i + 1}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** The overworld courier: each direction's walk cycle, then every frame. */
function CourierSection({ scale }: { scale: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel text-xs text-white">
        OVERWORLD COURIER <span className="text-[#9ab]">· 12×16 · drawn at map scale</span>
      </h2>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(COURIER) as (keyof typeof COURIER)[]).map((dir) => (
          <figure key={dir} className="flex flex-col items-center gap-1 rounded bg-[#7cc65e] p-2">
            <PixelSprite frames={COURIER[dir]} scale={scale + 2} frameMs={160} label={`courier walking ${dir}`} />
            <figcaption className="font-pixel text-[9px] text-[#0b0818]">{dir}</figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(COURIER) as (keyof typeof COURIER)[]).flatMap((dir) =>
          COURIER[dir].map((f, i) => (
            <figure key={`${dir}${i}`} className="flex flex-col items-center gap-1 rounded bg-[#d2ab6d] p-1">
              <PixelSprite frames={[f]} scale={scale} label={`courier ${dir} frame ${i + 1}`} />
              <figcaption className="font-pixel text-[8px] text-[#0b0818]">
                {dir[0]}
                {i + 1}
              </figcaption>
            </figure>
          )),
        )}
      </div>
    </section>
  );
}

/** Gym badges, each with its glint sweep. */
function BadgeSection({ scale }: { scale: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel text-xs text-[#ffd257]">
        GYM BADGES <span className="text-[#9ab]">· 24×24 · glint sweep</span>
      </h2>
      <div className="flex flex-wrap gap-3">
        {TOWNS.map((t) => (
          <figure key={t.id} className="flex flex-col items-center gap-1 rounded bg-[#2a2350] p-2">
            <PixelSprite frames={badgeFrames(t)} scale={scale + 1} frameMs={90} label={t.badge} />
            <figcaption className="font-pixel text-[8px] text-[#d9d2ff]">{t.badge.replace(" Badge", "").toUpperCase()}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Battle backgrounds: the 256×192 stage frame (scrolls on narrow screens), the clouds and the full painted area. */
function BackgroundSection({ scale }: { scale: number }) {
  const bg = copperfield();
  const frame = { palette: bg.image.palette, rows: bg.image.rows.slice(-bg.y, -bg.y + 192).map((r) => r.slice(-bg.x, -bg.x + 256)) };
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel text-xs text-white">
        BACKGROUND · {bg.name.toUpperCase()} <span className="text-[#9ab]">· stage 256×192</span>
      </h2>
      <div className="max-w-full overflow-x-auto">
        <PixelSprite frames={[frame]} scale={Math.max(1, scale - 1)} label={`${bg.name} stage frame`} />
      </div>
      <div className="flex flex-wrap gap-3">
        {bg.clouds.map((c, i) => (
          <figure key={i} className="flex flex-col items-center gap-1 rounded bg-[#4f95e2] p-2">
            <PixelSprite frames={[c]} scale={scale} label={`cloud ${i + 1}`} />
            <figcaption className="font-pixel text-[9px] text-white">cloud</figcaption>
          </figure>
        ))}
      </div>
      <h3 className="font-pixel text-[10px] text-[#9ab]">FULL AREA (WIDE SCREENS) · {bg.image.rows[0].length}×{bg.image.rows.length}</h3>
      <div className="max-w-full overflow-x-auto">
        <PixelSprite frames={[bg.image]} scale={1} label={`${bg.name} full area`} />
      </div>
    </section>
  );
}
