import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import { TypeIcon } from "./TypeIcon";

/** A small handheld-style type tag: the type's pixel emblem and short label on its colour. */
export function TypeChip({ type, long = false, className = "" }: { type: PacketType; long?: boolean; className?: string }) {
  const t = TYPE_INFO[type];
  return (
    <span
      className={`type-chip inline-flex items-center gap-[0.35em] font-pixel leading-none ${className}`}
      style={{ background: t.color, color: t.ink }}
      data-testid="type-chip"
      title={`${type} type`}
    >
      <TypeIcon type={type} scale={1} className="type-chip-icon" />
      {long ? type : t.label}
    </span>
  );
}
