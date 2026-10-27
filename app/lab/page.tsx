import type { Metadata } from "next";
import Link from "next/link";
import { LabSession } from "@/components/lab/LabSession";

export const metadata: Metadata = { title: "Config lab — Packet Clash" };

/** `/lab`: read a small IOS config or `show` output and answer one question about it. */
export default function LabPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <header className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href="/map" className="back-link py-2 hover:text-white">
          ◀ MAP
        </Link>
        <h1 className="text-xs text-[#ffd257] sm:text-sm">CONFIG LAB</h1>
      </header>
      <LabSession />
    </main>
  );
}
