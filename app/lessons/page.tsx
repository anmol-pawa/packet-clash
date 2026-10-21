import type { Metadata } from "next";
import { Suspense } from "react";
import { LessonGate } from "@/components/lessons/LessonGate";

export const metadata: Metadata = { title: "Lessons — Packet Clash" };

/** `/lessons?n=1`: gym n's lesson cards, reachable from its town on the world map. */
export default function LessonsPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <LessonGate />
    </Suspense>
  );
}
