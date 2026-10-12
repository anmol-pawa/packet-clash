"use client";
/**
 * Progress lives in localStorage (per browser). Everything is wrapped in
 * try/catch so private windows and blocked storage just mean "no saves".
 */
import { useSyncExternalStore } from "react";

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
  settings: { volume: 0.6, music: true, reducedMotion: false, zen: false },
};

let cache: SaveData | null = null;
const listeners = new Set<() => void>();

function load(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULT, ...JSON.parse(raw), settings: { ...DEFAULT.settings, ...(JSON.parse(raw).settings ?? {}) } } : { ...DEFAULT };
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

export const level = (xp: number) => Math.floor(Math.sqrt(xp / 120)) + 1;
