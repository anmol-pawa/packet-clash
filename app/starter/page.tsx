import type { Metadata } from "next";
import { StarterChoice } from "@/components/menu/StarterChoice";

export const metadata: Metadata = { title: "Choose a partner — Packet Clash" };

/** `/starter`: where a new save picks its first partner. */
export default function StarterPage() {
  return <StarterChoice />;
}
