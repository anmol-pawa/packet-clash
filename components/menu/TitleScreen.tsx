"use client";
import Link from "next/link";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { BITLING, BITLING_DIM } from "@/game/art/mascot";
import { needsStarter } from "@/game/engine/party";
import { useSave } from "@/lib/save";

const MASCOT_FRAMES = [BITLING, BITLING, BITLING_DIM];

/** Fixed star positions (percent of the sky) so server and client render the same. */
const STARS = [
  [6, 8], [18, 22], [27, 5], [41, 16], [55, 7], [63, 26], [74, 12], [86, 20], [93, 6], [12, 38], [35, 32], [80, 36], [48, 40], [68, 44], [3, 52], [96, 48],
];

export function TitleScreen() {
  const save = useSave();
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      {/* Banded night sky: hard colour steps instead of a smooth gradient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(#0e0b22 0 22%, #161036 22% 40%, #1f1747 40% 56%, #2a1f5c 56% 68%, #3a2a70 68% 76%, #24603f 76% 78%, #1d4a33 78% 100%)",
        }}
      >
        {STARS.map(([x, y], i) => (
          <span
            key={i}
            className={i % 3 === 0 ? "blink absolute" : "absolute"}
            style={{ left: `${x}%`, top: `${y}%`, width: i % 4 === 0 ? 6 : 3, height: i % 4 === 0 ? 6 : 3, background: i % 2 ? "#ffe9a8" : "#c8f4ff", animationDelay: `${(i % 5) * 0.23}s` }}
          />
        ))}
      </div>

      <h1 className="mt-6 text-center font-pixel leading-tight">
        <span className="block text-[clamp(1.75rem,9vw,3.5rem)] text-[#ffd257] [text-shadow:4px_4px_0_#b8461f,8px_8px_0_#0b0818]">PACKET</span>
        <span className="mt-2 block text-[clamp(1.75rem,9vw,3.5rem)] text-[#7fd6f5] [text-shadow:4px_4px_0_#23649e,8px_8px_0_#0b0818]">CLASH</span>
      </h1>
      <p className="mt-5 max-w-sm text-center text-lg text-[#d9d2ff]">Catch packet creatures. Battle with networking know-how.</p>

      <div className="relative mt-8 flex flex-col items-center">
        <div className="bob">
          <PixelSprite frames={MASCOT_FRAMES} scale={6} frameMs={450} label="Bitling, a round blue creature carrying an envelope" />
        </div>
        {/* grass platform */}
        <div aria-hidden className="-mt-6 h-6 w-56 rounded-[50%] border-4 border-[#0b0818] bg-[#3f9b52] shadow-[inset_0_-6px_0_#2b7040,inset_0_4px_0_#7fd27a]" />
      </div>

      <div className="mt-auto flex w-full max-w-sm flex-col items-center gap-4 pt-10">
        <Link href={needsStarter(save) ? "/starter" : "/map"} className="pixel-button flex min-h-14 w-full items-center justify-center gap-2 px-6 py-4 text-base">
          <span className="blink">▶</span> PRESS START
        </Link>
        <p className="font-pixel text-[10px] text-[#9d93d6]">v0.2 · learn networks by battling</p>
      </div>
    </main>
  );
}
