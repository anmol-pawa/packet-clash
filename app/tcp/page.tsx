import type { Metadata } from "next";
import Link from "next/link";
import { TcpMachine } from "@/components/lessons/TcpMachine";

export const metadata: Metadata = { title: "TCP state machine — Packet Clash" };

/** `/tcp`: step through the handshake and teardown, linked from gym 5's lessons. */
export default function TcpPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <header className="flex items-center justify-between font-pixel text-[10px] text-[#9d93d6]">
        <Link href="/lessons?n=5" className="back-link py-2 hover:text-white">
          ◀ LESSONS
        </Link>
        <h1 className="text-xs text-[#ffd257] sm:text-sm">TCP STATES</h1>
      </header>
      <TcpMachine />
    </main>
  );
}
