"use client";
import { useEffect, useState } from "react";
import { TRIP_NODES, tripSteps, waypoints } from "@/game/engine/journeyTrip";

const STEPS = tripSteps();
const LABELS = { laptop: "LAPTOP", router: "ROUTER", resolver: "DNS", server: "SERVER" } as const;
const ICONS = { laptop: "▭", router: "◈", resolver: "☷", server: "▦" } as const;
const PHASE_COLOR = { browser: "#ffd257", link: "#7bd88f", dns: "#6ec8ff", tcp: "#f0a03a", tls: "#c58cff", http: "#ff7a7a", render: "#f4f1ff" } as const;
const X = (i: number) => 12.5 + i * 25;

/** Step through the nine stages of a URL load; a packet hops across laptop, router, resolver and server. */
export function UrlJourney() {
  const [i, setI] = useState(0);
  const [hop, setHop] = useState({ step: 0, n: 0 });
  const s = STEPS[i];
  const total = STEPS.reduce((n, st) => n + st.rtts, 0);
  const sofar = STEPS.slice(0, i + 1).reduce((n, st) => n + st.rtts, 0);

  const way = waypoints(s);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timers = way.slice(1).map((_, k) => window.setTimeout(() => setHop({ step: i, n: reduce ? way.length - 1 : k + 1 }), reduce ? 0 : 450 * (k + 1)));
    return () => timers.forEach(window.clearTimeout);
  }, [i, s]); // eslint-disable-line react-hooks/exhaustive-deps -- `way` derives from `s`
  const pos = way[hop.step === i ? Math.min(hop.n, way.length - 1) : 0];

  const lit = new Set(s.path);
  const [lo, hi] = [Math.min(...way), Math.max(...way)];
  const onPath = (a: number) => lo !== hi && a >= lo && a + 1 <= hi;
  const color = PHASE_COLOR[s.phase];

  return (
    <>
      <div className="pixel-box flex flex-col gap-3 p-3" data-testid="url-journey">
        <div className="flex items-center justify-between font-pixel text-[9px] text-[#9d93d6] sm:text-[10px]">
          <span>
            STEP {i + 1}/{STEPS.length}
          </span>
          <span data-testid="rtt-count">
            {sofar}/{total} RTT
          </span>
        </div>
        <div className="relative h-24" role="img" aria-label={`Path: ${s.path.join(" to ")}${s.reply ? " and back" : ""}`}>
          {[0, 1, 2].map((a) => (
            <div key={a} className="absolute top-8 h-1.5" style={{ left: `${X(a)}%`, width: "25%", background: onPath(a) ? color : "#3b3175" }} />
          ))}
          {TRIP_NODES.map((n, k) => (
            <div key={n} className="absolute top-0 flex w-16 -translate-x-1/2 flex-col items-center gap-1" style={{ left: `${X(k)}%` }}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-[4px] border-2 border-[#0b0818] text-2xl ${lit.has(n) ? "text-[#1a1433]" : "bg-[#171233] text-[#6c63a8]"}`} style={lit.has(n) ? { background: color } : undefined} aria-hidden>
                {ICONS[n]}
              </div>
              <span className="font-pixel text-[8px] text-[#d9d2ff] sm:text-[10px]">{LABELS[n]}</span>
            </div>
          ))}
          <div
            className="absolute top-[18px] z-10 -translate-x-1/2 rounded-[4px] border-2 border-[#0b0818] px-1 py-0.5 font-pixel text-[8px] text-[#1a1433] transition-[left] duration-[400ms] ease-steps sm:text-[10px]"
            style={{ left: `${X(pos)}%`, background: "#f4f1ff", transitionTimingFunction: "steps(6)" }}
            data-testid="packet"
          >
            {s.packet}
          </div>
        </div>
        <p className="rounded-[4px] bg-[#171233] p-2 text-lg leading-snug text-[#f4f1ff]" aria-live="polite">
          {s.detail}
        </p>
        <ol className="flex flex-col gap-1" aria-label="Journey steps">
          {STEPS.map((st, k) => (
            <li key={st.id} aria-current={k === i ? "step" : undefined} className={`flex items-center gap-2 rounded-[4px] border-2 px-2 py-1.5 text-base leading-tight ${k === i ? "border-[#ffd257] bg-[#2a2257] text-white" : k < i ? "border-[#0b0818] bg-[#3b3175] text-[#d9d2ff]" : "border-[#0b0818] bg-[#171233] text-[#6c63a8]"}`}>
              <span className="h-3 w-3 shrink-0 border-2 border-[#0b0818]" style={{ background: PHASE_COLOR[st.phase] }} aria-hidden />
              <span className="font-pixel text-[8px] sm:text-[10px]">{k + 1}</span>
              <span>{st.title}</span>
            </li>
          ))}
        </ol>
      </div>
      <nav className="sticky bottom-0 -mx-3 mt-auto grid grid-cols-3 gap-3 border-t-4 border-[#0b0818] bg-[#140f2b] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-4 sm:px-4">
        <button type="button" onClick={() => setI(i - 1)} disabled={i === 0} className="pixel-button flex min-h-12 items-center justify-center px-2 py-3 text-xs disabled:opacity-40">
          ◀ BACK
        </button>
        <button type="button" onClick={() => setI(0)} disabled={i === 0} className="pixel-button flex min-h-12 items-center justify-center px-2 py-3 text-xs disabled:opacity-40">
          RESET
        </button>
        <button type="button" onClick={() => setI(i + 1)} disabled={i === STEPS.length - 1} className="pixel-button flex min-h-12 items-center justify-center px-2 py-3 text-xs disabled:opacity-40">
          NEXT ▶
        </button>
      </nav>
    </>
  );
}
