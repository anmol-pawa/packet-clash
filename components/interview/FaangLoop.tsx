"use client";
import { MockInterview, type InterviewMode } from "./MockInterview";
import { LOOP_LENGTH, ROUNDS, loopCard, loopDeck, opensRound, roundOf } from "@/game/engine/faangLoop";

const MODE: InterviewMode = {
  deal: loopDeck,
  intro: `A ${LOOP_LENGTH}-question onsite loop in three rounds: rapid-fire concepts, a debugging scenario, then system design. Each question runs against the clock. You finish with a per-round scorecard and a hire / no-hire call; one bombed round caps the verdict.`,
  heading: (n) => {
    if (!opensRound(n)) return null;
    const r = roundOf(n);
    return (
      <div className="pixel-box flex flex-col gap-1 p-3" data-testid="round-heading">
        <p className="font-pixel text-[10px] text-[#9d93d6]">ROUND {ROUNDS.indexOf(r) + 1}/{ROUNDS.length}</p>
        <p className="font-pixel text-xs text-[#ffd257]">{r.title}</p>
        <p className="text-lg leading-snug text-[#c9c1ff]">{r.blurb}</p>
      </div>
    );
  },
  summary: (results) => {
    const card = loopCard(results);
    return {
      verdict: card.verdict,
      extra: (
        <div className="pixel-box flex flex-col gap-2 p-3" data-testid="round-scores">
          {card.rounds.map(({ round, card: c }) => (
            <div key={round.id} className="flex items-center justify-between gap-2">
              <span className="font-pixel text-[9px] text-[#9d93d6]">{round.title}</span>
              <span className={`font-digits text-xl ${card.redFlags.includes(round) ? "text-[#ff6a8a]" : "text-white"}`}>
                {c.correct}/{c.total} · {c.percent}%
              </span>
            </div>
          ))}
          {card.redFlags.length > 0 && (
            <p className="text-lg leading-snug text-[#ff6a8a]">Red flag: a round under 40% caps the loop at LEAN NO HIRE.</p>
          )}
        </div>
      ),
    };
  },
};

/** The FAANG mock loop: three rounds on the shared interview runner. */
export function FaangLoop() {
  return <MockInterview mode={MODE} />;
}
