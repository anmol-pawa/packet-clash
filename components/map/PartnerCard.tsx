"use client";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { PARTNER_ART } from "@/game/art/partners";
import { EVOLVE_MILESTONES, PARTNER_NAMES, partnerMaxHp, type Partner } from "@/game/engine/party";
import { xpProgress, xpTotal, MAX_LEVEL } from "@/game/engine/xp";

/** The partner creature on the world map: its idle sprite, level, EXP bar and next evolution milestone. */
export function PartnerCard({ p }: { p: Partner }) {
  const art = PARTNER_ART[p.species];
  const next = EVOLVE_MILESTONES.find((m) => m.from === p.species);
  const toNext = p.level >= MAX_LEVEL ? 0 : xpTotal(p.level + 1) - p.xp;
  return (
    <section className="pixel-box flex items-center gap-3 px-3 py-2" aria-label="Your partner" data-testid="partner-card">
      {art && <PixelSprite frames={art.front.idle} scale={1} frameMs={1000 / art.idleFps} label={art.name} className="shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 font-pixel text-[10px] text-[#f4f1ff] sm:text-xs">
          <span className="truncate">{(PARTNER_NAMES[p.species] ?? p.species).toUpperCase()}</span>
          <span className="shrink-0 text-[#ffd257]">Lv{p.level}</span>
        </div>
        <div className="flex items-center gap-2 font-pixel text-[8px] text-[#9d93d6] sm:text-[9px]">
          <span>EXP</span>
          <div className="h-2 flex-1 border-2 border-[#0b0818] bg-[#2a2350]">
            <div className="h-full bg-[#5cc8ff]" style={{ width: `${xpProgress(p.level, p.xp) * 100}%` }} />
          </div>
        </div>
        <p className="text-base leading-tight text-[#c9c2e8]">
          HP {partnerMaxHp(p.level)} · {toNext > 0 ? `${toNext} EXP to Lv${p.level + 1}` : "Max level"}
          {next ? ` · evolves at badge ${next.badge}` : ""}
        </p>
      </div>
    </section>
  );
}
