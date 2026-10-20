"use client";
import { useState } from "react";
import { TypeChip } from "@/components/battle/TypeChip";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { TOWNS } from "@/content/world";
import { BOSS_ART } from "@/game/art/bosses";
import type { CreatureArt } from "@/game/art/creature";
import { PARTNER_ART } from "@/game/art/partners";
import { DEX, dexLabel, dexRecord, dexStatus, type DexStatus } from "@/game/engine/dex";
import { EVOLVE_MILESTONES, STARTERS } from "@/game/engine/party";
import { typesOf } from "@/game/engine/types";
import { silhouette, type SpriteDef } from "@/lib/pixel";
import { useSave } from "@/lib/save";

const artOf = (id: string): CreatureArt => PARTNER_ART[id] ?? BOSS_ART[id];
const SHADOW = "#120d29";

/** A tiny sealed packet: the "caught" mark (an envelope with a green checksum seal). */
const CAUGHT_MARK: SpriteDef = {
  palette: { o: "#0b0818", w: "#f4f1ff", s: "#bdb4ec", g: "#5fd47a", d: "#2f8a4a" },
  rows: [
    "ooooooooo",
    "owwwwwwwo",
    "osswwwsso",
    "owwsgswwo",
    "owwwdwwwo",
    "owwwwwwwo",
    "ooooooooo",
  ],
};

/** Where to meet a creature, or what it is to the player. */
function note(id: string, status: DexStatus): string {
  const town = TOWNS.find((t) => t.bossSprite === id);
  const evo = EVOLVE_MILESTONES.find((m) => m.from === id);
  const from = EVOLVE_MILESTONES.find((m) => m.to === id);
  if (town) {
    if (status === "caught") return `Leader of the ${town.name} gym (gym ${town.gym}). Beaten: its data is registered.`;
    return `Waits in the ${town.name} gym (gym ${town.gym}).${status === "seen" ? " Beat it to register its data." : ""}`;
  }
  if (from) return `Evolves from ${artOf(from.from).name} at the gym ${from.badge} badge.`;
  if (evo) return `A starter. Evolves at the gym ${evo.badge} badge.`;
  return STARTERS.includes(id as never) ? "A starter." : "";
}

/**
 * The Packetdex: every creature in dex order. Seen ones show their sprite,
 * types and blurb; caught ones get a sealed-packet mark; unseen ones are
 * dark silhouettes. Tapping an entry shows it animated in the detail box.
 */
export function Packetdex() {
  const save = useSave();
  const rec = dexRecord(save);
  const [sel, setSel] = useState<string>(DEX[0]);
  const art = artOf(sel);
  const status = dexStatus(rec, sel);
  const known = status !== "unseen";
  const frames = known ? art.front.idle : [silhouette(art.front.idle[0], SHADOW)];

  return (
    <div className="flex flex-col gap-3" data-testid="packetdex">
      <p className="flex justify-between font-pixel text-[9px] text-[#c9c1ff] sm:text-[10px]" data-testid="dex-counts">
        <span>
          SEEN <span className="text-[#ffd257]">{rec.seen.length}</span>/{DEX.length}
        </span>
        <span>
          CAUGHT <span className="text-[#7dff9a]">{rec.caught.length}</span>/{DEX.length}
        </span>
      </p>

      <section className="pixel-box flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4" aria-live="polite" data-testid="dex-detail">
        <div className="dex-window flex h-[204px] w-[204px] shrink-0 items-end justify-center self-center rounded-md">
          <PixelSprite key={`${sel}-${known}`} frames={frames} scale={art.size > 64 ? 2 : 3} frameMs={1000 / art.idleFps} label={known ? art.name : "Unknown creature"} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 font-pixel text-xs text-[#f4f1ff] sm:text-sm">
            <span className="text-[#9d93d6]">{dexLabel(sel)}</span>
            <span data-testid="dex-name">{known ? art.name.toUpperCase() : "?????"}</span>
            {status === "caught" && <PixelSprite frames={[CAUGHT_MARK]} scale={2} label="Caught" />}
          </div>
          {known ? (
            <>
              <div className="flex gap-1">
                {typesOf(sel).map((t) => (
                  <TypeChip key={t} type={t} long />
                ))}
              </div>
              <p className="text-lg leading-snug text-[#f4f1ff]">{art.blurb}</p>
            </>
          ) : (
            <p className="text-lg leading-snug text-[#9d93d6]">Not seen yet.</p>
          )}
          <p className="text-base leading-snug text-[#c9c1ff]">{note(sel, status)}</p>
        </div>
      </section>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Packetdex entries">
        {DEX.map((id) => {
          const a = artOf(id);
          const st = dexStatus(rec, id);
          const on = id === sel;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setSel(id)}
                aria-pressed={on}
                aria-label={`${dexLabel(id)} ${st === "unseen" ? "unknown" : a.name}, ${st}`}
                data-testid={`dex-${id}`}
                data-status={st}
                className={`dex-cell flex w-full flex-col items-center gap-1 px-1 pb-2 pt-1 ${on ? "dex-cell-on" : ""}`}
              >
                <span className="flex w-full items-center justify-between font-pixel text-[7px] text-[#9d93d6] sm:text-[8px]">
                  {dexLabel(id).slice(4)}
                  {st === "caught" ? <PixelSprite frames={[CAUGHT_MARK]} scale={1} label="Caught" /> : <span className="h-[7px]" />}
                </span>
                <span className="flex h-[96px] items-end justify-center">
                  <PixelSprite frames={[st === "unseen" ? silhouette(a.front.idle[0], SHADOW) : a.front.idle[0]]} scale={1} label={st === "unseen" ? "Unknown creature" : a.name} />
                </span>
                <span className={`max-w-full truncate font-pixel text-[7px] sm:text-[8px] ${st === "unseen" ? "text-[#6c62a8]" : "text-[#f4f1ff]"}`}>{st === "unseen" ? "?????" : a.name.toUpperCase()}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
