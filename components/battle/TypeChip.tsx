import { TYPE_INFO, type PacketType } from "@/game/engine/types";

/** A small handheld-style type tag: the type's short label on its colour. */
export function TypeChip({ type, long = false, className = "" }: { type: PacketType; long?: boolean; className?: string }) {
  const t = TYPE_INFO[type];
  return (
    <span
      className={`type-chip inline-block font-pixel leading-none ${className}`}
      style={{ background: t.color, color: t.ink }}
      data-testid="type-chip"
      title={`${type} type`}
    >
      {long ? type : t.label}
    </span>
  );
}
