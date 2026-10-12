"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { TOWNS, type Town } from "@/content/world";
import { badgeFrames, badgeSprite, SPARKLE } from "@/game/art/world/badges";
import { useSave } from "@/lib/save";

/** Where the sparkles twinkle around the badge (% of the burst box) and their delays. */
const SPARKS: [number, number, number][] = [
  [12, 18, 0],
  [82, 10, 0.4],
  [90, 70, 0.8],
  [8, 78, 0.2],
  [50, 2, 0.6],
  [70, 92, 1],
];

/**
 * The badge-get screen after a gym win: the badge pops in over turning rays
 * with a glint and sparkles, then the badge case (with the new gem filled)
 * and the town it opens.
 */
export function BadgeGet({ town, leader, opened }: { town: Town; leader: string; opened: Town | null }) {
  const badges = useSave().badges;
  const button = useRef<HTMLAnchorElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="badge-get-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0b0818]/85 p-4">
      <div className="pixel-box flex w-full max-w-md flex-col items-center gap-4 p-5 text-center text-[#f4f1ff]">
        <h2 id="badge-get-title" className="font-pixel text-sm text-[#ffd257] [text-shadow:2px_2px_0_#0b0818] sm:text-base">
          BADGE GET!
        </h2>
        <div className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full">
          <div
            aria-hidden
            className="spin-rays absolute -inset-8"
            style={{ background: `repeating-conic-gradient(${town.badgeColor}55 0deg 15deg, transparent 15deg 30deg)` }}
          />
          <div aria-hidden className="absolute inset-10 rounded-full" style={{ background: `radial-gradient(circle, ${town.badgeColor}66 0 40%, transparent 70%)` }} />
          <div className="badge-pop relative">
            <PixelSprite frames={badgeFrames(town)} scale={5} frameMs={90} label={town.badge} />
          </div>
          {SPARKS.map(([x, y, d], i) => (
            <span key={i} aria-hidden className="twinkle absolute" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }}>
              <PixelSprite frames={[SPARKLE]} scale={3} label="" />
            </span>
          ))}
        </div>
        <p className="rise-in text-xl leading-snug" style={{ animationDelay: "0.5s" }}>
          You received the <span style={{ color: town.badgeColor }}>{town.badge.toUpperCase()}</span> from LEADER {leader.toUpperCase()}!
        </p>
        <div className="rise-in flex items-center gap-1.5" style={{ animationDelay: "0.8s" }} aria-label={`Badge case: ${badges.length} of ${TOWNS.length}`}>
          {TOWNS.map((t) => (
            <span key={t.id} className={badges.includes(t.gym) ? "" : "opacity-25 grayscale"}>
              <PixelSprite frames={[badgeSprite(t)]} scale={1} label={badges.includes(t.gym) ? t.badge : `${t.badge}, not earned`} />
            </span>
          ))}
        </div>
        {opened && (
          <p className="rise-in font-pixel text-[10px] leading-relaxed text-[#8ee07a]" style={{ animationDelay: "1.1s" }}>
            {opened.name.toUpperCase()} IS NOW OPEN!
          </p>
        )}
        <Link ref={button} href="/map" className="rise-in pixel-button flex min-h-12 w-full items-center justify-center px-4 py-3 text-xs" style={{ animationDelay: "1.3s" }}>
          ▶ WORLD MAP
        </Link>
      </div>
    </div>
  );
}
