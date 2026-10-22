/**
 * The question engine: one model for every kind of question the battles ask,
 * a pure grader, and seeded decks. Adapted from Query Clash's interview engine.
 *
 * Kinds: multiple choice (one answer), multi-select (pick exactly the right
 * set), numeric (with a unit and a tolerance), order-the-steps and sort
 * (place every item in its bin, e.g. each protocol in its layer). Generated
 * problems are any of these, built by a seeded `Generator` whose answer comes
 * from the solvers in `lib/net`, never typed in by hand.
 */
import type { PacketType } from "./types";
import { rng, shuffled } from "@/lib/rng";

/** The curriculum chapters (ROADMAP 2.1–2.9). */
export type TopicId = "models" | "link" | "network" | "routing" | "transport" | "application" | "security" | "journey" | "interview";

/** 1 = warm-up, 2 = standard, 3 = interview / tough follow-up. */
export type Difficulty = 1 | 2 | 3;

interface QuestionBase {
  id: string;
  topic: TopicId;
  /** The layer the question is about: the type of the move a right answer fires. */
  type: PacketType;
  difficulty: Difficulty;
  prompt: string;
  /** Shown after every answer, right or wrong. */
  explain: string;
}

export interface McqQuestion extends QuestionBase {
  kind: "mcq";
  choices: string[];
  /** Index into `choices`. */
  answer: number;
}

export interface MultiQuestion extends QuestionBase {
  kind: "multi";
  choices: string[];
  /** Every correct index; the player must pick exactly these. */
  answers: number[];
}

export interface NumericQuestion extends QuestionBase {
  kind: "numeric";
  answer: number;
  /** Absolute tolerance (default 0: exact). */
  tolerance?: number;
  unit?: string;
}

export interface OrderQuestion extends QuestionBase {
  kind: "order";
  /** The steps in the correct order; shown scrambled. */
  steps: string[];
}

export interface SortItem {
  label: string;
  /** Index into the question's `bins`. */
  bin: number;
}

export interface SortQuestion extends QuestionBase {
  kind: "sort";
  /** The bins, in the order they're shown (e.g. the layers, top down). */
  bins: string[];
  /** The items to place, in the order they're shown. */
  items: SortItem[];
}

export type Question = McqQuestion | MultiQuestion | NumericQuestion | OrderQuestion | SortQuestion;
export type QuestionKind = Question["kind"];

export type Response =
  | { kind: "mcq"; choice: number }
  | { kind: "multi"; choices: number[] }
  | { kind: "numeric"; value: number }
  /** The steps as the player arranged them. */
  | { kind: "order"; steps: string[] }
  /** The bin the player put each item in (by item index), or null if left unplaced. */
  | { kind: "sort"; bins: (number | null)[] };

/** A seeded problem generator: the same seed always builds the same, solver-answered question. */
export interface Generator {
  id: string;
  topic: TopicId;
  type: PacketType;
  difficulty: Difficulty;
  generate(seed: number): Question;
}

/** True iff the response answers the question correctly. A response of the wrong kind is wrong. */
export function grade(q: Question, r: Response): boolean {
  switch (q.kind) {
    case "mcq":
      return r.kind === "mcq" && r.choice === q.answer;
    case "multi": {
      if (r.kind !== "multi") return false;
      const got = new Set(r.choices);
      return got.size === r.choices.length && got.size === q.answers.length && q.answers.every((i) => got.has(i));
    }
    case "numeric":
      return r.kind === "numeric" && Number.isFinite(r.value) && Math.abs(r.value - q.answer) <= (q.tolerance ?? 0) + 1e-9;
    case "order":
      return r.kind === "order" && r.steps.length === q.steps.length && r.steps.every((s, i) => s === q.steps[i]);
    case "sort":
      return r.kind === "sort" && r.bins.length === q.items.length && sortMarks(q, r).every(Boolean);
  }
}

/** Per-item marks for a sort answer: true where that item is in its right bin. */
export function sortMarks(q: SortQuestion, r: Response): boolean[] {
  return q.items.map((it, i) => r.kind === "sort" && r.bins[i] === it.bin);
}

/** The response that `grade` accepts, for tests and the "show answer" reveal. */
export function correctResponse(q: Question): Response {
  switch (q.kind) {
    case "mcq":
      return { kind: "mcq", choice: q.answer };
    case "multi":
      return { kind: "multi", choices: [...q.answers] };
    case "numeric":
      return { kind: "numeric", value: q.answer };
    case "order":
      return { kind: "order", steps: [...q.steps] };
    case "sort":
      return { kind: "sort", bins: q.items.map((it) => it.bin) };
  }
}

/** A number as players type it: 12 significant digits at most, so no float noise ("0.12", not "0.12000000000000001"). */
export function formatNumber(n: number): string {
  return String(Number(n.toPrecision(12)));
}

/** The answer as one line of text, for the explanation box. */
export function answerText(q: Question): string {
  switch (q.kind) {
    case "mcq":
      return q.choices[q.answer];
    case "multi":
      return q.answers.map((i) => q.choices[i]).join(", ");
    case "numeric":
      return q.unit ? `${formatNumber(q.answer)} ${q.unit}` : formatNumber(q.answer);
    case "order":
      return q.steps.map((s, i) => `${i + 1}. ${s}`).join("  ");
    case "sort":
      return sortGroups(q)
        .filter((g) => g.items.length > 0)
        .map((g) => `${g.bin}: ${g.items.join(", ")}`)
        .join("; ");
  }
}

/** A sort question's answer grouped by bin, in bin order (items in their shown order). */
export function sortGroups(q: SortQuestion): { bin: string; items: string[] }[] {
  return q.bins.map((bin, b) => ({ bin, items: q.items.filter((it) => it.bin === b).map((it) => it.label) }));
}

/**
 * Parse what a player typed into a number: accepts spaces and thousands commas
 * ("1,500"), a leading "." and scientific notation. Anything else is NaN.
 */
export function parseNumber(s: string): number {
  const t = s.trim().replace(/[\s,_]/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}

/** The order steps as first shown: a seeded shuffle that is never already solved. */
export function scrambleSteps(steps: readonly string[], seed: number): string[] {
  if (steps.length < 2) return [...steps];
  const r = rng(seed);
  for (let tries = 0; tries < 8; tries++) {
    const s = shuffled(r, steps);
    if (s.some((x, i) => x !== steps[i])) return s;
  }
  return [...steps.slice(1), steps[0]];
}

/** Swap step `i` with its neighbour above (-1) or below (+1); out-of-range moves change nothing. */
export function moveStep<T>(steps: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  const out = steps.slice();
  if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * A multiple-choice question's four options: the answer plus the first three
 * distinct distractors, in seeded order. Throws if there aren't three
 * distractors that differ from the answer and each other.
 */
export function mcqChoices(r: () => number, answer: string, distractors: readonly string[]): { choices: string[]; answer: number } {
  const wrong = [...new Set(distractors.filter((d) => d !== answer))].slice(0, 3);
  if (wrong.length < 3) throw new Error(`need 3 distractors for ${answer}, got ${wrong.length}`);
  const choices = shuffled(r, [answer, ...wrong]);
  return { choices, answer: choices.indexOf(answer) };
}

export interface DeckOptions {
  seed: number;
  size: number;
  /** Keep only these topics (default: all). */
  topics?: readonly TopicId[];
  /** Keep only these difficulties (default: all). */
  difficulties?: readonly Difficulty[];
}

/**
 * A battle's questions: fixed questions and one instance of each generator,
 * filtered by topic and difficulty, shuffled by seed and trimmed to `size`.
 */
export function buildDeck(questions: readonly Question[], generators: readonly Generator[], o: DeckOptions): Question[] {
  const keep = (x: { topic: TopicId; difficulty: Difficulty }) =>
    (!o.topics || o.topics.includes(x.topic)) && (!o.difficulties || o.difficulties.includes(x.difficulty));
  const r = rng(o.seed);
  const made = generators.filter(keep).map((g) => g.generate(Math.floor(r() * 2 ** 31)));
  return shuffled(r, [...questions.filter(keep), ...made]).slice(0, o.size);
}
