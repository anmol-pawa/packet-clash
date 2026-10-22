"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExplainBox } from "@/components/battle/ExplainBox";
import { QuestionPanel } from "@/components/battle/QuestionPanel";
import { MOCK_LENGTH, interviewDeck, scorecard, timeLimit, type Result } from "@/game/engine/mockInterview";
import { grade, type Response } from "@/game/engine/questions";
import { recordReview } from "@/lib/save";

type Stage = "intro" | "ask" | "review" | "done";

/**
 * The mock interview: one question at a time against a countdown, an
 * explanation after each, then a scorecard. A miss or timeout goes back into
 * the Leitner box like any battle answer.
 */
export function MockInterview() {
  const [seed, setSeed] = useState(1);
  const deck = useMemo(() => interviewDeck(seed), [seed]);
  const [stage, setStage] = useState<Stage>("intro");
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [response, setResponse] = useState<Response>();
  const [left, setLeft] = useState<number | null>(null);
  const started = useRef(0);
  const q = deck[i];

  const finish = (r: Response | undefined) => {
    const limit = timeLimit(q);
    const timedOut = r === undefined;
    const correct = !!r && grade(q, r);
    const seconds = timedOut ? limit : Math.min(limit, Math.round((Date.now() - started.current) / 100) / 10);
    recordReview(q.id, correct);
    setResponse(r);
    setResults((rs) => [...rs, { q, correct, timedOut, seconds }]);
    setStage("review");
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (stage !== "ask") return;
    started.current = Date.now();
    const limit = timeLimit(deck[i]);
    const t = setInterval(() => {
      const remaining = limit - (Date.now() - started.current) / 1000;
      if (remaining <= 0) {
        clearInterval(t);
        setLeft(0);
        finishRef.current(undefined);
      } else setLeft(Math.ceil(remaining));
    }, 250);
    return () => clearInterval(t);
  }, [stage, i, deck]);

  const start = () => {
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setI(0);
    setResults([]);
    setResponse(undefined);
    setLeft(null);
    setStage("ask");
  };
  const next = () => {
    if (i + 1 >= deck.length) setStage("done");
    else {
      setI(i + 1);
      setResponse(undefined);
      setLeft(null);
      setStage("ask");
    }
    window.scrollTo(0, 0);
  };

  if (stage === "intro")
    return (
      <section className="pixel-box flex flex-col gap-3 p-3" data-testid="interview-intro">
        <p className="text-lg leading-snug text-white sm:text-xl">
          {MOCK_LENGTH} classic networking interview questions, each against the clock. Right answers earn marks equal to their difficulty; a timeout scores nothing. You get a scorecard and the questions to revisit at the end.
        </p>
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          START INTERVIEW ▶
        </button>
      </section>
    );

  if (stage === "done") {
    const sc = scorecard(results);
    return (
      <section className="flex flex-col gap-3" data-testid="scorecard">
        <div className="pixel-box flex flex-col items-center gap-1 p-4 text-center">
          <p className="font-pixel text-[10px] text-[#9d93d6]">SCORECARD</p>
          <p className="font-pixel text-2xl text-[#ffd257]" data-testid="verdict">
            {sc.verdict}
          </p>
          <p className="font-digits text-3xl text-white">{sc.percent}%</p>
          <p className="text-lg text-[#c9c1ff]">
            {sc.correct}/{sc.total} right · {sc.timedOut} timed out · {sc.averageSeconds}s each
          </p>
        </div>
        <div className="pixel-box grid grid-cols-3 gap-2 p-3 text-center">
          {([1, 2, 3] as const).map((d) => (
            <div key={d}>
              <p className="font-pixel text-[9px] text-[#9d93d6]">{d === 1 ? "WARM-UP" : d === 2 ? "STANDARD" : "TOUGH"}</p>
              <p className="font-digits text-xl text-white">
                {sc.byDifficulty[d].correct}/{sc.byDifficulty[d].total}
              </p>
            </div>
          ))}
        </div>
        {sc.missed.length > 0 && (
          <div className="pixel-box flex flex-col gap-2 p-3">
            <p className="font-pixel text-[10px] text-[#ff6a8a]">REVISIT</p>
            {sc.missed.map((m) => (
              <details key={m.id} className="text-lg leading-snug text-white">
                <summary className="min-h-8 cursor-pointer">{m.prompt}</summary>
                <p className="mt-1 text-base text-[#c9c1ff] sm:text-lg">{m.explain}</p>
              </details>
            ))}
          </div>
        )}
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          TRY AGAIN ▶
        </button>
      </section>
    );
  }

  const locked = stage === "review";
  const last = results[results.length - 1];
  const limit = timeLimit(q);
  const shown = left ?? limit;
  return (
    <section className="flex flex-col gap-3" data-testid="interview-question">
      <div className="pixel-box flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
          <span>
            QUESTION {i + 1}/{deck.length}
          </span>
          <span className={shown <= 10 && !locked ? "text-[#ff6a8a]" : "text-[#ffd257]"} data-testid="timer">
            {locked ? (last?.timedOut ? "TIME UP" : `${last?.seconds}s`) : `${shown}s`}
          </span>
        </div>
        <div className="h-2 w-full bg-[#0b0818]" aria-hidden>
          <div className="h-full bg-[#ffd257]" style={{ width: `${locked ? 0 : (shown / limit) * 100}%` }} />
        </div>
        <p className="text-xl leading-snug text-white sm:text-2xl">{q.prompt}</p>
      </div>
      <QuestionPanel key={i} q={q} seed={seed + i} locked={locked} response={response} info={[`QUESTION ${i + 1}/${deck.length}`, locked ? (last?.correct ? "CORRECT!" : last?.timedOut ? "TIME UP!" : "MISSED!") : "ANSWER!"]} onSubmit={(r) => finish(r)} />
      {locked && (
        <>
          <ExplainBox q={q} correct={!!last?.correct} />
          <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={next}>
            {i + 1 >= deck.length ? "SEE SCORECARD ▶" : "NEXT QUESTION ▶"}
          </button>
        </>
      )}
    </section>
  );
}
