import { answerText, type Question } from "@/game/engine/questions";

/** After every answer: right or wrong, the correct answer and why. */
export function ExplainBox({ q, correct }: { q: Question; correct: boolean }) {
  return (
    <div className="pixel-box p-3" data-testid="explain" role="note">
      <p className={`font-pixel text-[10px] sm:text-xs ${correct ? "text-[#8af77a]" : "text-[#ff6a8a]"}`}>{correct ? "✔ CORRECT" : "✘ THE ANSWER"}</p>
      {!correct &&
        (q.kind === "order" ? (
          <ol className="mt-1.5 list-inside list-decimal text-lg leading-snug text-white sm:text-xl">
            {q.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-lg leading-snug text-white sm:text-xl">{answerText(q)}</p>
        ))}
      <p className="mt-1.5 text-base leading-snug text-[#c9c1ff] sm:text-lg">{q.explain}</p>
    </div>
  );
}
