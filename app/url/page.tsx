import type { Metadata } from "next";
import Link from "next/link";
import { UrlJourney } from "@/components/lessons/UrlJourney";

export const metadata: Metadata = { title: "Typing a URL — Packet Clash" };

/** `/url`: step through the nine stages of a page load, linked from gym 8's lessons. */
export default function UrlPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <header className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href="/lessons?n=8" className="py-2 hover:text-white">
          ◀ LESSONS
        </Link>
        <h1 className="text-xs text-[#ffd257] sm:text-sm">TYPE A URL</h1>
      </header>
      <UrlJourney />
    </main>
  );
}
