"use client";
import Link from "next/link";
import { useState } from "react";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { ANIMS, type CreatureArt } from "@/game/art/creature";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { PACKET, SPARK } from "@/game/art/effects";
import { silhouette } from "@/lib/pixel";

const CREATURES: CreatureArt[] = [PINGKIT, BRAIDWYRM];

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
