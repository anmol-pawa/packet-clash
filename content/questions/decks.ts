/**
 * Which questions a battle asks. A gym asks about its own chapter first (due
 * Leitner cards before new ones), then tops the deck up from every chapter
 * while its chapter's bank is still small. The demo battle shows one of each
 * question kind.
 */
import { cardKey, pickDeck, type LeitnerState } from "@/game/engine/leitner";
import type { Question, QuestionKind, TopicId } from "@/game/engine/questions";
import { BANK } from "./bank";
import { GENERATORS } from "./generators";

/** Questions per battle (the deck cycles if the battle runs longer). */
export const DECK_SIZE = 10;

/** Each gym's chapter (gym 9, the interview gauntlet, asks its own bank; gyms 10-16 use the CCNA and interview banks). */
export const GYM_TOPICS: Readonly<Record<number, readonly TopicId[]>> = {
  1: ["models"],
  2: ["link"],
  3: ["network"],
  4: ["routing"],
  5: ["transport"],
  6: ["application"],
  7: ["security"],
  8: ["journey"],
  9: ["interview"],
  // Cisco Cove is the CCNA arc, Scale Citadel the SDE arc (finer per-gym topics come with 6.3)
  10: ["ccna"],
  11: ["ccna"],
  12: ["ccna"],
  13: ["ccna"],
  14: ["interview"],
  15: ["interview"],
  16: ["interview"],
};

/**
 * The finer split of the two big topics. Gyms 10-13 share "ccna" and 14-16
 * share "interview", so each gym also keeps the cards whose id starts with one
 * of its prefixes (first matching rule wins; an unmatched card falls to gym 12 or 16,
 * and a test keeps that set empty). Generator ids start with `gen-`.
 */
const FOCUS_RULES: Readonly<Record<"ccna" | "interview", readonly (readonly [number, RegExp])[]>> = {
  ccna: [
    [13, /^(acl|wlan|sec|auto)-|^ccna-(ips|wlc)|^gen-(wildcard|acl)|^gen-ccna-(wlan|json|rest|plane)/],
    [10, /^(stp|rstp|etherchannel|port|dai|native|dtp|cdp|dhcp-snooping|router-on-a-stick|ccna)-|^gen-(poe|cable|frame|ping|traceroute)|^gen-ccna-(stp|etherchannel|secport)/],
    [11, /^(iprt|ospf|eigrp|fhrp|hsrp|glbp|v6)-|^gen-(route|ad|floating|ospf|eigrp)|^gen-ccna-(v6|eui|hsrp)/],
    [12, /^(nat|ntp|dns|snmp|syslog|qos|dhcp)-|^gen-ccna-(nat|syslog|dscp)/],
  ],
  interview: [
    [14, /^(lb|rl)-|^iv-lb|^gen-sde-(wrr|leastconn|iphash|modmoved|ringmoved|tokenbucket|fixedwindow|backoff|breaker|retryamp)/],
    [15, /^(dc|tp|rt)-|^iv-(websocket|tcp-vs-udp|stun)|^gen-sde-(mathis|wscale|slowstart|timewait|bufferbloat|rtp|jitterbuf|voip|polling|longpoll|oversub|leafspine|fattree|vxlan|vpcips|podcidr)/],
  ],
};

/** Which of gyms 10-16 a CCNA or interview card belongs to (null for every other topic). */
export function focusGym(topic: TopicId, id: string): number | null {
  if (topic !== "ccna" && topic !== "interview") return null;
  for (const [gym, re] of FOCUS_RULES[topic]) if (re.test(id)) return gym;
  return topic === "ccna" ? 12 : 16;
}

/** A gym battle's deck: its chapter's cards first, then any chapter's, never the same card twice. */
export function gymDeck(s: LeitnerState, gym: number, seed: number, size = DECK_SIZE): Question[] {
  const topics = GYM_TOPICS[gym];
  const split = gym >= 10;
  const focus = <T extends { id: string; topic: TopicId }>(x: T) => !split || focusGym(x.topic, x.id) === gym;
  const own = pickDeck(s, BANK.filter(focus), GENERATORS.filter(focus), { seed, size, topics });
  if (own.length >= size) return own;
  const used = new Set(own.map((q) => cardKey(q.id)));
  const rest = pickDeck(
    s,
    BANK.filter((q) => !used.has(cardKey(q.id))),
    GENERATORS.filter((g) => !used.has(g.id)),
    { seed: seed + 1, size: size - own.length },
  );
  return [...own, ...rest];
}

const DEMO_KINDS: readonly QuestionKind[] = ["mcq", "multi", "numeric", "order", "sort"];

/** The demo battle: one question of each kind first, so a short battle shows them all, then the rest of the bank. */
export function demoDeck(seed: number): Question[] {
  const deck = pickDeck({ session: 0, cards: {} }, BANK, GENERATORS, { seed, size: BANK.length + GENERATORS.length });
  const firsts = DEMO_KINDS.map((k) => deck.find((q) => q.kind === k)).filter((q): q is Question => !!q);
  return [...firsts, ...deck.filter((q) => !firsts.includes(q))];
}
