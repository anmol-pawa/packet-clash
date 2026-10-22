"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseSprite, type SpriteDef } from "@/lib/pixel";

/**
 * Draws palette + character-grid sprites on a canvas at 1 px per pixel and
 * lets CSS scale it up with nearest-neighbour filtering. With several frames
 * it cycles through them every `frameMs`.
 */
export function PixelSprite({ frames, scale = 4, frameMs = 500, className = "", label }: { frames: SpriteDef[]; scale?: number; frameMs?: number; className?: string; label: string }) {
  const grids = useMemo(() => frames.map(parseSprite), [frames]);
  const [frame, setFrame] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (grids.length < 2) return;
    // reduced motion: hold the first frame instead of cycling
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % grids.length), frameMs);
    return () => clearInterval(id);
  }, [grids.length, frameMs]);

  const grid = grids[frame % grids.length];
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, grid.width, grid.height);
    grid.pixels.forEach((c, i) => {
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(i % grid.width, Math.floor(i / grid.width), 1, 1);
    });
  }, [grid]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      width={grid.width}
      height={grid.height}
      className={`pixelated ${className}`}
      style={{ width: grid.width * scale, height: grid.height * scale }}
    />
  );
}
