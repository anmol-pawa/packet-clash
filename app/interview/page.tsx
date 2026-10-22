import type { Metadata } from "next";
import Link from "next/link";
import { MockInterview } from "@/components/interview/MockInterview";

export const metadata: Metadata = { title: "Mock interview — Packet Clash" };

/** `/interview`: a timed mock networking interview with a scorecard, linked from the world map. */
export default function InterviewPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <header className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href="/map" className="py-2 hover:text-white">
          ◀ MAP
        </Link>
        <h1 className="text-xs text-[#ffd257] sm:text-sm">MOCK INTERVIEW</h1>
      </header>
      <MockInterview />
    </main>
  );
}
