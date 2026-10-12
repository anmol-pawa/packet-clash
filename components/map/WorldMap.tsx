"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { currentTown, isRouteOpen, isUnlocked, ROUTES, town, TOWNS, townCidr, type Town } from "@/content/world";
import { MAP_H, MAP_W, overworld } from "@/game/art/world/overworld";
import { formatIp, hostRange, parseCidr, usableHosts } from "@/lib/net/ipv4";
import { parseSprite } from "@/lib/pixel";
import { useSave } from "@/lib/save";

/** The painted overworld at 1 px per pixel; CSS scales it with nearest-neighbour filtering. */
function MapCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const grid = parseSprite(overworld().image);
    const img = ctx.createImageData(grid.width, grid.height);
    grid.pixels.forEach((c, i) => {
      const n = parseInt(c!.slice(1), 16);
      img.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4);
    });
    ctx.putImageData(img, 0, 0);
  }, []);
  return <canvas ref={ref} width={MAP_W} height={MAP_H} role="img" aria-label="Overworld map: an island of nine towns joined by roads" className="pixelated absolute inset-0 h-full w-full" />;
}

/** A pixel badge: a faceted gem in the gym's colour, or an empty socket. */
function Badge({ t, earned }: { t: Town; earned: boolean }) {
  return (
    <span
      title={earned ? t.badge : `${t.badge} (not yet earned)`}
      aria-label={earned ? t.badge : `${t.badge}, not earned`}
      className="inline-block h-5 w-5 rotate-45 border-[3px] border-[#0b0818] sm:h-6 sm:w-6"
      style={earned ? { background: t.badgeColor, boxShadow: "inset 3px 3px 0 #ffffffaa, inset -3px -3px 0 #00000055" } : { background: "#2a2350", boxShadow: "inset 2px 2px 0 #00000088" }}
    />
  );
}

export function WorldMap() {
  const save = useSave();
  const badges = save.badges;
  const here = currentTown(badges);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = town(picked ?? here.id);
  const open = isUnlocked(sel, badges);
  const lan = townCidr(sel);
  const [first] = hostRange(lan);
  const links = ROUTES.filter((r) => r.from === sel.id || r.to === sel.id);
  const prev = TOWNS[sel.gym - 2];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="font-pixel text-sm text-[#ffd257] sm:text-base">WORLD MAP</h1>
        <div className="flex items-center gap-[7px] sm:gap-2.5" aria-label={`Badges: ${badges.length} of 9`}>
          {TOWNS.map((t) => (
            <Badge key={t.id} t={t} earned={badges.includes(t.gym)} />
          ))}
        </div>
      </header>

      <div className="relative w-full overflow-hidden rounded-md border-4 border-[#f4f1ff] shadow-[0_0_0_4px_#0b0818,6px_6px_0_4px_#0b0818]" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <MapCanvas />
        {TOWNS.map((t) => {
          const unlocked = isUnlocked(t, badges);
          const isSel = t.id === sel.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked(t.id)}
              aria-pressed={isSel}
              aria-label={`${t.name}, gym ${t.gym}${unlocked ? "" : ", locked"}`}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${(t.x / MAP_W) * 100}%`, top: `${((t.y - 3) / MAP_H) * 100}%` }}
            >
              {isSel && <span aria-hidden className="blink absolute inset-1 rounded-sm border-[3px] border-dashed border-[#ffd257]" />}
              {!unlocked && (
                <span aria-hidden className="relative mt-3 flex h-4 w-4 items-end justify-center rounded-[2px] border-2 border-[#0b0818] bg-[#c9c2b4] sm:h-5 sm:w-5">
                  <span className="absolute -top-2 h-2.5 w-2.5 rounded-t-full border-2 border-b-0 border-[#0b0818]" />
                </span>
              )}
              {t.id === here.id && (
                <span aria-hidden className="bob absolute -top-4 font-pixel text-[10px] text-[#ff5a5a] [text-shadow:2px_2px_0_#0b0818] sm:-top-5 sm:text-sm">
                  ▼
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="pixel-box flex flex-col gap-2 p-4 text-[#f4f1ff]" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-pixel text-xs sm:text-sm" style={{ color: sel.badgeColor }}>
            {sel.name.toUpperCase()}
          </h2>
          <span className="font-pixel text-[10px] text-[#9d93d6]">
            GYM {sel.gym} · CH {sel.chapter}
          </span>
        </div>
        <p className="text-lg leading-snug">{sel.topic}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-base leading-snug text-[#d9d2ff]">
          <dt className="text-[#9d93d6]">LAN</dt>
          <dd>
            {sel.subnet} · gateway {formatIp(first)} · {usableHosts(lan.prefix)} hosts
          </dd>
          <dt className="text-[#9d93d6]">Leader</dt>
          <dd>
            {sel.boss} · {sel.badge}
          </dd>
          <dt className="text-[#9d93d6]">Links</dt>
          <dd className="flex flex-col">
            {links.map((r) => {
              const other = town(r.from === sel.id ? r.to : r.from);
              const [a] = hostRange(parseCidr(r.link));
              return (
                <span key={r.id} className={isRouteOpen(r, badges) ? "" : "opacity-50"}>
                  {r.name} → {other.name}: {r.medium}, {r.link} ({formatIp(a)}–{formatIp(a + 1)})
                </span>
              );
            })}
          </dd>
        </dl>
        <div className="mt-1">
          {!open ? (
            <p className="font-pixel text-[10px] leading-relaxed text-[#ff9fb4]">LOCKED · WIN THE {prev?.badge.toUpperCase()} IN {prev?.name.toUpperCase()}</p>
          ) : sel.bossSprite ? (
            <Link href="/battle" className="pixel-button flex min-h-12 w-full items-center justify-center px-4 py-3 text-xs sm:w-auto">
              ▶ CHALLENGE {sel.boss.toUpperCase()}
            </Link>
          ) : (
            <p className="font-pixel text-[10px] leading-relaxed text-[#ffd257]">THE GYM DOORS OPEN SOON · {sel.boss.toUpperCase()} IS TRAINING</p>
          )}
        </div>
      </section>

      <nav className="flex gap-3">
        <Link href="/" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-4 py-3 text-xs">
          ◀ TITLE
        </Link>
        <Link href="/battle" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-4 py-3 text-xs">
          DEMO BATTLE
        </Link>
      </nav>
    </main>
  );
}
