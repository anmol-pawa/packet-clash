"use client";
import { useState } from "react";
import { tcpSteps } from "@/game/engine/tcpMachine";
import { stateTrail } from "@/game/art/lessons";
import type { TcpState } from "@/lib/net/transport";

const STEPS = tcpSteps();
const TRAILS = { client: stateTrail("client"), server: stateTrail("server") };

/** The index in `trail` that is current at step `i`: the last occurrence not after the step's state (CLOSED appears first and last). */
function currentIndex(trail: TcpState[], state: TcpState, i: number): number {
  const first = trail.indexOf(state);
  const last = trail.lastIndexOf(state);
  return i === STEPS.length - 1 ? last : first;
}

function Column({ side, step, i }: { side: "client" | "server"; step: number; i: number }) {
  const trail = TRAILS[side];
  const state = STEPS[step][side];
  const cur = currentIndex(trail, state, step);
  return (
    <ol className="flex flex-1 flex-col gap-1.5" aria-label={`${side} states`}>
      {trail.map((s, j) => {
        const on = j === cur;
        const past = j < cur;
        return (
          <li
            key={`${s}-${j}`}
            aria-current={on ? "step" : undefined}
            className={`rounded-[4px] border-2 px-1 py-2 text-center font-pixel text-[8px] leading-tight sm:text-[10px] ${on ? "border-[#ffd257] bg-[#ffd257] text-[#1a1433]" : past ? "border-[#0b0818] bg-[#3b3175] text-[#d9d2ff]" : "border-[#0b0818] bg-[#171233] text-[#6c63a8]"}`}
          >
            {s.replace("_", " ")}
          </li>
        );
      })}
      <li className="sr-only">{i}</li>
    </ol>
  );
}

/** Step through the TCP handshake and teardown; both sides' states highlight as each segment arrives. */
export function TcpMachine() {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const seg = s.seg;
  const toServer = seg?.from === "client";
  return (
    <>
      <div className="pixel-box flex flex-col gap-3 p-3" data-testid="tcp-machine">
        <div className="flex items-center justify-between font-pixel text-[9px] text-[#9d93d6] sm:text-[10px]">
          <span>CLIENT</span>
          <span>
            STEP {i}/{STEPS.length - 1}
          </span>
          <span>SERVER</span>
        </div>
        <div className="flex gap-2">
          <Column side="client" step={i} i={i} />
          <div className="relative flex w-24 shrink-0 flex-col items-center justify-start pt-6 sm:w-36" aria-live="polite">
            {seg ? (
              <div key={i} className={`tcp-seg ${toServer ? "tcp-seg-right" : "tcp-seg-left"} flex w-full flex-col items-center gap-0.5`}>
                <div className={`w-full rounded-[4px] border-2 border-[#0b0818] px-1 py-1 text-center font-pixel text-[8px] leading-snug text-[#1a1433] sm:text-[10px] ${seg.phase === "open" ? "bg-[#ffd257]" : "bg-[#f0a03a]"}`}>
                  {seg.lines.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
                <div className="font-pixel text-base text-[#f4f1ff]" aria-hidden>
                  {toServer ? "▶▶▶" : "◀◀◀"}
                </div>
                <span className="sr-only">{`${seg.from} sends ${seg.lines.join(" ")}`}</span>
              </div>
            ) : (
              <div className="text-center text-base text-[#9d93d6]">{i === 0 ? "no segments yet" : "timer, no segment"}</div>
            )}
          </div>
          <Column side="server" step={i} i={i} />
        </div>
      </div>
      <p className="pixel-box p-3 text-lg leading-snug text-[#f4f1ff]">{s.note}</p>
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
