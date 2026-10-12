import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="font-pixel text-xl text-[#ffd257]">404 · PACKET LOST</h1>
      <p className="max-w-xs text-lg">This route has no entry in the routing table.</p>
      <Link href="/" className="pixel-button px-5 py-3 text-sm">
        BACK HOME
      </Link>
    </main>
  );
}
