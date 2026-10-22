"use client";
import { useState } from "react";
import { ExplainBox } from "@/components/battle/ExplainBox";
import { QuestionPanel } from "@/components/battle/QuestionPanel";
import { DAILY_LENGTH, dailyDeck, dayKey, doneToday, liveStreak } from "@/game/engine/daily";
import { grade, type Response } from "@/game/engine/questions";
import { recordDaily, recordReview, useSave } from "@/lib/save";

type Stage = "intro" | "ask" | "review" | "done";

/**
 * Today's challenge: five questions, no clock, the same deck all day. Finishing
 * it extends the streak; replaying it later the same day changes nothing.
 */
export function DailyChallenge() {
  const save = useSave();
  const [key] = useState(() => dayKey(new Date()));
  const [deck] = useState(() => dailyDeck(key));
  const [stage, setStage] = useState<Stage>("intro");
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [response, setResponse] = useState<Response>();
  const [ok, setOk] = useState(false);
  const q = deck[i];
  const streak = liveStreak(save.daily, key);
  const done = doneToday(save.daily, key);

  const submit = (r: Response) => {
    const correct = grade(q, r);
    recordReview(q.id, correct);
    setResponse(r);
    setOk(correct);
    if (correct) setScore((s) => s + 1);
    setStage("review");
  };
  const next = () => {
    if (i + 1 >= deck.length) {
      recordDaily(key, score);
      setStage("done");
    } else {
      setI(i + 1);
      setResponse(undefined);
      setStage("ask");
    }
    window.scrollTo(0, 0);
  };
  const start = () => {
    setI(0);
    setScore(0);
    setResponse(undefined);
    setStage("ask");
  };

  const streakBox = (
    <div className="pixel-box grid grid-cols-2 gap-2 p-3 text-center" data-testid="streak">
      <div>
        <p className="font-pixel text-[9px] text-[#9d93d6]">STREAK</p>
        <p className="font-digits text-2xl text-[#ffd257]">{streak} {streak === 1 ? "DAY" : "DAYS"}</p>
      </div>
      <div>
        <p className="font-pixel text-[9px] text-[#9d93d6]">BEST</p>
        <p className="font-digits text-2xl text-white">{save.daily.best}</p>
      </div>
    </div>
  );

  if (stage === "intro")
    return (
      <section className="flex flex-col gap-3" data-testid="daily-intro">
        {streakBox}
        <div className="pixel-box flex flex-col gap-3 p-3">
          <p className="font-pixel text-[10px] text-[#9d93d6]">{key}</p>
          <p className="text-lg leading-snug text-white sm:text-xl">
            {done
              ? `Today's challenge is done: you got ${save.daily.score}/${DAILY_LENGTH}. Come back tomorrow to keep the streak, or replay for practice.`
              : `${DAILY_LENGTH} questions, the same for everyone today, no clock. Finish them to extend your streak.`}
          </p>
          <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
            {done ? "REPLAY ▶" : "START ▶"}
          </button>
        </div>
      </section>
    );

  if (stage === "done")
    return (
      <section className="flex flex-col gap-3" data-testid="daily-done">
        <div className="pixel-box flex flex-col items-center gap-1 p-4 text-center">
          <p className="font-pixel text-[10px] text-[#9d93d6]">TODAY</p>
          <p className="font-digits text-4xl text-white">
            {score}/{deck.length}
          </p>
          <p className="text-lg text-[#c9c1ff]">{score === deck.length ? "Flawless!" : score >= 3 ? "Solid run." : "Read the explanations and try again tomorrow."}</p>
        </div>
        {streakBox}
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          REPLAY FOR PRACTICE ▶
        </button>
      </section>
    );

  const locked = stage === "review";
  return (
    <section className="flex flex-col gap-3" data-testid="daily-question">
      <div className="pixel-box flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
          <span>
            QUESTION {i + 1}/{deck.length}
          </span>
          <span className="text-[#ffd257]">{score} RIGHT</span>
        </div>
        <p className="text-xl leading-snug text-white sm:text-2xl">{q.prompt}</p>
      </div>
      <QuestionPanel key={i} q={q} seed={i + 1} locked={locked} response={response} info={[`QUESTION ${i + 1}/${deck.length}`, locked ? (ok ? "CORRECT!" : "MISSED!") : "ANSWER!"]} onSubmit={submit} />
      {locked && (
        <>
          <ExplainBox q={q} correct={ok} />
          <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={next}>
            {i + 1 >= deck.length ? "FINISH ▶" : "NEXT QUESTION ▶"}
          </button>
        </>
      )}
    </section>
  );
}
