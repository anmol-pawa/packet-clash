"use client";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { pressStart } from "@/app/fonts";
import { DEMO_QUESTIONS } from "@/content/demo";
import { sfx } from "@/game/audio/synth";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { evolutionOf } from "@/game/art/evolve";
import { initialState, reducer, type Fighter } from "@/game/engine/battle";
import { gainXp, xpProgress, xpReward, xpTotal } from "@/game/engine/xp";
import type { BattleStage } from "@/game/render/stage";
import { HpBox } from "./HpBox";
import { MessageBox } from "./MessageBox";
import { MoveMenu } from "./MoveMenu";

const PLAYER: Fighter = { name: PINGKIT.name, level: 5, hp: 60, maxHp: 60 };
const FOE: Fighter = { name: BRAIDWYRM.name, level: 8, hp: 100, maxHp: 100 };
const EVOLVED = evolutionOf(PINGKIT.id)!;
/** The starter's total XP at the start of the demo (part-way through Lv 5). */
const START_XP = 150;
const REWARD = xpReward(FOE.level, true);
const GAIN = gainXp(PLAYER.level, START_XP, REWARD);

/**
 * What happens after the boss faints, one message each: the win, the EXP
 * gain, every level reached, then the evolution.
 */
type After = { kind: "win" } | { kind: "xp" } | { kind: "level"; level: number } | { kind: "evolving" } | { kind: "done" };
const AFTER: After[] = [
  { kind: "win" },
  { kind: "xp" },
  ...GAIN.levelsGained.map((level) => ({ kind: "level" as const, level })),
  { kind: "evolving" },
  { kind: "done" },
];
/** The starter's level and total XP as shown during post-victory step `i`. */
function shownXp(phase: string, i: number): { level: number; total: number } {
  if (phase !== "victory" || i === 0) return { level: PLAYER.level, total: START_XP };
  const a = AFTER[i];
  if (a.kind === "xp") return { level: PLAYER.level, total: Math.min(GAIN.xp, xpTotal(PLAYER.level + 1)) };
  if (a.kind === "level") return { level: a.level, total: Math.min(GAIN.xp, xpTotal(a.level + 1)) };
  return { level: GAIN.level, total: GAIN.xp };
}
const AFTER_MS: Record<After["kind"], number> = { win: 2000, xp: 2200, level: 1800, evolving: 0, done: 0 };

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
  // After a win: EXP, level-ups, then the starter evolves (a demo of the evolve morph).
  const [step, setStep] = useState(0);
  const after = AFTER[step];
  const xp = shownXp(s.phase, step);
  const q = DEMO_QUESTIONS[s.questionIndex];
  const NAME = PLAYER.name.toUpperCase();
  const text =
    s.phase === "victory"
      ? after.kind === "win"
        ? `The wild ${FOE.name.toUpperCase()} fainted! You win!`
        : after.kind === "xp"
          ? `${NAME} gained ${REWARD} EXP. Points!`
          : after.kind === "level"
            ? `${NAME} grew to Lv ${after.level}!`
            : after.kind === "evolving"
              ? `What? ${NAME} is evolving!`
              : `Congratulations! Your ${NAME} evolved into ${EVOLVED.name.toUpperCase()}!`
      : s.phase === "menu"
        ? q.prompt
        : s.phase === "defeat"
          ? `${NAME} fainted… Study up and try again!`
          : explain
            ? `${msg} ${explain}`
            : msg;

  // Stage lifetime + intro.
  useEffect(() => {
    let cancelled = false;
    let st: BattleStage | null = null;
    (async () => {
      const { BattleStage } = await import("@/game/render/stage");
      if (cancelled || !host.current) return;
      st = await BattleStage.create(host.current, {
        player: { anims: PINGKIT.back, scale: 1, fps: PINGKIT.idleFps },
        foe: { anims: BRAIDWYRM.front, scale: 1, fps: BRAIDWYRM.idleFps },
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
        setMsg(`Not quite! ${FOE.name.toUpperCase()} used SPARK COIL!`);
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

  // Each post-victory step: apply it, then move on after a pause (or a tap on the message).
  const advance = useCallback(() => setStep((i) => (AFTER_MS[AFTER[i].kind] > 0 ? Math.min(AFTER.length - 1, i + 1) : i)), []);
  const evolving = useRef(false);
  useEffect(() => {
    if (s.phase !== "victory") return;
    if (after.kind === "xp") {
      sfx.xpFill();
    } else if (after.kind === "level") {
      sfx.levelUp();
    } else if (after.kind === "evolving" && !evolving.current) {
      evolving.current = true;
      const st = stage.current;
      if (!st) return;
      (async () => {
        await st.evolve("player", { anims: EVOLVED.back, scale: 1, fps: EVOLVED.idleFps }, (i) => sfx.evolveTick(i));
        if (stage.current !== st) return;
        sfx.evolved();
        setStep((i) => i + 1);
      })();
    }
    const ms = AFTER_MS[after.kind];
    if (!ms) return;
    const id = setTimeout(advance, ms);
    return () => clearTimeout(id);
  }, [s.phase, after, advance]);

  const pick = useCallback(
    (i: number) => {
      if (s.phase !== "menu") return;
      sfx.unlock();
      sfx.click();
      dispatch({ type: "answer", correct: i === q.answer, choice: i });
    },
    [s.phase, q.answer],
  );

  const answered = s.phase === "player-move" || s.phase === "foe-move";
  const evolved = s.phase === "victory" && after.kind === "done";
  const over = s.phase === "defeat" || evolved;

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
            <HpBox f={{ ...s.foe, hp: hp.foe }} side="foe" className="absolute left-[3%] top-[4%] w-[44%]" />
            <HpBox
              f={{ ...s.player, name: evolved ? EVOLVED.name : s.player.name, level: xp.level, hp: hp.player }}
              side="player"
              xp={xpProgress(xp.level, xp.total)}
              className="absolute bottom-[3%] right-[3%] w-[46%]"
            />
          </>
        )}
      </div>

      {/* Phones: message, moves, buttons stacked. Wide screens: message left, moves right. */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <MessageBox text={text} more={s.phase === "victory" && AFTER_MS[after.kind] > 0} onAdvance={advance} />
        </div>

        {(s.phase === "menu" || answered) && (
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <MoveMenu
              key={s.turn}
              options={q.options}
              locked={s.phase !== "menu"}
              correct={q.answer}
              chosen={s.last?.choice}
              info={[`QUESTION ${s.questionIndex + 1}/${DEMO_QUESTIONS.length}`, answered ? (s.last?.kind === "correct" ? "CORRECT!" : "MISSED!") : s.stats.streak > 1 ? `STREAK ×${s.stats.streak}` : "PICK A MOVE"]}
              onPick={pick}
            />
          </div>
        )}

        {answered && explain && (
          <button
            type="button"
            className="pixel-button min-h-12 px-4 py-3 text-sm lg:col-start-1"
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
          <div className="grid grid-cols-2 gap-2 lg:col-start-1">
            <button type="button" className="pixel-button min-h-12 px-2 py-3 text-xs" onClick={() => window.location.reload()}>
              AGAIN
            </button>
            <Link href="/" className="pixel-button flex min-h-12 items-center justify-center px-2 py-3 text-xs">
              TITLE
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
