"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionPanel } from "@/components/battle/QuestionPanel";
import { DOMAINS, EXAM_LENGTH, EXAM_SECONDS, examDeck, examScorecard, type ExamResult } from "@/game/engine/ccnaExam";
import { grade, type Response } from "@/game/engine/questions";
import { recordReview } from "@/lib/save";

type Stage = "intro" | "ask" | "done";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The CCNA mock exam: {EXAM_LENGTH} questions against one clock, no feedback
 * until the end, then a domain-weighted scorecard. Every answer (and every
 * question left when time runs out) goes into the Leitner box.
 */
export function CcnaExam() {
  const [seed, setSeed] = useState(1);
  const deck = useMemo(() => examDeck(seed), [seed]);
  const [stage, setStage] = useState<Stage>("intro");
  const [i, setI] = useState(0);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [left, setLeft] = useState(EXAM_SECONDS);
  const startedAt = useRef(0);
  const resultsRef = useRef<ExamResult[]>([]);

  const record = (rs: ExamResult[]) => {
    resultsRef.current = rs;
    setResults(rs);
  };
  const timeUp = useRef(() => {});
  useEffect(() => {
    timeUp.current = () => {
      const rest = deck.slice(resultsRef.current.length).map((e) => ({ ...e, correct: false, answered: false }));
      for (const r of rest) recordReview(r.q.id, false);
      record([...resultsRef.current, ...rest]);
      setStage("done");
    };
  });

  useEffect(() => {
    if (stage !== "ask") return;
    const t = setInterval(() => {
      const remaining = Math.ceil(EXAM_SECONDS - (Date.now() - startedAt.current) / 1000);
      if (remaining <= 0) {
        clearInterval(t);
        setLeft(0);
        timeUp.current();
      } else setLeft(remaining);
    }, 500);
    return () => clearInterval(t);
  }, [stage]);

  const start = () => {
    setSeed(Math.floor(Math.random() * 2 ** 30) + 1);
    record([]);
    setI(0);
    setLeft(EXAM_SECONDS);
    startedAt.current = Date.now();
    setStage("ask");
  };
  const submit = (r: Response) => {
    const e = deck[i];
    const correct = grade(e.q, r);
    recordReview(e.q.id, correct);
    record([...resultsRef.current, { ...e, correct, answered: true }]);
    if (i + 1 >= deck.length) setStage("done");
    else setI(i + 1);
    window.scrollTo(0, 0);
  };

  if (stage === "intro")
    return (
      <section className="pixel-box flex flex-col gap-3 p-3" data-testid="ccna-intro">
        <p className="text-lg leading-snug text-white sm:text-xl">
          {EXAM_LENGTH} questions in {EXAM_SECONDS / 60} minutes, dealt across the six 200-301 domains in proportion to their exam weight. No feedback until the end, like the real thing; then a scorecard per domain and the questions to revisit.
        </p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-pixel text-[9px] text-[#c9c1ff]">
          {DOMAINS.map((d) => (
            <li key={d.id}>
              {d.weight}% {d.name}
            </li>
          ))}
        </ul>
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          START EXAM ▶
        </button>
      </section>
    );

  if (stage === "done") {
    const sc = examScorecard(results);
    return (
      <section className="flex flex-col gap-3" data-testid="ccna-scorecard">
        <div className="pixel-box flex flex-col items-center gap-1 p-4 text-center">
          <p className="font-pixel text-[10px] text-[#9d93d6]">SCORECARD</p>
          <p className="font-pixel text-2xl text-[#ffd257]" data-testid="verdict">
            {sc.verdict}
          </p>
          <p className="font-digits text-3xl text-white">{sc.percent}%</p>
          <p className="text-lg text-[#c9c1ff]">
            {sc.correct}/{sc.total} right{sc.unanswered > 0 ? ` · ${sc.unanswered} unanswered` : ""}
          </p>
          {sc.weakest && sc.percent < 100 && <p className="text-base text-[#c9c1ff]">Weakest: {sc.weakest.name}</p>}
        </div>
        <div className="pixel-box flex flex-col gap-2 p-3">
          {sc.domains.map((d) => (
            <div key={d.domain.id} data-testid="domain-row">
              <div className="flex justify-between gap-2 text-base text-white">
                <span>
                  {d.domain.name} <span className="text-[#9d93d6]">({d.domain.weight}%)</span>
                </span>
                <span className="font-digits">
                  {d.correct}/{d.total}
                </span>
              </div>
              <div className="h-2 w-full bg-[#0b0818]" aria-hidden>
                <div className={d.percent >= 82 ? "h-full bg-[#5be37d]" : d.percent >= 65 ? "h-full bg-[#ffd257]" : "h-full bg-[#ff6a8a]"} style={{ width: `${d.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
        {sc.missed.length > 0 && (
          <div className="pixel-box flex flex-col gap-2 p-3">
            <p className="font-pixel text-[10px] text-[#ff6a8a]">REVISIT ({sc.missed.length})</p>
            {sc.missed.map((m) => (
              <details key={m.id} className="text-lg leading-snug text-white">
                <summary className="min-h-8 cursor-pointer whitespace-pre-line">{m.prompt}</summary>
                <p className="mt-1 text-base text-[#c9c1ff] sm:text-lg">{m.explain}</p>
              </details>
            ))}
          </div>
        )}
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          NEW EXAM ▶
        </button>
      </section>
    );
  }

  const e = deck[i];
  const domain = DOMAINS.find((d) => d.id === e.domain)!;
  return (
    <section className="flex flex-col gap-3" data-testid="ccna-question">
      <div className="pixel-box flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
          <span>
            QUESTION {i + 1}/{deck.length}
          </span>
          <span className={left <= 300 ? "text-[#ff6a8a]" : "text-[#ffd257]"} data-testid="timer">
            {clock(left)}
          </span>
        </div>
        <div className="h-2 w-full bg-[#0b0818]" aria-hidden>
          <div className="h-full bg-[#ffd257]" style={{ width: `${(left / EXAM_SECONDS) * 100}%` }} />
        </div>
        <p className="font-pixel text-[9px] text-[#9d93d6]">{domain.name.toUpperCase()}</p>
        <p className="whitespace-pre-line text-xl leading-snug text-white sm:text-2xl">{e.q.prompt}</p>
      </div>
      <QuestionPanel key={i} q={e.q} seed={seed + i} locked={false} info={[`QUESTION ${i + 1}/${deck.length}`, "ANSWER!"]} onSubmit={submit} />
    </section>
  );
}
