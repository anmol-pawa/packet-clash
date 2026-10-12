"use client";
import { useEffect, useState } from "react";

/** Steps a shown number toward `target` a little each tick, like a draining HP counter. */
export function useStepTo(target: number, ms = 700): number {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (shown === target) return;
    const step = Math.max(1, Math.ceil(Math.abs(target - shown) / 12));
    const id = setTimeout(() => setShown((v) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step))), ms / 12);
    return () => clearTimeout(id);
  }, [shown, target, ms]);
  return shown;
}
