"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { pressStart } from "@/app/fonts";
import { DEMO_QUESTIONS } from "@/content/demo";
import { gymFoe, winBadge, unlockedBy } from "@/content/gyms";
import type { Town } from "@/content/world";
import { sfx } from "@/game/audio/synth";
import { BOSS_ART } from "@/game/art/bosses";
import { BRAIDWYRM } from "@/game/art/creatures/braidwyrm";
import { PINGKIT } from "@/game/art/creatures/pingkit";
import { evolutionOf } from "@/game/art/evolve";
import { PARTNER_ART } from "@/game/art/partners";
import { initialState, reducer, type Fighter } from "@/game/engine/battle";
import { effectMessage, effectReasons, TYPE_INFO, typesOf } from "@/game/engine/types";
import { partnerFighter, validPartner, winBattle, type Partner } from "@/game/engine/party";
import { xpProgress, xpTotal, type XpGain } from "@/game/engine/xp";
import { dexRecord, recordEncounter, recordWin } from "@/game/engine/dex";
import { getSave, updateSave } from "@/lib/save";
import type { BattleStage } from "@/game/render/stage";
import { BadgeGet } from "./BadgeGet";
import { HpBox } from "./HpBox";
import { MessageBox } from "./MessageBox";
import { MoveMenu } from "./MoveMenu";
import { TypeChart } from "@/components/types/TypeChart";

const DEMO_FOE: Fighter = { name: BRAIDWYRM.name, level: 8, hp: 100, maxHp: 100, types: typesOf(BRAIDWYRM.id) };
/** The demo's Pingkit: Lv 5, part-way through the level. It always evolves after the win. */
const DEMO_PARTNER: Partner = { species: PINGKIT.id, level: 5, xp: 150 };

/**
 * What happens after the boss faints, one message each: the win, the EXP
 * gain, every level reached, the evolution (always in the demo, at gym
 * milestones in a gym), then the badge (gym).
 */
type After = { kind: "win" } | { kind: "xp" } | { kind: "level"; level: number } | { kind: "evolving" } | { kind: "done" } | { kind: "badge" };
function afterSteps(levels: number[], gym: boolean, evolves: boolean): After[] {
  return [
    { kind: "win" },
    { kind: "xp" },
    ...levels.map((level) => ({ kind: "level" as const, level })),
    ...(evolves ? [{ kind: "evolving" as const }, { kind: "done" as const }] : []),
    ...(gym ? [{ kind: "badge" as const }] : []),
  ];
}
/** The partner's level and total XP as shown during post-victory step `a`. */
function shownXp(phase: string, a: After, start: Partner, gain: XpGain): { level: number; total: number } {
  if (phase !== "victory" || a.kind === "win") return { level: start.level, total: start.xp };
  if (a.kind === "xp") return { level: start.level, total: Math.min(gain.xp, xpTotal(start.level + 1)) };
  if (a.kind === "level") return { level: a.level, total: Math.min(gain.xp, xpTotal(a.level + 1)) };
  return { level: gain.level, total: gain.xp };
}
const AFTER_MS: Record<After["kind"], number> = { win: 2000, xp: 2200, level: 1800, evolving: 0, done: 2400, badge: 0 };

/**
 * A battle: one networking question per turn. A right answer is your
 * creature's move, a wrong one gives the foe a free hit. Without `gym` it is
 * the demo (a wild Braidwyrm, ending in an evolution); with one it is that
 * town's gym leader, and winning saves the badge and opens the next town.
 */
export function BattleScreen({ gym }: { gym?: Town }) {
  // A gym battle uses the saved partner (GymGate only renders on the client, so the save is there).
  const { art, FOE, START, PLAYER, MINE, EVOLVED, WIN, AFTER } = useMemo(() => {
    const FOE = gym ? gymFoe(gym) : DEMO_FOE;
    const START = gym ? validPartner(getSave().partner) : DEMO_PARTNER;
    const WIN = winBattle(START, FOE.level, true, gym ? winBadge(getSave().badges, gym.gym) : []);
    const evolvesTo = gym ? WIN.evolvedTo : evolutionOf(START.species)?.id;
    const EVOLVED = evolvesTo ? PARTNER_ART[evolvesTo] : null;
    return {
      art: (gym?.bossSprite && BOSS_ART[gym.bossSprite]) || BRAIDWYRM,
      FOE,
      START,
      PLAYER: partnerFighter(START),
      MINE: PARTNER_ART[START.species] ?? PINGKIT,
      EVOLVED,
      WIN,
      AFTER: afterSteps(WIN.gain.levelsGained, !!gym, !!EVOLVED),
    };
  }, [gym]);
  const REWARD = WIN.reward;
  const FOE_NAME = gym ? `LEADER ${FOE.name.toUpperCase()}` : `The wild ${FOE.name.toUpperCase()}`;
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
  const xp = shownXp(s.phase, after, START, WIN.gain);
  const q = DEMO_QUESTIONS[s.questionIndex];
  const NAME = PLAYER.name.toUpperCase();
  const text =
    s.phase === "victory"
      ? after.kind === "win"
        ? gym
          ? `${FOE_NAME} fainted! You beat the ${gym.name.toUpperCase()} GYM!`
          : `${FOE_NAME} fainted! You win!`
        : after.kind === "xp"
          ? `${NAME} gained ${REWARD} EXP. Points!`
          : after.kind === "level"
            ? `${NAME} grew to Lv ${after.level}!`
            : after.kind === "badge" && gym
              ? `You received the ${gym.badge.toUpperCase()}!`
              : after.kind === "evolving"
                ? `What? ${NAME} is evolving!`
                : `Congratulations! Your ${NAME} evolved into ${EVOLVED?.name.toUpperCase()}!`
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
        player: { anims: MINE.back, scale: 1, fps: MINE.idleFps },
        foe: { anims: art.front, scale: 1, fps: art.idleFps },
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        font: pressStart.style.fontFamily,
      });
      if (cancelled) return st.destroy();
      stage.current = st;
      dispatch({ type: "load", player: PLAYER, foe: FOE, questionCount: DEMO_QUESTIONS.length });
      await st.intro();
      if (cancelled) return;
      setMsg(gym ? `GYM LEADER ${FOE.name.toUpperCase()} wants to battle! Win the ${gym.badge.toUpperCase()}!` : `A wild ${FOE.name.toUpperCase()} appeared!`);
      setTimeout(() => !cancelled && dispatch({ type: "ready" }), gym ? 2200 : 1400);
    })();
    return () => {
      cancelled = true;
      stage.current = null;
      st?.destroy();
    };
    // the stage is built once per battle (gym is fixed for the page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play the move after an answer.
  useEffect(() => {
    const st = stage.current;
    if (!st || !s.last || (s.phase !== "player-move" && s.phase !== "foe-move") || played.current === s.turn) return;
    played.current = s.turn;
    const { last, foe, player } = s;
    (async () => {
      // After the hit: "It's super effective!" and why, from the type chart.
      const effect = (used: string) => {
        if (!last.moveType || last.effect === 1) return;
        const target = s.phase === "player-move" ? foe : player;
        setMsg(`${used} ${effectMessage(last.effect)} ${effectReasons(last.moveType, target.types ?? []).join(" ")}`);
      };
      if (s.phase === "player-move") {
        const used = `Correct! ${PLAYER.name.toUpperCase()} used ${last.moveType ? TYPE_INFO[last.moveType].move : "PACKET TOSS"}!`;
        setMsg(used);
        sfx.cast(660);
        await st.attack("player", last.damage, last.crit, () => {
          sfx.hit(last.crit);
          setHp((h) => ({ ...h, foe: foe.hp }));
          effect(used);
        });
        if (foe.hp <= 0) await st.faint("foe");
      } else {
        const used = `Not quite! ${foe.name.toUpperCase()} used ${art.signature ?? "TACKLE"}!`;
        setMsg(used);
        sfx.miss();
        await st.attack("foe", last.damage, false, () => {
          sfx.hurt();
          setHp((h) => ({ ...h, player: player.hp }));
          effect(used);
        });
        if (player.hp <= 0) await st.faint("player");
      }
      setExplain(q.explain);
    })();
  }, [s, q.explain, art.signature, PLAYER.name]);

  // Each post-victory step: apply it, then move on after a pause (or a tap on the message).
  const steps = AFTER.length;
  const advance = useCallback(() => setStep((i) => (AFTER_MS[AFTER[i]?.kind] > 0 ? Math.min(steps - 1, i + 1) : i)), [AFTER, steps]);
  const evolving = useRef(false);
  // A gym win is saved the moment the leader faints: the badge opens the next town, and the partner keeps its EXP (and evolution).
  // The Packetdex: a gym leader is seen when the battle starts and caught when it faints.
  useEffect(() => {
    if (gym?.bossSprite) updateSave((sv) => ({ ...sv, ...recordEncounter(dexRecord(sv), gym.bossSprite!, START.species) }));
  }, [gym, START]);
  useEffect(() => {
    if (s.phase === "victory" && gym) {
      updateSave((sv) => {
        const badges = winBadge(sv.badges, gym.gym);
        const dex = gym.bossSprite ? recordWin(dexRecord(sv), gym.bossSprite, WIN.partner.species) : {};
        return { ...sv, ...dex, badges, partner: WIN.partner };
      });
    }
  }, [s.phase, gym, WIN]);
  useEffect(() => {
    if (s.phase !== "victory") return;
    if (after.kind === "badge") {
      sfx.badge();
    } else if (after.kind === "xp") {
      sfx.xpFill();
    } else if (after.kind === "level") {
      sfx.levelUp();
    } else if (after.kind === "evolving" && !evolving.current) {
      evolving.current = true;
      const st = stage.current;
      if (!st || !EVOLVED) return;
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
  }, [s.phase, after, advance, EVOLVED]);

  const pick = useCallback(
    (i: number) => {
      if (s.phase !== "menu") return;
      sfx.unlock();
      sfx.click();
      dispatch({ type: "answer", correct: i === q.answer, choice: i, moveType: q.type });
    },
    [s.phase, q.answer, q.type],
  );

  const answered = s.phase === "player-move" || s.phase === "foe-move";
  // Once the morph has played, the HP box shows the new form's name.
  const evolved = s.phase === "victory" && !!EVOLVED && AFTER.slice(0, step).some((a) => a.kind === "evolving");
  const badgeGet = gym && s.phase === "victory" && after.kind === "badge";
  const over = s.phase === "defeat" || (!gym && s.phase === "victory" && after.kind === "done");
  const opened = gym ? unlockedBy(gym.gym) : null;
  const [chart, setChart] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <div className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href={gym ? "/map" : "/"} className="py-2 hover:text-white">
          {gym ? "◀ MAP" : "◀ TITLE"}
        </Link>
        <span className="flex items-center gap-3">
          <span>
            {gym ? `${gym.name.toUpperCase()} GYM` : "DEMO BATTLE"} · TURN {Math.max(1, s.turn)}
          </span>
          <button type="button" className="pixel-button px-2 py-2 text-[9px] pointer-coarse:min-h-11" onClick={() => setChart(true)} data-testid="open-type-chart">
            TYPES
          </button>
        </span>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden border-4 border-[#0b0818]" style={{ maxWidth: "min(768px, calc((100dvh - 300px) * 4 / 3))", minWidth: "min(100%, 288px)" }}>
        <div ref={host} className="absolute inset-0" data-testid="stage" />
        {s.phase !== "loading" && (
          <>
            <HpBox f={{ ...s.foe, hp: hp.foe }} side="foe" className="absolute left-[3%] top-[4%] w-[44%]" />
            <HpBox
              f={{ ...s.player, name: evolved && EVOLVED ? EVOLVED.name : s.player.name, level: xp.level, hp: hp.player }}
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
          <MessageBox text={text} more={s.phase === "victory" && step < steps - 1 && AFTER_MS[after.kind] > 0} onAdvance={advance} />
        </div>

        {(s.phase === "menu" || answered) && (
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <MoveMenu
              key={s.turn}
              options={q.options}
              locked={s.phase !== "menu"}
              correct={q.answer}
              chosen={s.last?.choice}
              moveType={q.type}
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
              {gym ? "TRY AGAIN" : "AGAIN"}
            </button>
            <Link href={gym ? "/map" : "/"} className="pixel-button flex min-h-12 items-center justify-center px-2 py-3 text-xs">
              {gym ? "WORLD MAP" : "TITLE"}
            </Link>
          </div>
        )}
      </div>

      {chart && (
        <div role="dialog" aria-modal="true" aria-label="Type chart" className="fixed inset-0 z-40 overflow-y-auto bg-[#120e2a] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-pixel text-xs text-[#ffd257] sm:text-sm">TYPE CHART</h2>
              <button type="button" className="pixel-button min-h-11 px-3 py-2 text-[10px]" onClick={() => setChart(false)} autoFocus>
                CLOSE ✕
              </button>
            </div>
            <TypeChart highlight={q.type && s.foe.types?.length ? { atk: q.type, def: s.foe.types } : undefined} />
          </div>
        </div>
      )}

      {badgeGet && <BadgeGet town={gym} leader={FOE.name} opened={opened} />}
    </main>
  );
}
