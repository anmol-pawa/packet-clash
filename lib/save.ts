"use client";
/**
 * Progress lives in localStorage (per browser). Everything is wrapped in
 * try/catch so private windows and blocked storage just mean "no saves".
 */
import { useSyncExternalStore } from "react";
import type { Partner } from "@/game/engine/party";
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
  settings: { volume: 0.6, music: true, reducedMotion: false, zen: false },
};

let cache: SaveData | null = null;
const listeners = new Set<() => void>();

function load(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = parsed
      ? { ...DEFAULT, ...parsed, leitner: normalizeLeitner(parsed.leitner), settings: { ...DEFAULT.settings, ...(parsed.settings ?? {}) } }
      : { ...DEFAULT };
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
