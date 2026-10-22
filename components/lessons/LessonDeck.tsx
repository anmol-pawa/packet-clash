"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { SpriteDef } from "@/lib/pixel";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { ENCAP_STEPS, type Figure, type Lesson } from "@/content/lessons";
import type { Town } from "@/content/world";
import { BOSS_ART } from "@/game/art/bosses";
import { chipSprite, tagSprite } from "@/game/art/headers";
import { budgetFigure, connectFigure, journeyFigure, bellmanFordFigure, certChainFigure, dhFigure, tlsFigure, dnsFigure, doraFigure, httpFigure, bgpFigure, countToInfinityFigure, crcFigure, csmaFigure, cwndFigure, dijkstraFigure, delaysFigure, fragFigure, hammingFigure, layerStackFigure, lpmFigure, macLearningFigure, subnetFigure, switchingFigure, tcpFlowFigure, vlsmFigure, windowFigure } from "@/game/art/lessons";

const FIGURES: Record<Exclude<Figure, "encap">, SpriteDef> = { layers: layerStackFigure(), switching: switchingFigure(), delays: delaysFigure(), crc: crcFigure(), hamming: hammingFigure(), csmacd: csmaFigure(), macLearn: macLearningFigure(), subnet: subnetFigure(), vlsm: vlsmFigure(), lpm: lpmFigure(), frag: fragFigure(), dijkstra: dijkstraFigure(), bellman: bellmanFordFigure(), cti: countToInfinityFigure(), bgp: bgpFigure(), tcpflow: tcpFlowFigure(), window: windowFigure(), cwnd: cwndFigure(), dns: dnsFigure(), http: httpFigure(), dora: doraFigure(), tls: tlsFigure(), pki: certChainFigure(), dh: dhFigure(), journey: journeyFigure(), budget: budgetFigure(), connect: connectFigure() };

/** The encapsulation card: the battle's header chips, one row per layer on the way down. */
function EncapFigure() {
  return (
    <div className="flex flex-col items-start gap-1.5" role="img" aria-label="An HTTP message wrapped by TCP, IP and Ethernet headers, then sent as bits">
      {ENCAP_STEPS.map((step) => (
        <div key={step.pdu} className="flex items-center gap-1.5">
          <span className="flex w-[62px] justify-end">
            <PixelSprite frames={[tagSprite(step.pdu.toUpperCase(), step.layer)]} scale={2} label={step.pdu} />
          </span>
          <div className="flex">
            {step.blocks.map((b, i) => (
              <span key={b.label} style={{ marginLeft: i ? -2 : 0 }}>
                <PixelSprite frames={[chipSprite(b)]} scale={2} label={`${b.label} ${b.bytes} bytes`} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LessonFigure({ figure, caption }: { figure: Figure; caption: string }) {
  return (
    <figure className="flex flex-col items-center gap-2 rounded-[4px] border-2 border-[#0b0818] bg-[#171233] px-2 py-3">
      {figure === "encap" ? <EncapFigure /> : <PixelSprite frames={[FIGURES[figure]]} scale={2} label={caption} className="max-w-full" />}
      <figcaption className="text-center text-base leading-tight text-[#9d93d6]">{caption}</figcaption>
    </figure>
  );
}

/**
 * A gym's lesson cards, one at a time with BACK / NEXT and page pips. The
 * gym leader presents them. `done` is the last card's button (start the
 * battle, or back to the map) and `aside` an extra control such as SKIP.
 */
export function LessonDeck({ town, lessons, done, aside }: { town: Town; lessons: Lesson[]; done: ReactNode; aside?: ReactNode }) {
  const [i, setIndex] = useState(0);
  const setI = (j: number) => {
    setIndex(j);
    window.scrollTo(0, 0);
  };
  const l = lessons[i];
  const last = i === lessons.length - 1;
  const art = town.bossSprite ? BOSS_ART[town.bossSprite] : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4" data-testid="lessons">
      <header className="flex items-center gap-3">
        {art && <PixelSprite frames={art.front.idle} frameMs={1000 / art.idleFps} scale={1} label={town.boss} className="shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-pixel text-[9px] text-[#9d93d6] sm:text-[10px]">
            {town.name.toUpperCase()} GYM · LESSON {i + 1}/{lessons.length}
          </p>
          <h1 className="font-pixel text-xs leading-relaxed sm:text-sm" style={{ color: town.badgeColor }}>
            {l.title.toUpperCase()}
          </h1>
          <div className="flex gap-1.5" aria-hidden>
            {lessons.map((x, j) => (
              <span key={x.id} className={`h-2 w-4 border-2 border-[#0b0818] ${j <= i ? "bg-[#ffd257]" : "bg-[#3b3175]"}`} />
            ))}
          </div>
        </div>
      </header>

      <article key={l.id} className="pixel-box flex flex-col gap-3 p-4 text-[#f4f1ff]" aria-live="polite">
        <LessonFigure figure={l.figure} caption={l.caption} />
        {l.paras.map((p) => (
          <p key={p} className="text-lg leading-snug">
            {p}
          </p>
        ))}
        {l.tool && (
          <Link href={l.tool.href} className="pixel-button flex min-h-12 items-center justify-center px-3 py-3 text-xs">
            {l.tool.label}
          </Link>
        )}
        {l.example && (
          <section className="rounded-[4px] border-2 border-dashed border-[#5a5196] px-3 py-2">
            <h2 className="font-pixel text-[9px] text-[#ffd257] sm:text-[10px]">{l.example.title.toUpperCase()}</h2>
            {l.example.lines.map((x) => (
              <p key={x} className="mt-1 text-base leading-snug text-[#d9d2ff]">
                {x}
              </p>
            ))}
          </section>
        )}
      </article>

      <nav className="sticky bottom-0 -mx-3 mt-auto grid grid-cols-2 gap-3 border-t-4 border-[#0b0818] bg-[#140f2b] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-4 sm:px-4">
        <button type="button" onClick={() => setI(i - 1)} disabled={i === 0} className="pixel-button flex min-h-12 items-center justify-center px-3 py-3 text-xs disabled:opacity-40">
          ◀ BACK
        </button>
        {last ? (
          done
        ) : (
          <button type="button" onClick={() => setI(i + 1)} className="pixel-button flex min-h-12 items-center justify-center px-3 py-3 text-xs">
            NEXT ▶
          </button>
        )}
      </nav>
      {aside}
    </main>
  );
}
