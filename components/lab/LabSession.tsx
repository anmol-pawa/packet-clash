"use client";
import { useState } from "react";
import { ExplainBox } from "@/components/battle/ExplainBox";
import { QuestionPanel } from "@/components/battle/QuestionPanel";
import { labDeck } from "@/content/lab/scenarios";
import { grade, type Response } from "@/game/engine/questions";
import { recordReview } from "@/lib/save";

type Stage = "intro" | "ask" | "review" | "done";

/**
 * The config lab: each scenario shows its exhibits (IOS config and `show`
 * output in monospace) above one multiple-choice question. Answers feed the
 * Leitner box like any battle answer.
 */
export function LabSession() {
  const [deck, setDeck] = useState(() => labDeck(1));
  const [stage, setStage] = useState<Stage>("intro");
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [response, setResponse] = useState<Response>();
  const [ok, setOk] = useState(false);
  const s = deck[i];

  const start = () => {
    setDeck(labDeck(Math.floor(Math.random() * 2 ** 30) + 1));
    setI(0);
    setScore(0);
    setResponse(undefined);
    setStage("ask");
  };
  const submit = (r: Response) => {
    const correct = grade(s.question, r);
    recordReview(s.question.id, correct);
    setResponse(r);
    setOk(correct);
    if (correct) setScore((n) => n + 1);
    setStage("review");
  };
  const next = () => {
    if (i + 1 >= deck.length) setStage("done");
    else {
      setI(i + 1);
      setResponse(undefined);
      setStage("ask");
    }
    window.scrollTo(0, 0);
  };

  if (stage === "intro")
    return (
      <section className="pixel-box flex flex-col gap-3 p-3" data-testid="lab-intro">
        <p className="text-lg leading-snug text-white sm:text-xl">
          Read the configuration and <code>show</code> output like you would on the exam, then answer. {deck.length} scenarios: spanning tree, EtherChannel, ACLs, routing, OSPF, host settings, DHCP and IPv6. New numbers every run.
        </p>
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          START ▶
        </button>
      </section>
    );

  if (stage === "done")
    return (
      <section className="flex flex-col gap-3" data-testid="lab-done">
        <div className="pixel-box flex flex-col items-center gap-1 p-4 text-center">
          <p className="font-pixel text-[10px] text-[#9d93d6]">LAB RESULT</p>
          <p className="font-digits text-4xl text-white">
            {score}/{deck.length}
          </p>
          <p className="text-lg text-[#c9c1ff]">{score === deck.length ? "Flawless!" : score >= deck.length * 0.7 ? "Exam-ready reading." : "Re-read the explanations and run it again."}</p>
        </div>
        <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={start}>
          NEW LAB ▶
        </button>
      </section>
    );

  const locked = stage === "review";
  return (
    <section className="flex flex-col gap-3" data-testid="lab-question">
      <div className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <span>
          SCENARIO {i + 1}/{deck.length}
        </span>
        <span className="text-[#ffd257]">{score} RIGHT</span>
      </div>
      <div className="pixel-box flex flex-col gap-2 p-3">
        <p className="font-pixel text-[10px] text-[#ffd257]">{s.title.toUpperCase()}</p>
        {s.exhibits.map((e) => (
          <figure key={e.title} className="min-w-0">
            <figcaption className="mb-1 break-words font-mono text-xs text-[#9d93d6]">{e.title}</figcaption>
            <pre className="overflow-x-auto whitespace-pre rounded-sm bg-black/60 p-2 font-mono text-xs leading-snug text-[#8af77a] sm:text-sm" tabIndex={0}>
              {e.text}
            </pre>
          </figure>
        ))}
        <p className="whitespace-pre-line text-xl leading-snug text-white sm:text-2xl">{s.question.prompt}</p>
      </div>
      <QuestionPanel key={s.id} q={s.question} seed={i + 1} locked={locked} response={response} info={[`SCENARIO ${i + 1}/${deck.length}`, locked ? (ok ? "CORRECT!" : "MISSED!") : "ANSWER!"]} onSubmit={submit} />
      {locked && (
        <>
          <ExplainBox q={s.question} correct={ok} />
          <button type="button" className="pixel-button min-h-12 px-4 py-3 text-sm" onClick={next}>
            {i + 1 >= deck.length ? "FINISH ▶" : "NEXT SCENARIO ▶"}
          </button>
        </>
      )}
    </section>
  );
}
