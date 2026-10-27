"use client";
import Link from "next/link";
import { useState } from "react";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { copperfield } from "@/game/art/backgrounds/copperfield";
import { ANIMS, type CreatureArt } from "@/game/art/creature";
import { ACKORN } from "@/game/art/creatures/ackorn";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { CIDRAB } from "@/game/art/creatures/cidrab";
import { FRAMADILLO } from "@/game/art/creatures/framadillo";
import { HOOTPATH } from "@/game/art/creatures/hootpath";
import { FETCHIMERA } from "@/game/art/creatures/fetchimera";
import { GIGAROC } from "@/game/art/creatures/gigaroc";
import { SPANTOISE } from "@/game/art/creatures/spantoise";
import { KEYVERN } from "@/game/art/creatures/keyvern";
import { OAKWIND } from "@/game/art/creatures/oakwind";
import { ORACLYNX } from "@/game/art/creatures/oraclynx";
import { SYNACKLE } from "@/game/art/creatures/synackle";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { STACKADON } from "@/game/art/creatures/stackadon";
import { TRACEVIX } from "@/game/art/creatures/tracevix";
import { TRUNKADILLO } from "@/game/art/creatures/trunkadillo";
import { EVOLUTIONS, morphFrames } from "@/game/art/evolve";
import { TYPE_ICONS } from "@/game/art/typeIcons";
import { TYPES } from "@/game/engine/types";
import { badgeFrames } from "@/game/art/world/badges";
import { COURIER } from "@/game/art/world/courier";
import { TOWNS } from "@/content/world";
import { PACKET, SPARK } from "@/game/art/effects";
import { chipSprite, tagSprite } from "@/game/art/headers";
import { encapsulate } from "@/game/engine/encap";
import { budgetFigure, connectFigure, journeyFigure, bellmanFordFigure, certChainFigure, dhFigure, tlsFigure, dnsFigure, doraFigure, httpFigure, bgpFigure, countToInfinityFigure, crcFigure, csmaFigure, cwndFigure, dijkstraFigure, delaysFigure, fragFigure, hammingFigure, layerStackFigure, lpmFigure, macLearningFigure, subnetFigure, switchingFigure, tcpFlowFigure, vlsmFigure, windowFigure } from "@/game/art/lessons";
import { silhouette } from "@/lib/pixel";

const CREATURES: CreatureArt[] = [PINGKIT, TRACEVIX, FRAMADILLO, TRUNKADILLO, ACKORN, OAKWIND, STACKADON, BRAIDWYRM, CIDRAB, HOOTPATH, SYNACKLE, ORACLYNX, KEYVERN, FETCHIMERA, GIGAROC, SPANTOISE];

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
        <h2 className="font-pixel text-xs text-white">TYPE ICONS</h2>
        <div className="flex flex-wrap gap-3">
          {TYPES.map((t) => (
            <figure key={t} className="sprite-cell flex flex-col items-center gap-1 p-2">
              <PixelSprite frames={[TYPE_ICONS[t]]} scale={scale + 2} label={`${t} type icon`} />
              <figcaption className="font-pixel text-[9px] text-[#cde]">{t.toLowerCase()}</figcaption>
            </figure>
          ))}
        </div>
      </section>

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
      <EncapSection scale={scale} />
      <LessonSection scale={scale} />
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

/** Every move type's PDU at each step down the stack, as the header chips the battle animates. */
function EncapSection({ scale }: { scale: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel text-xs text-white">ENCAPSULATION</h2>
      {TYPES.map((t) => (
        <figure key={t} className="sprite-cell flex flex-col gap-2 p-2">
          <figcaption className="font-pixel text-[9px] text-[#cde]">{t.toLowerCase()} move</figcaption>
          {encapsulate(t).map((step) => (
            <div key={step.pdu} className="flex flex-wrap items-center gap-2">
              <PixelSprite frames={[tagSprite(step.pdu.toUpperCase(), step.layer)]} scale={Math.max(2, scale - 1)} label={step.pdu} />
              <div className="flex">
                {step.blocks.map((b, i) => (
                  <span key={b.label} style={{ marginLeft: i ? -Math.max(2, scale - 1) : 0 }}>
                    <PixelSprite frames={[chipSprite(b)]} scale={Math.max(2, scale - 1)} label={`${b.label} ${b.bytes} B`} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </figure>
      ))}
    </section>
  );
}

/** The lesson cards' drawn figures. */
function LessonSection({ scale }: { scale: number }) {
  const figs = [
    ["layer stack", layerStackFigure()],
    ["switching", switchingFigure()],
    ["four delays", delaysFigure()],
    ["crc division", crcFigure()],
    ["hamming(7,4)", hammingFigure()],
    ["csma/cd", csmaFigure()],
    ["mac learning", macLearningFigure()],
    ["subnetting", subnetFigure()],
    ["vlsm", vlsmFigure()],
    ["longest prefix", lpmFigure()],
    ["fragmentation", fragFigure()],
    ["dijkstra", dijkstraFigure()],
    ["bellman-ford", bellmanFordFigure()],
    ["count to infinity", countToInfinityFigure()],
    ["bgp as path", bgpFigure()],
    ["tcp handshake and teardown", tcpFlowFigure()],
    ["gbn vs sr", windowFigure()],
    ["cwnd sawtooth", cwndFigure()],
    ["dns resolution", dnsFigure()],
    ["http round trips", httpFigure()],
    ["dhcp dora and lease", doraFigure()],
    ["tls 1.3 handshake", tlsFigure()],
    ["certificate chain", certChainFigure()],
    ["diffie-hellman", dhFigure()],
    ["url journey", journeyFigure()],
    ["rtt budget", budgetFigure()],
    ["tls vs quic", connectFigure()],
  ] as const;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel text-xs text-white">LESSON FIGURES</h2>
      <div className="flex flex-wrap gap-3">
        {figs.map(([name, def]) => (
          <figure key={name} className="sprite-cell flex flex-col items-center gap-2 p-2">
            <PixelSprite frames={[def]} scale={Math.max(2, scale - 1)} label={name} />
            <figcaption className="font-pixel text-[9px] text-[#cde]">{name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
