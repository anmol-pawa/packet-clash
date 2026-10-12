import type { Metadata } from "next";
import { WorldMap } from "@/components/map/WorldMap";

export const metadata: Metadata = { title: "World map — Packet Clash" };

export default function MapPage() {
  return <WorldMap />;
}
