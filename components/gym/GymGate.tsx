"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { gymOpen, gymTown } from "@/content/gyms";
import { isUnlocked } from "@/content/world";
import { useSave } from "@/lib/save";

const noop = () => () => {};

/**
 * Checks the gym in `?n=` can be fought (it exists, its town is unlocked and
 * its leader has art) before starting the battle; otherwise explains why and
 * points back to the map.
 */
export function GymGate() {
  const t = gymTown(useSearchParams().get("n"));
  const save = useSave();
  // the save lives in localStorage, so wait for the client before judging locks
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return <main className="min-h-dvh" />;

  const why = !t ? "There is no gym here." : !isUnlocked(t, save.badges) ? `${t.name} is locked. Win the previous town's badge first.` : !gymOpen(t) ? `${t.boss} is still training. The ${t.name} gym opens soon.` : null;
  if (t && !why) return <BattleScreen key={t.id} gym={t} />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4">
      <div className="pixel-box flex w-full flex-col gap-4 p-5 text-center">
        <h1 className="font-pixel text-xs text-[#ffd257]">GYM CLOSED</h1>
        <p className="text-xl leading-snug text-[#f4f1ff]">{why}</p>
        <Link href="/map" className="pixel-button flex min-h-12 items-center justify-center px-4 py-3 text-xs">
          ◀ WORLD MAP
        </Link>
      </div>
    </main>
  );
}
