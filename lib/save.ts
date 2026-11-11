"use client";
/**
 * Progress lives in localStorage (per browser). Everything is wrapped in
 * try/catch so private windows and blocked storage just mean "no saves".
 */
import { useSyncExternalStore } from "react";
import type { Partner } from "@/game/engine/party";
import { EMPTY_DAILY, completeDaily, normalizeDaily, type DailyState } from "@/game/engine/daily";
import { EMPTY_LEITNER, normalizeLeitner, review, startSession, type LeitnerState } from "@/game/engine/leitner";

export interface Settings {
  volume: number;
  music: boolean;
  reducedMotion: boolean;
  zen: boolean; // no answer timer
}

export interface SaveData {
  version: 1;
  xp: number;
  badges: number[]; // gym numbers beaten
  seen: string[]; // creature ids seen (Packetdex)
  caught: string[]; // creature ids caught
  mapTown: string | null; // where the courier stands on the overworld (null = the first town)
  partner: Partner | null; // the player's creature (null = the starter, see STARTER)
  leitner: LeitnerState; // spaced-repetition boxes, keyed by question id (see cardKey)
  lessonsSeen: number[]; // gyms whose lesson cards were read or skipped once
  daily: DailyState; // the daily challenge streak
  settings: Settings;
}

const KEY = "packet-clash-save-v1";

const DEFAULT: SaveData = {
  version: 1,
  xp: 0,
  badges: [],
  seen: [],
  caught: [],
  mapTown: null,
  partner: null,
  leitner: EMPTY_LEITNER,
  lessonsSeen: [],
  daily: EMPTY_DAILY,
  settings: { volume: 0.6, music: true, reducedMotion: false, zen: false },
};

let cache: SaveData | null = null;
const listeners = new Set<() => void>();

/**
 * A stored save, repaired: older saves (no progress for gyms 10-16, or missing
 * newer fields) load with empty progress there, and wrong-typed fields fall
 * back to the defaults. Never throws, never drops what it can keep.
 */
export function normalizeSave(parsed: unknown): SaveData {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT };
  const p = parsed as Partial<Record<keyof SaveData, unknown>>;
  const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n) && n > 0) : []);
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  const settings = p.settings && typeof p.settings === "object" ? (p.settings as Partial<Settings>) : {};
  return {
    ...DEFAULT,
    ...(parsed as Partial<SaveData>),
    xp: typeof p.xp === "number" && Number.isFinite(p.xp) && p.xp >= 0 ? p.xp : 0,
    badges: [...new Set(nums(p.badges))].sort((a, b) => a - b),
    seen: strs(p.seen),
    caught: strs(p.caught),
    mapTown: typeof p.mapTown === "string" ? p.mapTown : null,
    lessonsSeen: nums(p.lessonsSeen),
    leitner: normalizeLeitner(p.leitner as Parameters<typeof normalizeLeitner>[0]),
    daily: normalizeDaily(p.daily as Parameters<typeof normalizeDaily>[0]),
    settings: { ...DEFAULT.settings, ...settings },
  };
}

function load(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? normalizeSave(JSON.parse(raw)) : { ...DEFAULT };
  } catch {
    cache = { ...DEFAULT };
  }
  return cache!;
}

export function getSave(): SaveData {
  return typeof window === "undefined" ? DEFAULT : load();
}

export function updateSave(fn: (s: SaveData) => SaveData) {
  cache = fn(load());
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/** A battle begins: one Leitner session passes. */
export function startLeitnerSession() {
  updateSave((s) => ({ ...s, leitner: startSession(s.leitner) }));
}

/** Record one answer in the Leitner box. */
export function recordReview(questionId: string, correct: boolean) {
  updateSave((s) => ({ ...s, leitner: review(s.leitner, questionId, correct) }));
}

/** The day's challenge is finished with `score` right. */
export function recordDaily(key: string, score: number) {
  updateSave((s) => ({ ...s, daily: completeDaily(s.daily, key, score) }));
}

export function resetSave() {
  updateSave(() => ({ ...DEFAULT }));
}

export function useSave(): SaveData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => DEFAULT,
  );
}
