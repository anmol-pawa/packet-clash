"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { gymOpen } from "@/content/gyms";
import { lessonsFor } from "@/content/lessons";
import { currentTown, isRouteOpen, isUnlocked, ROUTES, town, TOWNS, townCidr, type Town } from "@/content/world";
import { PixelSprite } from "@/components/ui/PixelSprite";
import { needsStarter, validPartner } from "@/game/engine/party";
import { PartnerCard } from "./PartnerCard";
import { badgeSprite } from "@/game/art/world/badges";
import { COURIER, COURIER_FEET } from "@/game/art/world/courier";
import { MAP_TICK_MS, mapFrame } from "@/game/art/world/mapAnim";
import { MAP_H, MAP_W, overworld } from "@/game/art/world/overworld";
import { doorstep, journey, walker, type Journey } from "@/game/world/travel";
import { formatIp, hostRange, parseCidr, usableHosts } from "@/lib/net/ipv4";
import { parseSprite, type PixelGrid } from "@/lib/pixel";
import { getSave, updateSave, useSave } from "@/lib/save";

/** Map pixels per second the courier walks. */
const WALK_SPEED = 64;
/** Map pixels per walk-cycle frame. */
const STRIDE = 5;

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

const rgbaCache = new Map<string, number>();
/** "#rrggbb" → a little-endian RGBA word for a Uint32 view of ImageData. */
function word(hex: string) {
  let w = rgbaCache.get(hex);
  if (w === undefined) {
    const n = parseInt(hex.slice(1), 16);
    w = ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    rgbaCache.set(hex, w);
  }
  return w;
}

interface Trip {
  to: string;
  journey: Journey;
}

/**
 * The living layer over the painting, at the same 1:1 pixel scale: water
 * shimmer, blinking gym lights, packets on the links and the walking courier.
 */
function MapLife({ badges, at, trip, still, onArrive }: { badges: readonly number[]; at: string; trip: Trip | null; still: boolean; onArrive: (to: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  }, [onArrive]);
  const sprites = useMemo(() => Object.fromEntries(Object.entries(COURIER).map(([k, v]) => [k, v.map(parseSprite)])) as Record<keyof typeof COURIER, PixelGrid[]>, []);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(MAP_W, MAP_H);
    const buf = new Uint32Array(img.data.buffer);
    const shadow = ((90 << 24) | 0x101018) >>> 0;
    const walk = trip ? walker(trip.journey.points) : null;
    const t0 = performance.now();
    let raf = 0;
    let last = "";
    const draw = (now: number) => {
      const tick = still ? 0 : Math.floor(now / MAP_TICK_MS);
      let pos = doorstep(town(at));
      let face: keyof typeof COURIER = "down";
      let step = 0;
      if (walk && trip) {
        const d = still ? walk.total : ((now - t0) / 1000) * WALK_SPEED;
        const w = walk.at(d);
        if (w.done) {
          arrive.current(trip.to);
          return;
        }
        pos = w.pos;
        face = w.facing;
        step = Math.floor(d / STRIDE) % 4;
      }
      const x0 = Math.round(pos[0]) - COURIER_FEET[0];
      const y0 = Math.round(pos[1]) - COURIER_FEET[1];
      const key = `${tick}|${x0}|${y0}|${face}|${step}`;
      if (key !== last) {
        last = key;
        buf.fill(0);
        for (const [i, c] of mapFrame(tick, badges)) buf[i] = word(c);
        // a soft ground shadow, then the courier
        for (let j = 0; j < 2; j++)
          for (let i = 2 + j; i < 10 - j; i++) {
            const x = x0 + i;
            const y = y0 + COURIER_FEET[1] + j;
            if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) buf[y * MAP_W + x] = shadow;
          }
        const g = sprites[face][step];
        g.pixels.forEach((c, i) => {
          if (!c) return;
          const x = x0 + (i % g.width);
          const y = y0 + ((i / g.width) | 0) - (step % 2 ? 1 : 0);
          if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) buf[y * MAP_W + x] = word(c);
        });
        ctx.putImageData(img, 0, 0);
      }
      if (!still || walk) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [badges, at, trip, still, sprites]);

  return <canvas ref={ref} width={MAP_W} height={MAP_H} aria-hidden className="pixelated pointer-events-none absolute inset-0 h-full w-full" />;
}

/** A pixel badge from the badge case, or a dim empty socket. */
function Badge({ t, earned }: { t: Town; earned: boolean }) {
  return (
    <span title={earned ? t.badge : `${t.badge} (not yet earned)`} className={earned ? "" : "opacity-25 grayscale"}>
      <PixelSprite frames={[badgeSprite(t)]} scale={1} label={earned ? t.badge : `${t.badge}, not earned`} />
    </span>
  );
}

export function WorldMap() {
  const save = useSave();
  const router = useRouter();
  // A new save picks its starter first (read the real save: the hook's first render is the server default).
  useEffect(() => {
    if (needsStarter(getSave())) router.replace("/starter");
  }, [router]);
  const badges = save.badges;
  const here = currentTown(badges);
  const [picked, setPicked] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [osStill, setOsStill] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setOsStill(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const still = osStill || save.settings.reducedMotion;
  const at = save.mapTown && TOWNS.some((t) => t.id === save.mapTown) && isUnlocked(town(save.mapTown), badges) ? save.mapTown : TOWNS[0].id;
  const sel = town(picked ?? here.id);
  const open = isUnlocked(sel, badges);
  const lan = townCidr(sel);
  const [first] = hostRange(lan);
  const links = ROUTES.filter((r) => r.from === sel.id || r.to === sel.id);
  const prev = TOWNS[sel.gym - 2];
  const route = sel.id === at ? null : journey(at, sel.id, badges);

  const walkTo = (t: Town) => {
    setPicked(t.id);
    if (trip || t.id === at) return;
    const j = journey(at, t.id, badges);
    if (j) setTrip({ to: t.id, journey: j });
  };
  const arrive = (to: string) => {
    updateSave((s) => ({ ...s, mapTown: to }));
    setTrip(null);
  };

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

      <PartnerCard p={validPartner(save.partner)} />

      <div className="relative w-full overflow-hidden rounded-md border-4 border-[#f4f1ff] shadow-[0_0_0_4px_#0b0818,6px_6px_0_4px_#0b0818]" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <MapCanvas />
        <MapLife badges={badges} at={at} trip={trip} still={still} onArrive={arrive} />
        {TOWNS.map((t) => {
          const unlocked = isUnlocked(t, badges);
          const isSel = t.id === sel.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => walkTo(t)}
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
          {route && (
            <>
              <dt className="text-[#9d93d6]">Path</dt>
              <dd>
                {route.routes.map((r) => r.name).join(" → ")} · shortest road, {Math.round(route.length)} px
              </dd>
            </>
          )}
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
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {!open ? (
            <p className="font-pixel text-[10px] leading-relaxed text-[#ff9fb4]">LOCKED · WIN THE {prev?.badge.toUpperCase()} IN {prev?.name.toUpperCase()}</p>
          ) : trip ? (
            <p className="font-pixel text-[10px] leading-relaxed text-[#ffd257]">ON THE ROAD TO {town(trip.to).name.toUpperCase()}…</p>
          ) : sel.id !== at ? (
            <button type="button" onClick={() => walkTo(sel)} className="pixel-button flex min-h-12 w-full items-center justify-center px-4 py-3 text-xs sm:w-auto">
              ▶ WALK TO {sel.name.toUpperCase()}
            </button>
          ) : gymOpen(sel) ? (
            <Link href={`/gym?n=${sel.gym}`} className="pixel-button flex min-h-12 w-full items-center justify-center px-4 py-3 text-xs sm:w-auto">
              {badges.includes(sel.gym) ? `▶ REMATCH ${sel.boss.toUpperCase()}` : `▶ ENTER GYM · VS ${sel.boss.toUpperCase()}`}
            </Link>
          ) : (
            <p className="font-pixel text-[10px] leading-relaxed text-[#ffd257]">THE GYM DOORS OPEN SOON · {sel.boss.toUpperCase()} IS TRAINING</p>
          )}
          {open && lessonsFor(sel.gym).length > 0 && (
            <Link href={`/lessons?n=${sel.gym}`} className="pixel-button flex min-h-12 w-full items-center justify-center px-4 py-3 text-xs sm:w-auto">
              LESSONS · {lessonsFor(sel.gym).length} CARDS
            </Link>
          )}
        </div>
      </section>

      <nav className="grid grid-cols-2 gap-3 sm:flex">
        <Link href="/" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          ◀ TITLE
        </Link>
        <Link href="/battle" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          DEMO BATTLE
        </Link>
        <Link href="/types" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          TYPES
        </Link>
        <Link href="/dex" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          DEX
        </Link>
        <Link href="/daily" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          DAILY
        </Link>
        <Link href="/interview" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          MOCK INTERVIEW
        </Link>
        <Link href="/lab" className="pixel-button flex min-h-12 flex-1 items-center justify-center px-3 py-3 text-xs">
          CONFIG LAB
        </Link>
      </nav>
    </main>
  );
}
