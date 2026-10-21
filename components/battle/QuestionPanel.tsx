"use client";
import { useEffect, useState } from "react";
import { moveStep, parseNumber, scrambleSteps, sortMarks, type Question, type Response } from "@/game/engine/questions";
import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import { InfoStrip, MoveMenu } from "./MoveMenu";

interface PanelProps {
  q: Question;
  /** Answered: inputs are disabled and marked right / wrong. */
  locked: boolean;
  /** What the player submitted (once locked). */
  response?: Response;
  info: [string, string];
  /** Seeds the order-the-steps scramble. */
  seed: number;
  onSubmit: (r: Response) => void;
}

/**
 * The question in the battle's action area, one panel per kind: the four-move
 * menu for multiple choice, toggles for multi-select, a keypad for numbers
 * tap-to-move rows for ordering steps and tap-to-place bins for sorting.
 * Remount it (key) for each turn.
 */
export function QuestionPanel(p: PanelProps) {
  const { q } = p;
  switch (q.kind) {
    case "mcq":
      return (
        <MoveMenu
          options={q.choices}
          locked={p.locked}
          correct={q.answer}
          chosen={p.response?.kind === "mcq" ? p.response.choice : undefined}
          moveType={q.type}
          info={p.info}
          onPick={(choice) => p.onSubmit({ kind: "mcq", choice })}
        />
      );
    case "multi":
      return <MultiPanel {...p} q={q} />;
    case "numeric":
      return <NumericPanel {...p} q={q} />;
    case "order":
      return <OrderPanel {...p} q={q} />;
    case "sort":
      return <SortPanel {...p} q={q} />;
  }
}

function Frame({ children, info, moveType, testId }: { children: React.ReactNode; info: [string, string]; moveType?: PacketType; testId: string }) {
  return (
    <div className="pixel-box p-2 sm:p-3" data-testid={testId}>
      {children}
      <InfoStrip info={info} moveType={moveType} />
    </div>
  );
}

function FireButton({ disabled, onClick, label = "FIRE ▶" }: { disabled: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="pixel-button mt-2 min-h-12 w-full px-3 py-2 text-xs disabled:opacity-40" data-testid="fire">
      {label}
    </button>
  );
}

function MultiPanel({ q, locked, response, info, onSubmit }: PanelProps & { q: Extract<Question, { kind: "multi" }> }) {
  const [picked, setPicked] = useState<number[]>([]);
  const shown = locked && response?.kind === "multi" ? response.choices : picked;
  const toggle = (i: number) => setPicked((x) => (x.includes(i) ? x.filter((j) => j !== i) : [...x, i].sort((a, b) => a - b)));
  return (
    <Frame info={info} moveType={q.type} testId="multi-panel">
      <p className="mb-1.5 px-1 font-pixel text-[8px] text-[#9d93d6] sm:text-[9px]">PICK EVERY RIGHT ANSWER</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choices">
        {q.choices.map((c, i) => {
          const on = shown.includes(i);
          const right = q.answers.includes(i);
          const state = !locked ? (on ? "is-cursor" : "") : right ? (on ? "move-right" : "move-missed") : on ? "move-wrong" : "opacity-50";
          return (
            <button
              key={i}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={locked}
              onClick={() => toggle(i)}
              className={`move-button flex min-h-14 items-center gap-2 px-2 py-2 text-left text-base leading-tight sm:text-lg ${state}`}
            >
              <span aria-hidden className={`grid size-4 shrink-0 place-items-center border-2 font-pixel text-[8px] ${on ? "border-[#ffd257] bg-[#ffd257] text-[#1a1440]" : "border-[#9d93d6]"}`}>
                {on ? "✓" : ""}
              </span>
              {c}
            </button>
          );
        })}
      </div>
      {!locked && <FireButton disabled={picked.length === 0} onClick={() => onSubmit({ kind: "multi", choices: picked })} />}
    </Frame>
  );
}

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"] as const;

function NumericPanel({ q, locked, response, info, onSubmit }: PanelProps & { q: Extract<Question, { kind: "numeric" }> }) {
  const [typed, setTyped] = useState("");
  const value = parseNumber(typed);
  const press = (k: string) => setTyped((t) => (k === "⌫" ? t.slice(0, -1) : k === "." && t.includes(".") ? t : t.length >= 14 ? t : t + k));
  const submit = () => Number.isFinite(value) && onSubmit({ kind: "numeric", value });

  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const right = locked && response?.kind === "numeric" && Math.abs(response.value - q.answer) <= (q.tolerance ?? 0) + 1e-9;
  return (
    <Frame info={info} moveType={q.type} testId="numeric-panel">
      <div
        className={`flex min-h-14 items-center justify-end gap-2 border-[3px] px-3 font-pixel text-base sm:text-lg ${locked ? (right ? "border-[#8af77a] bg-[#1f6b3a]" : "border-[#ff6a8a] bg-[#7a1f35]") : "border-[#3b3175] bg-[#0b0818]"}`}
        data-testid="numeric-display"
        aria-label="Your answer"
      >
        <span className="min-w-0 truncate text-white">{typed || (locked ? "—" : "")}</span>
        {!locked && <span className="blink text-[#ffd257]">▌</span>}
        {q.unit && <span className="shrink-0 text-[10px] text-[#c9c1ff] sm:text-xs">{q.unit}</span>}
      </div>
      {!locked && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Keypad">
            {KEYS.map((k) => (
              <button key={k} type="button" onClick={() => press(k)} className="move-button min-h-11 font-pixel text-sm" aria-label={k === "⌫" ? "Delete" : k}>
                {k}
              </button>
            ))}
          </div>
          <FireButton disabled={!Number.isFinite(value)} onClick={submit} />
        </>
      )}
    </Frame>
  );
}

function OrderPanel({ q, locked, response, info, seed, onSubmit }: PanelProps & { q: Extract<Question, { kind: "order" }> }) {
  const [steps, setSteps] = useState(() => scrambleSteps(q.steps, seed));
  const [held, setHeld] = useState<number | null>(null);
  const shown = locked && response?.kind === "order" ? response.steps : steps;
  // Tap a step to pick it up, then tap where it goes; or nudge it with ▲ ▼.
  const tap = (i: number) => {
    if (held === null) return setHeld(i);
    if (held !== i) {
      const out = steps.slice();
      const [s] = out.splice(held, 1);
      out.splice(i, 0, s);
      setSteps(out);
    }
    setHeld(null);
  };
  const nudge = (i: number, d: -1 | 1) => {
    setSteps((s) => moveStep(s, i, d));
    setHeld(null);
  };
  return (
    <Frame info={info} moveType={q.type} testId="order-panel">
      <p className="mb-1.5 px-1 font-pixel text-[8px] text-[#9d93d6] sm:text-[9px]">{locked ? "YOUR ORDER" : held === null ? "TAP A STEP, THEN ITS PLACE" : "TAP WHERE IT GOES"}</p>
      <ol className="grid gap-1.5" aria-label="Steps">
        {shown.map((s, i) => {
          const state = locked ? (s === q.steps[i] ? "move-right" : "move-wrong") : held === i ? "is-cursor is-held" : "";
          return (
            <li key={s} className="flex items-stretch gap-1.5">
              <button
                type="button"
                disabled={locked}
                onClick={() => tap(i)}
                aria-pressed={held === i}
                className={`move-button flex min-h-11 flex-1 items-center gap-2 px-2 py-1.5 text-left text-base leading-tight sm:text-lg ${state}`}
              >
                <span className="shrink-0 font-pixel text-[10px] text-[#ffd257]">{i + 1}</span>
                {s}
              </button>
              {!locked && (
                <span className="flex shrink-0 flex-col gap-1">
                  <button type="button" disabled={i === 0} onClick={() => nudge(i, -1)} className="move-button h-full min-h-5 w-11 font-pixel text-[9px] disabled:opacity-30" aria-label={`Move step ${i + 1} up`}>
                    ▲
                  </button>
                  <button type="button" disabled={i === shown.length - 1} onClick={() => nudge(i, 1)} className="move-button h-full min-h-5 w-11 font-pixel text-[9px] disabled:opacity-30" aria-label={`Move step ${i + 1} down`}>
                    ▼
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!locked && <FireButton disabled={false} onClick={() => onSubmit({ kind: "order", steps })} />}
    </Frame>
  );
}

/** Bins named after a layer wear that layer's colour. */
const LAYER_BIN: Readonly<Record<string, PacketType>> = {
  Application: "APPLICATION",
  Transport: "TRANSPORT",
  Network: "NETWORK",
  Link: "LINK",
  Physical: "PHYSICAL",
};

function SortPanel({ q, locked, response, info, onSubmit }: PanelProps & { q: Extract<Question, { kind: "sort" }> }) {
  const [placed, setPlaced] = useState<(number | null)[]>(() => q.items.map(() => null));
  const [held, setHeld] = useState<number | null>(null);
  const shown = locked && response?.kind === "sort" ? response.bins : placed;
  const marks = locked && response ? sortMarks(q, response) : [];
  // Tap an item to pick it up (again, to put it down), then tap its bin. Placed items can be picked up and moved.
  const tapItem = (i: number) => setHeld((h) => (h === i ? null : i));
  const tapBin = (b: number) => {
    if (held === null) return;
    setPlaced((p) => p.map((x, i) => (i === held ? b : x)));
    setHeld(null);
  };
  const chip = (i: number) => (
    <button
      key={i}
      type="button"
      disabled={locked}
      onClick={(e) => {
        e.stopPropagation();
        tapItem(i);
      }}
      aria-pressed={held === i}
      className={`move-button min-h-11 px-2.5 py-1 text-left text-base leading-tight sm:text-lg ${locked ? (marks[i] ? "move-right" : "move-wrong") : held === i ? "is-cursor is-held" : ""}`}
      data-testid="sort-item"
    >
      {q.items[i].label}
    </button>
  );
  const tray = q.items.map((_, i) => i).filter((i) => shown[i] == null);
  return (
    <Frame info={info} moveType={q.type} testId="sort-panel">
      <p className="mb-1.5 px-1 font-pixel text-[8px] text-[#9d93d6] sm:text-[9px]">
        {locked ? "YOUR SORT" : held === null ? (tray.length ? "TAP AN ITEM, THEN ITS BIN" : "ALL PLACED: FIRE, OR TAP ONE TO MOVE IT") : "NOW TAP ITS BIN"}
      </p>
      {tray.length > 0 && (
        <div className="mb-2 flex min-h-11 flex-wrap gap-1.5" role="group" aria-label="To sort">
          {tray.map(chip)}
        </div>
      )}
      <div className="grid gap-1.5" role="group" aria-label="Bins">
        {q.bins.map((bin, b) => {
          const t = LAYER_BIN[bin] ? TYPE_INFO[LAYER_BIN[bin]] : null;
          const inBin = q.items.map((_, i) => i).filter((i) => shown[i] === b);
          return (
            <div
              key={bin}
              onClick={() => tapBin(b)}
              className={`flex min-h-12 items-stretch gap-1.5 border-[3px] border-[#3b3175] bg-[#0b0818] p-1 ${!locked && held !== null ? "cursor-pointer border-dashed border-[#ffd257]" : ""}`}
              data-testid="sort-bin"
            >
              <button
                type="button"
                disabled={locked || held === null}
                onClick={(e) => {
                  e.stopPropagation();
                  tapBin(b);
                }}
                className="w-[6.5rem] shrink-0 border-2 border-[#0b0818] px-1.5 text-left font-pixel text-[8px] leading-tight sm:w-32 sm:text-[9px]"
                style={{ background: t?.color ?? "#3b3175", color: t?.ink ?? "#fff" }}
                aria-label={`Put in ${bin}`}
              >
                {bin.toUpperCase()}
              </button>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{inBin.map(chip)}</div>
            </div>
          );
        })}
      </div>
      {!locked && <FireButton disabled={tray.length > 0} onClick={() => onSubmit({ kind: "sort", bins: placed })} />}
    </Frame>
  );
}
