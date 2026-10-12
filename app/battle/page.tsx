import type { Metadata } from "next";
import { BattleScreen } from "@/components/battle/BattleScreen";

export const metadata: Metadata = { title: "Battle — Packet Clash" };

export default function BattlePage() {
  return <BattleScreen />;
}
