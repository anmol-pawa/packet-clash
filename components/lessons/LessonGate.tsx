"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LessonDeck } from "@/components/lessons/LessonDeck";
import { gymTown } from "@/content/gyms";
import { lessonsFor } from "@/content/lessons";
import { isUnlocked } from "@/content/world";
import { useSave } from "@/lib/save";

const noop = () => () => {};

/** The lesson cards of the gym in `?n=`, once its town is open; otherwise says why and points back to the map. */
export function LessonGate() {
  const t = gymTown(useSearchParams().get("n"));
  const save = useSave();
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return <main className="min-h-dvh" />;

  const lessons = t ? lessonsFor(t.gym) : [];
  const why = !t ? "There is no gym here." : !isUnlocked(t, save.badges) ? `${t.name} is locked. Win the previous town's badge first.` : lessons.length === 0 ? `${t.boss}'s lessons are still being written.` : null;
  if (t && !why)
    return (
      <LessonDeck
        town={t}
        lessons={lessons}
        done={
          <Link href="/map" className="pixel-button flex min-h-12 items-center justify-center px-3 py-3 text-xs">
            ◀ MAP
          </Link>
        }
      />
    );
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4">
      <div className="pixel-box flex w-full flex-col gap-4 p-5 text-center">
        <h1 className="font-pixel text-xs text-[#ffd257]">NO LESSONS</h1>
        <p className="text-xl leading-snug text-[#f4f1ff]">{why}</p>
        <Link href="/map" className="pixel-button flex min-h-12 items-center justify-center px-4 py-3 text-xs">
          ◀ WORLD MAP
        </Link>
      </div>
    </main>
  );
}
