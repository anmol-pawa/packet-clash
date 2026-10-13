import { PixelSprite } from "@/components/ui/PixelSprite";
import { TYPE_ICONS } from "@/game/art/typeIcons";
import type { PacketType } from "@/game/engine/types";

/** A type's 11×11 pixel emblem at an integer scale (CSS can resize it via className). */
export function TypeIcon({ type, scale = 2, className = "" }: { type: PacketType; scale?: number; className?: string }) {
  return <PixelSprite frames={[TYPE_ICONS[type]]} scale={scale} className={`shrink-0 ${className}`} label={`${type} type icon`} />;
}
