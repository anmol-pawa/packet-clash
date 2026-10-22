import { URL_JOURNEY, type JourneyPhase } from "@/lib/net/journey";

/** The four machines the journey touches, left to right on the page. */
export const TRIP_NODES = ["laptop", "router", "resolver", "server"] as const;
export type TripNode = (typeof TRIP_NODES)[number];

export interface TripStep {
  id: string;
  phase: JourneyPhase;
  title: string;
  /** Nodes the packet visits, in order; a single node means nothing leaves the machine. */
  path: TripNode[];
  /** True when a reply travels the same path back. */
  reply: boolean;
  /** Short caption on the packet. */
  packet: string;
  /** Round trips this stage adds to the time to first byte (ARP and local work add none). */
  rtts: number;
  detail: string;
}

/** Where each journey step's packet goes. Keyed by `URL_JOURNEY` ids so the page cannot drift from the lesson. */
const ROUTES: Record<string, { path: TripNode[]; reply: boolean; packet: string; rtts: number }> = {
  parse: { path: ["laptop"], reply: false, packet: "URL", rtts: 0 },
  "dns-cache": { path: ["laptop"], reply: false, packet: "cache?", rtts: 0 },
  arp: { path: ["laptop", "router"], reply: true, packet: "ARP", rtts: 0 },
  dns: { path: ["laptop", "router", "resolver"], reply: true, packet: "DNS A?", rtts: 1 },
  tcp: { path: ["laptop", "router", "server"], reply: true, packet: "SYN", rtts: 1 },
  tls: { path: ["laptop", "router", "server"], reply: true, packet: "Hello", rtts: 1 },
  http: { path: ["laptop", "router", "server"], reply: false, packet: "GET /", rtts: 0 },
  response: { path: ["server", "router", "laptop"], reply: false, packet: "200 OK", rtts: 1 },
  render: { path: ["laptop"], reply: false, packet: "paint", rtts: 0 },
};

/** The nine steps with their routes. Cold DNS here is the resolver-has-it case, so DNS counts one round trip. */
export function tripSteps(): TripStep[] {
  return URL_JOURNEY.map((s) => {
    const r = ROUTES[s.id];
    if (!r) throw new Error(`no route for journey step ${s.id}`);
    return { id: s.id, phase: s.phase, title: s.title, detail: s.detail, ...r };
  });
}

/** Node indices the packet passes through, there and (if it replies) back. */
export function waypoints(step: TripStep): number[] {
  const out = step.path.map((n) => TRIP_NODES.indexOf(n));
  return step.reply ? [...out, ...out.slice(0, -1).reverse()] : out;
}
