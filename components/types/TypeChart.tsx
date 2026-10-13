"use client";
import { useState } from "react";
import { TypeChip } from "@/components/battle/TypeChip";
import { TypeIcon } from "@/components/battle/TypeIcon";
import { CHART, matchupReason, TYPE_INFO, TYPES, typeMult, type PacketType } from "@/game/engine/types";

const MULT_LABEL: Record<number, string> = { 2: "×2", 0.5: "×½", 1: "" };

/**
 * The type chart: attacking types down the side, defending types across the
 * top. ×2 cells are green, ×½ cells red, neutral cells blank. Tapping a cell
 * shows that matchup's reason. In battle, `highlight` outlines the cells for
 * the move a right answer would fire against the foe's types.
 */
export function TypeChart({ highlight }: { highlight?: { atk: PacketType; def: readonly PacketType[] } }) {
  const first = highlight ? (CHART.find((m) => m.atk === highlight.atk && highlight.def.includes(m.def)) ?? { atk: highlight.atk, def: highlight.def[0] }) : undefined;
  const [sel, setSel] = useState<{ atk: PacketType; def: PacketType }>(first ?? { atk: "NETWORK", def: "TRANSPORT" });
  const mult = typeMult(sel.atk, sel.def);

  return (
    <div className="flex flex-col gap-3" data-testid="type-chart">
      <div className="pixel-box p-2 sm:p-3">
        <table className="w-full table-fixed border-collapse font-pixel text-[8px] sm:text-[10px]">
          <caption className="px-1 pb-2 text-left text-[8px] leading-relaxed text-[#9d93d6] sm:text-[10px]">ATTACK ▼ · DEFEND ▶ · TAP A CELL</caption>
          <thead>
            <tr>
              <th className="w-[14%] sm:w-[16%]" />
              {TYPES.map((d) => (
                <th key={d} scope="col" className="pb-1 font-normal" title={`${d} defending`}>
                  <span className="flex flex-col items-center gap-1">
                    <TypeIcon type={d} scale={2} />
                    <span className="text-[6px] text-[#c9c1ff] sm:text-[8px]">{TYPE_INFO[d].label}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map((a) => (
              <tr key={a}>
                <th scope="row" className="pr-1 font-normal" title={`${a} attacking`}>
                  <span className="flex items-center justify-end gap-1">
                    <span className="hidden text-[8px] text-[#c9c1ff] sm:inline">{TYPE_INFO[a].label}</span>
                    <TypeIcon type={a} scale={2} />
                  </span>
                </th>
                {TYPES.map((d) => {
                  const m = typeMult(a, d);
                  const on = sel.atk === a && sel.def === d;
                  const hl = highlight?.atk === a && highlight.def.includes(d);
                  return (
                    <td key={d} className="p-[1px]">
                      <button
                        type="button"
                        onClick={() => setSel({ atk: a, def: d })}
                        aria-pressed={on}
                        aria-label={`${a} against ${d}: ${m === 2 ? "super effective" : m === 0.5 ? "not very effective" : "neutral"}`}
                        data-testid={`cell-${a}-${d}`}
                        className={`type-cell flex h-9 w-full items-center justify-center sm:h-11 ${m === 2 ? "type-cell-up" : m === 0.5 ? "type-cell-down" : ""} ${hl ? "type-cell-hl" : ""} ${on ? "type-cell-on" : ""}`}
                      >
                        {MULT_LABEL[m]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pixel-box flex flex-col gap-2 p-3 sm:p-4" aria-live="polite" data-testid="type-reason">
        <div className="flex flex-wrap items-center gap-2 font-pixel text-[9px] sm:text-[10px]">
          <TypeChip type={sel.atk} long className="text-[8px] sm:text-[9px]" />
          <span className="text-[#c9c1ff]">▶</span>
          <TypeChip type={sel.def} long className="text-[8px] sm:text-[9px]" />
          <span className={mult === 2 ? "text-[#7dff9a]" : mult === 0.5 ? "text-[#ff9fb4]" : "text-[#c9c1ff]"}>
            {mult === 2 ? "×2 SUPER EFFECTIVE" : mult === 0.5 ? "×½ NOT VERY EFFECTIVE" : "×1 NEUTRAL"}
          </span>
        </div>
        <p className="text-base leading-snug text-[#e8e4ff]">{matchupReason(sel.atk, sel.def)}</p>
      </div>

      <div className="pixel-box p-3 sm:p-4">
        <h2 className="mb-2 font-pixel text-[10px] text-[#ffd257]">EACH TYPE&apos;S PDU AND MOVE</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {TYPES.map((t) => (
            <li key={t} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
              <TypeChip type={t} long className="text-[8px] sm:text-[9px]" />
              <span className="text-[#e8e4ff]">{TYPE_INFO[t].pdu ? `${TYPE_INFO[t].pdu}s` : "guards every layer"}</span>
              <span className="font-pixel text-[8px] text-[#ffd257]">{TYPE_INFO[t].move}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-base leading-snug text-[#c9c1ff]">Each layer serves the one above it: a move from one layer down is super effective, and a move at the layer below is not very effective. Dual types multiply.</p>
      </div>
    </div>
  );
}
