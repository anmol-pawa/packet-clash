import type { Metadata } from "next";
import { Suspense } from "react";
import { GymGate } from "@/components/gym/GymGate";

export const metadata: Metadata = { title: "Gym — Packet Clash" };

/** `/gym?n=2`: the gym battle of town number n (one static page; the gym comes from the query). */
export default function GymPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <GymGate />
    </Suspense>
  );
}
