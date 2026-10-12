import type { Fighter } from "@/game/engine/battle";

/** Handheld-style HP box: name, level and a stepped HP bar (green → yellow → red). */
export function HpBox({ f, showNumbers, className = "" }: { f: Fighter; showNumbers?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(1, f.hp / f.maxHp));
  const color = pct > 0.5 ? "#4ade80" : pct > 0.2 ? "#facc15" : "#f43f5e";
  return (
    <div className={`hp-box px-2 py-1.5 sm:px-3 sm:py-2 ${className}`} aria-label={`${f.name} level ${f.level}, HP ${f.hp} of ${f.maxHp}`}>
      <div className="flex items-baseline justify-between gap-2 font-pixel text-[9px] sm:text-xs">
        <span className="truncate">{f.name.toUpperCase()}</span>
        <span className="shrink-0">Lv{f.level}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="font-pixel text-[7px] text-[#ffb43b] sm:text-[9px]">HP</span>
        <div className="h-[7px] flex-1 border-2 border-[#1a1433] bg-[#3b3175] sm:h-[9px]">
          <div className="h-full transition-[width] duration-700 ease-[steps(12)]" style={{ width: `${pct * 100}%`, background: color }} />
        </div>
      </div>
      {showNumbers && (
        <div className="mt-0.5 text-right font-pixel text-[9px] tabular-nums sm:text-xs">
          {f.hp}/{f.maxHp}
        </div>
      )}
    </div>
  );
}
