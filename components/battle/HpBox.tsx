"use client";
import type { Fighter } from "@/game/engine/battle";
import { TypeChip } from "./TypeChip";
import { useStepTo } from "./useStepTo";

/**
 * Handheld-style status box: name, level, a stepped HP bar (green → yellow →
 * red) whose counter drains with it, and, for the player, an EXP bar.
 */
export function HpBox({ f, side, xp, className = "" }: { f: Fighter; side: "foe" | "player"; xp?: number; className?: string }) {
  const hp = useStepTo(f.hp);
  const pct = Math.max(0, Math.min(1, hp / f.maxHp));
  const color = pct > 0.5 ? "#4ade80" : pct > 0.2 ? "#facc15" : "#f43f5e";
  const player = side === "player";
  return (
    <div
      className={`hp-box ${player ? "hp-box-player" : "hp-box-foe"} px-2 py-1.5 sm:px-3 sm:py-2 ${className}`}
      role="group"
      aria-label={`${f.name} level ${f.level}, HP ${f.hp} of ${f.maxHp}`}
      data-testid={`hp-${side}`}
    >
      <div className="flex items-baseline justify-between gap-2 font-pixel text-[9px] sm:text-xs">
        <span className="truncate">{f.name.toUpperCase()}</span>
        <span className="shrink-0">
          <span className="text-[7px] sm:text-[9px]">Lv</span>
          {f.level}
        </span>
      </div>
      {!!f.types?.length && (
        <div className="mt-0.5 flex gap-1" aria-label={`Type ${f.types.join(" and ")}`}>
          {f.types.map((t) => (
            <TypeChip key={t} type={t} className="text-[6px] sm:text-[8px]" />
          ))}
        </div>
      )}
      <div className="hp-track mt-1 flex items-center gap-1 rounded-sm px-1 py-[2px]">
        <span className="font-pixel text-[7px] text-[#ffb43b] sm:text-[9px]">HP</span>
        <div className="h-[6px] flex-1 border-[1.5px] border-[#1a1433] bg-[#4a4560] sm:h-[8px] sm:border-2">
          <div className="h-full" style={{ width: `${pct * 100}%`, background: color, boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.25)" }} />
        </div>
      </div>
      {player && (
        <>
          <div className="mt-0.5 text-right font-pixel text-[9px] tabular-nums sm:text-xs" data-testid="hp-numbers">
            {hp}/{f.maxHp}
          </div>
          {xp !== undefined && (
            <div className="mt-0.5 flex items-center gap-1" aria-label={`EXP ${Math.round(xp * 100)}% to next level`}>
              <span className="font-pixel text-[6px] text-[#3b6fd4] sm:text-[8px]">EXP</span>
              <div className="h-[4px] flex-1 border border-[#1a1433] bg-[#4a4560] sm:h-[6px]">
                <div key={f.level} className="h-full bg-[#4fa8ff] transition-[width] duration-1000 ease-[steps(16)]" style={{ width: `${xp * 100}%` }} data-testid="xp-fill" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
