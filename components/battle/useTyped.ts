"use client";
import { useEffect, useState } from "react";

/** Reveals `text` a few characters at a time, like a handheld message box. */
export function useTyped(text: string, cps = 60): { shown: string; done: boolean; skip: () => void } {
  const [state, setState] = useState({ text, n: 0 });
  // Appending to the current message (e.g. an explanation) keeps what is already shown.
  const keep = state.text === text || (state.text !== "" && text.startsWith(state.text)) ? state.n : 0;
  const n = state.text === text ? state.n : keep;
  if (state.text !== text) setState({ text, n: keep });

  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setState((s) => (s.text === text ? { text, n: Math.min(text.length, s.n + 3) } : s)), 3000 / cps);
    return () => clearTimeout(id);
  }, [text, n, cps]);

  return { shown: text.slice(0, n), done: n >= text.length, skip: () => setState({ text, n: text.length }) };
}
