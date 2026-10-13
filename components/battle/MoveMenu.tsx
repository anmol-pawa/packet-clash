"use client";
import { useEffect, useState } from "react";
import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import { TypeChip } from "./TypeChip";

/**
 * The FIGHT panel: four answers in a 2×2 grid inside one handheld window,
 * a ▶ cursor on the selected move, and an info strip underneath. Tap a move,
 * or use 1–4 / the arrow keys and Enter.
 */
export function MoveMenu({
  options,
  locked,
  correct,
  chosen,
  info,
  moveType,
  onPick,
}: {
  options: readonly string[];
  /** Answered: moves are disabled and marked right / wrong. */
  locked: boolean;
  correct: number;
  chosen?: number;
  info: [string, string];
  /** The type of the move a right answer fires. */
  moveType?: PacketType;
  onPick: (i: number) => void;
}) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) return onPick(n - 1);
      const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 };
      if (e.key in move) {
        e.preventDefault();
        setCursor((c) => Math.min(options.length - 1, Math.max(0, c + move[e.key])));
      } else if ((e.key === "Enter" || e.key === " ") && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onPick(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, cursor, options.length, onPick]);

  return (
    <div className="pixel-box p-2 sm:p-3" data-testid="move-menu">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Moves">
        {options.map((o, i) => {
          const state = !locked ? (i === cursor ? "is-cursor" : "") : i === correct ? "move-right" : chosen === i ? "move-wrong" : "opacity-50";
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onPointerEnter={() => !locked && setCursor(i)}
              onFocus={() => setCursor(i)}
              onClick={() => onPick(i)}
              className={`move-button relative min-h-14 py-2 pl-6 pr-2 text-left text-base leading-tight sm:pl-7 sm:text-lg ${state}`}
            >
              <span aria-hidden className="move-cursor absolute left-1.5 top-1/2 -translate-y-1/2 font-pixel text-[10px] sm:left-2 sm:text-xs">
                ▶
              </span>
              {o}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 whitespace-nowrap border-t-2 border-[#3b3175] px-1 pt-1.5 font-pixel text-[9px] text-[#c9c1ff] sm:text-[10px]">
        <span>{info[0]}</span>
        {moveType && (
          <span className="flex items-center" data-testid="move-type" title={TYPE_INFO[moveType].move}>
            <TypeChip type={moveType} className="text-[7px] sm:text-[8px]" />
          </span>
        )}
        <span className="text-[#ffd257]">{info[1]}</span>
      </div>
    </div>
  );
}
