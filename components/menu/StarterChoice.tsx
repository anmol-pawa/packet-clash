"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TypeChip } from "@/components/battle/TypeChip";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { PARTNER_ART } from "@/game/art/partners";
import { needsStarter, PARTNER_NAMES, partnerMaxHp, STARTER_LEVEL, starterPartner, STARTERS, type StarterId } from "@/game/engine/party";
import { CHART, TYPE_INFO, typesOf } from "@/game/engine/types";
import { updateSave, useSave } from "@/lib/save";

/** True from the `sm` breakpoint up, so sprites can scale by whole numbers on both phones and desktops. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/** A stone pedestal: a flat ellipse with a lit rim and a shaded face. */
function Pedestal({ lit }: { lit: boolean }) {
  return (
    <div aria-hidden className="relative -mt-3 w-full max-w-[9rem]">
      <div className={`h-4 rounded-[50%] border-4 border-[#0b0818] sm:h-6 ${lit ? "bg-[#c9bfe8] shadow-[inset_0_3px_0_#f1ecff,inset_0_-4px_0_#8f84bd]" : "bg-[#8f86b0] shadow-[inset_0_3px_0_#b4abd3,inset_0_-4px_0_#625a85]"}`} />
      <div className={`mx-[10%] -mt-2 h-5 border-x-4 border-b-4 border-[#0b0818] sm:h-7 ${lit ? "bg-[#8f84bd] shadow-[inset_6px_0_0_#a79dd0,inset_-6px_0_0_#6c6297]" : "bg-[#625a85] shadow-[inset_6px_0_0_#776e9c,inset_-6px_0_0_#4a4368]"}`} />
    </div>
  );
}

/**
 * `/starter`: a new save picks its partner. Three starters stand on
 * pedestals (Link, Network, Transport: each beats the next), tapping one
 * shows its type, blurb and matchups, and CHOOSE saves it as the partner.
 */
export function StarterChoice() {
  const router = useRouter();
  const wide = useWide();
  const [sel, setSel] = useState<StarterId>("pingkit");
  const [chosen, setChosen] = useState<StarterId | null>(null);
  // A save that already has its partner has nothing to choose.
  const locked = !needsStarter(useSave());

  const art = PARTNER_ART[sel];
  const name = PARTNER_NAMES[sel].toUpperCase();
  const [type] = typesOf(sel);
  const strong = CHART.filter((m) => m.atk === type && m.mult === 2);
  const weak = CHART.filter((m) => m.def === type && m.mult === 2);

  const choose = () => {
    if (chosen || locked) return;
    setChosen(sel);
    updateSave((s) => ({ ...s, partner: starterPartner(sel) }));
    setTimeout(() => router.push("/map"), 1400);
  };

  if (locked && !chosen) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-[#d9d2ff]">You already have a partner.</p>
        <Link href="/map" className="pixel-button flex min-h-12 items-center justify-center px-6 py-3 text-xs">
          ▶ TO THE MAP
        </Link>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 overflow-x-hidden px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      {/* The lab: a banded wall over a tiled floor. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "linear-gradient(#1a1440 0 30%, #221a52 30% 44%, #2c2264 44% 50%, #0b0818 50% 51%, #3b2f6e 51% 100%)",
        }}
      />
      <header className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href="/" className="py-2 hover:text-white">
          ◀ TITLE
        </Link>
        <h1 className="text-xs text-[#ffd257] sm:text-sm">CHOOSE A PARTNER</h1>
      </header>
      <p className="pixel-box px-3 py-2 text-lg leading-snug text-[#f4f1ff]">
        Three packet creatures from three layers of the stack. Each one&apos;s layer carries the next one&apos;s data, so each beats the next. Pick the one you&apos;ll start your journey with.
      </p>

      <div className="mt-2 grid grid-cols-3 items-end gap-2 sm:gap-4" role="radiogroup" aria-label="Starters">
        {STARTERS.map((id) => {
          const a = PARTNER_ART[id];
          const on = id === sel;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={PARTNER_NAMES[id]}
              data-testid={`starter-${id}`}
              onClick={() => !chosen && setSel(id)}
              className="flex min-h-12 flex-col items-center gap-1 rounded-md pt-1 outline-offset-4"
            >
              <span aria-hidden className={`font-pixel text-xs text-[#ffd257] ${on ? "blink" : "invisible"}`}>
                ▼
              </span>
              <div className={on && !chosen ? "bob" : ""}>
                <PixelSprite frames={chosen === id ? a.front.attack : a.front.idle} scale={wide ? 2 : 1} frameMs={chosen === id ? 180 : 1000 / a.idleFps} label={a.name} />
              </div>
              <Pedestal lit={on} />
              <span className={`mt-1 font-pixel text-[9px] sm:text-xs ${on ? "text-[#ffd257]" : "text-[#9d93d6]"}`}>{PARTNER_NAMES[id].toUpperCase()}</span>
              {typesOf(id).map((t) => (
                <TypeChip key={t} type={t} />
              ))}
            </button>
          );
        })}
      </div>

      <section className="pixel-box flex flex-col gap-2 px-3 py-3" aria-live="polite" data-testid="starter-detail">
        <div className="flex items-baseline justify-between gap-2 font-pixel text-xs text-[#f4f1ff] sm:text-sm">
          <span>{name}</span>
          <span className="text-[#ffd257]">
            Lv{STARTER_LEVEL} · HP {partnerMaxHp(STARTER_LEVEL)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip type={type} long />
          <span className="text-base text-[#c9c2e8]">
            Works with {TYPE_INFO[type].pdu}s · signature move {TYPE_INFO[type].move}
          </span>
        </div>
        <p className="text-lg leading-snug text-[#f4f1ff]">{art.blurb}</p>
        <ul className="flex flex-col gap-1 text-base leading-snug text-[#c9c2e8]">
          {strong.map((m) => (
            <li key={`s${m.def}`}>
              <span className="font-pixel text-[9px] text-[#7fe08a]">STRONG ×2</span> vs <TypeChip type={m.def} /> {m.why}
            </li>
          ))}
          {weak.map((m) => (
            <li key={`w${m.atk}`}>
              <span className="font-pixel text-[9px] text-[#ff8a7a]">WEAK ×2</span> to <TypeChip type={m.atk} /> {m.why}
            </li>
          ))}
        </ul>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t-4 border-[#0b0818] bg-[#171233] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-3xl">
          {chosen ? (
            <p className="flex min-h-14 items-center justify-center text-center font-pixel text-xs text-[#ffd257]" data-testid="starter-joined">
              {PARTNER_NAMES[chosen].toUpperCase()} joined you!
            </p>
          ) : (
            <button type="button" onClick={choose} className="pixel-button flex min-h-14 w-full items-center justify-center gap-2 px-6 py-4 text-xs sm:text-sm" data-testid="starter-confirm">
              <span className="blink">▶</span> CHOOSE {name}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
