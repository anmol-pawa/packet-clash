"use client";
import { useTyped } from "./useTyped";

/**
 * The handheld message box: text types out a few letters at a time (tap to
 * finish it), and a bouncing ▼ shows when there is more to read.
 */
export function MessageBox({ text, more, onAdvance }: { text: string; more?: boolean; onAdvance?: () => void }) {
  const typed = useTyped(text);
  return (
    <div
      className="pixel-box relative min-h-[5.5rem] cursor-pointer select-none p-3 pr-8 text-lg leading-snug sm:text-xl"
      role="status"
      aria-live="polite"
      data-testid="message"
      onClick={() => (typed.done ? onAdvance?.() : typed.skip())}
    >
      {typed.shown}
      {!typed.done && <span className="blink">▌</span>}
      {typed.done && more && (
        <span aria-hidden className="bob-small absolute bottom-2 right-3 font-pixel text-xs text-[#ffd257]">
          ▼
        </span>
      )}
    </div>
  );
}
