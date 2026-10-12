"use client";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { pressStart } from "@/app/fonts";
import { DEMO_QUESTIONS } from "@/content/demo";
import { sfx } from "@/game/audio/synth";
import { BITLING, BITLING_DIM, GLITCHLING, GLITCHLING_DIM } from "@/game/art/mascot";
import { initialState, reducer, type Fighter } from "@/game/engine/battle";
import type { BattleStage } from "@/game/render/stage";
import { HpBox } from "./HpBox";
import { useTyped } from "./useTyped";

const PLAYER: Fighter = { name: "Bitling", level: 5, hp: 60, maxHp: 60 };
const FOE: Fighter = { name: "Glitchling", level: 4, hp: 100, maxHp: 100 };

/**
 * The demo battle: a wild foe, one networking question per turn. A right
 * answer is your creature's move, a wrong one gives the foe a free hit.
 */
export function BattleScreen() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<BattleStage | null>(null);
  const played = useRef(-1);
  const [s, dispatch] = useReducer(reducer, undefined, initialState);
  const [hp, setHp] = useState({ player: PLAYER.hp, foe: FOE.hp });
  const [msg, setMsg] = useState("");
  const [explain, setExplain] = useState<string | null>(null);
  const q = DEMO_QUESTIONS[s.questionIndex];
  const text =
    s.phase === "menu"
      ? q.prompt
      : s.phase === "victory"
        ? `The wild ${FOE.name.toUpperCase()} fainted! You win!`
        : s.phase === "defeat"
          ? `${PLAYER.name.toUpperCase()} fainted… Study up and try again!`
          : explain
            ? `${msg} ${explain}`
            : msg;
  const typed = useTyped(text);

  // Stage lifetime + intro.
  useEffect(() => {
    let cancelled = false;
    let st: BattleStage | null = null;
    (async () => {
      const { BattleStage } = await import("@/game/render/stage");
      if (cancelled || !host.current) return;
      st = await BattleStage.create(host.current, {
        player: [BITLING, BITLING, BITLING_DIM],
        foe: [GLITCHLING, GLITCHLING_DIM],
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        font: pressStart.style.fontFamily,
      });
      if (cancelled) return st.destroy();
      stage.current = st;
      dispatch({ type: "load", player: PLAYER, foe: FOE, questionCount: DEMO_QUESTIONS.length });
      await st.intro();
      if (cancelled) return;
      setMsg(`A wild ${FOE.name.toUpperCase()} appeared!`);
      setTimeout(() => !cancelled && dispatch({ type: "ready" }), 1400);
    })();
    return () => {
      cancelled = true;
      stage.current = null;
      st?.destroy();
    };
  }, []);

  // Play the move after an answer.
  useEffect(() => {
    const st = stage.current;
    if (!st || !s.last || (s.phase !== "player-move" && s.phase !== "foe-move") || played.current === s.turn) return;
    played.current = s.turn;
    const { last, foe, player } = s;
    (async () => {
      if (s.phase === "player-move") {
        setMsg(`Correct! ${PLAYER.name.toUpperCase()} used PACKET TOSS!`);
        sfx.cast(660);
        await st.attack("player", last.damage, last.crit, () => {
          sfx.hit(last.crit);
          setHp((h) => ({ ...h, foe: foe.hp }));
        });
        if (foe.hp <= 0) await st.faint("foe");
      } else {
        setMsg(`Not quite! ${FOE.name.toUpperCase()} used CORRUPT!`);
        sfx.miss();
        await st.attack("foe", last.damage, false, () => {
          sfx.hurt();
          setHp((h) => ({ ...h, player: player.hp }));
        });
        if (player.hp <= 0) await st.faint("player");
      }
      setExplain(q.explain);
    })();
  }, [s, q.explain]);

  const answered = s.phase === "player-move" || s.phase === "foe-move";
  const over = s.phase === "victory" || s.phase === "defeat";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <div className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href="/" className="py-2 hover:text-white">
          ◀ TITLE
        </Link>
        <span>DEMO BATTLE · TURN {Math.max(1, s.turn)}</span>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden border-4 border-[#0b0818]" style={{ maxWidth: "min(768px, calc((100dvh - 300px) * 4 / 3))", minWidth: "min(100%, 288px)" }}>
        <div ref={host} className="absolute inset-0" data-testid="stage" />
        {s.phase !== "loading" && (
          <>
            <HpBox f={{ ...s.foe, hp: hp.foe }} className="absolute left-[3%] top-[4%] w-[44%]" />
            <HpBox f={{ ...s.player, hp: hp.player }} showNumbers className="absolute bottom-[3%] right-[3%] w-[46%]" />
          </>
        )}
      </div>

      <div className="pixel-box min-h-[5.5rem] p-3 text-lg leading-snug sm:text-xl" role="status" aria-live="polite" onClick={typed.skip}>
        {typed.shown}
        {!typed.done && <span className="blink">▌</span>}
      </div>

      {(s.phase === "menu" || answered) && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Moves">
          {q.options.map((o, i) => {
            const state = !answered ? "" : i === q.answer ? "move-right" : s.last?.choice === i ? "move-wrong" : "opacity-50";
            return (
              <button
                key={i}
                type="button"
                disabled={s.phase !== "menu"}
                onClick={() => {
                  sfx.unlock();
                  sfx.click();
                  dispatch({ type: "answer", correct: i === q.answer, choice: i });
                }}
                className={`move-button min-h-14 px-3 py-2 text-left text-base leading-tight sm:text-lg ${state}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}

      {answered && explain && (
        <button
          type="button"
          className="pixel-button min-h-12 px-4 py-3 text-sm"
          onClick={() => {
            sfx.click();
            setExplain(null);
            setMsg("");
            if (s.foe.hp <= 0) sfx.victory();
            else if (s.player.hp <= 0) sfx.defeat();
            dispatch({ type: "resolve" });
          }}
        >
          NEXT ▶
        </button>
      )}

      {over && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="pixel-button min-h-12 px-2 py-3 text-xs" onClick={() => window.location.reload()}>
            AGAIN
          </button>
          <Link href="/" className="pixel-button flex min-h-12 items-center justify-center px-2 py-3 text-xs">
            TITLE
          </Link>
        </div>
      )}
    </main>
  );
}
