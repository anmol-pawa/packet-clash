/**
 * The CCNA mock exam (ROADMAP 4.10): 40 questions dealt across the 200-301
 * blueprint domains in proportion to their exam weight, answered against one
 * clock with no feedback until the end, then a domain-weighted scorecard.
 * Pure: the page owns the clock and feeds in each result.
 */
import { BANK } from "@/content/questions/bank";
import { GENERATORS } from "@/content/questions/generators";
import { rng, shuffled } from "@/lib/rng";
import type { Question } from "./questions";

export type DomainId = "fundamentals" | "access" | "connectivity" | "services" | "security" | "automation";

export interface Domain {
  id: DomainId;
  name: string;
  /** Blueprint weight in percent (the six sum to 100). */
  weight: number;
}

/** The 200-301 blueprint domains and their published weights. */
export const DOMAINS: readonly Domain[] = [
  { id: "fundamentals", name: "Network Fundamentals", weight: 20 },
  { id: "access", name: "Network Access", weight: 20 },
  { id: "connectivity", name: "IP Connectivity", weight: 25 },
  { id: "services", name: "IP Services", weight: 10 },
  { id: "security", name: "Security Fundamentals", weight: 15 },
  { id: "automation", name: "Automation & Programmability", weight: 10 },
];

/** Questions in one exam. */
export const EXAM_LENGTH = 40;
/** Seconds for the whole exam (90 s a question). */
export const EXAM_SECONDS = EXAM_LENGTH * 90;

/** Question ids (card ids, or generator ids) per domain, first match wins. */
const RULES: readonly (readonly [DomainId, RegExp])[] = [
  ["security", /^(acl-|sec-|port-sec|dhcp-snooping|dai-|wlan-(wpa|8021x)|gen-wildcard|gen-acl-|gen-ccna-secport)/],
  ["automation", /^(auto-|gen-ccna-(jsonip|jsoncount|restverb|plane))/],
  ["services", /^(nat-|ntp-|dhcp-(relay|giaddr)|dns-client|snmp-|syslog-|qos-|gen-ccna-(natterm|natpool|syslog|dscp))/],
  ["connectivity", /^(iprt-|ospf-|eigrp-|fhrp-|hsrp-|glbp-|gen-(route-select|ad-compare|floating-ad|ospf-|eigrp-)|gen-ccna-hsrp)/],
  ["access", /^(stp-|rstp-|etherchannel-|router-on-a-stick|native-vlan|dtp-|cdp-|wlan-(ap-modes|capwap|roaming)|gen-ccna-(stp|etherchannel))/],
  ["fundamentals", /^(ccna-|v6-|wlan-|gen-(poe|cable|frame|ping|traceroute)|gen-ccna-(eui64|v6|wlan))/],
];

/** The blueprint domain a CCNA card or generator belongs to, or undefined for other topics. */
export function domainOf(id: string): DomainId | undefined {
  return RULES.find(([, re]) => re.test(id))?.[0];
}

interface Entry {
  domain: DomainId;
  make: (seed: number) => Question;
}

/** Every CCNA card and generator, tagged with its domain. */
function entries(): Entry[] {
  const out: Entry[] = [];
  for (const q of BANK) {
    const domain = q.topic === "ccna" ? domainOf(q.id) : undefined;
    if (domain) out.push({ domain, make: () => q });
  }
  for (const g of GENERATORS) {
    const domain = g.topic === "ccna" ? domainOf(g.id) : undefined;
    if (domain) out.push({ domain, make: (seed) => g.generate(seed) });
  }
  return out;
}

/** How many of `total` questions each domain gets: weight-proportional, largest remainders break ties. */
export function allocate(total: number): Record<DomainId, number> {
  const raw = DOMAINS.map((d) => ({ id: d.id, exact: (d.weight / 100) * total }));
  const counts = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)])) as Record<DomainId, number>;
  let left = total - Object.values(counts).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left-- <= 0) break;
    counts[r.id]++;
  }
  return counts;
}

export interface ExamQuestion {
  q: Question;
  domain: DomainId;
}

/** A seeded exam: each domain's quota drawn without repeats, the whole set shuffled together. */
export function examDeck(seed: number, size = EXAM_LENGTH): ExamQuestion[] {
  const r = rng(seed);
  const all = entries();
  const quota = allocate(size);
  const deck: ExamQuestion[] = [];
  for (const d of DOMAINS) {
    const pool = shuffled(r, all.filter((e) => e.domain === d.id));
    const seen = new Set<string>();
    for (const e of pool) {
      if (seen.size >= quota[d.id]) break;
      const q = e.make(Math.floor(r() * 2 ** 30) + 1);
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      deck.push({ q, domain: d.id });
    }
  }
  return shuffled(r, deck);
}

export interface ExamResult {
  q: Question;
  domain: DomainId;
  /** Left unanswered when the clock ran out (always wrong). */
  correct: boolean;
  answered: boolean;
}

export type ExamVerdict = "READY" | "CLOSE" | "KEEP STUDYING";

export interface DomainScore {
  domain: Domain;
  correct: number;
  total: number;
  /** Share right, 0-100 (0 when the domain had no questions). */
  percent: number;
}

export interface ExamScorecard {
  /** Weight-adjusted score, 0-100: each domain's share right times its blueprint weight. */
  percent: number;
  verdict: ExamVerdict;
  correct: number;
  total: number;
  unanswered: number;
  domains: DomainScore[];
  /** The weakest domain (lowest share right, weight breaks ties), if any were asked. */
  weakest?: Domain;
  missed: Question[];
}

/** Score at or above this is "READY"; the real pass mark is not published, so this is a study target. */
export const READY_PERCENT = 82;
export const CLOSE_PERCENT = 65;

/** Domain-weighted scorecard: a domain with no questions drops out and the rest are re-weighted. */
export function examScorecard(results: readonly ExamResult[]): ExamScorecard {
  const domains: DomainScore[] = DOMAINS.map((domain) => {
    const mine = results.filter((r) => r.domain === domain.id);
    const correct = mine.filter((r) => r.correct).length;
    return { domain, correct, total: mine.length, percent: mine.length === 0 ? 0 : Math.round((correct / mine.length) * 100) };
  });
  const asked = domains.filter((d) => d.total > 0);
  const weight = asked.reduce((s, d) => s + d.domain.weight, 0);
  const earned = asked.reduce((s, d) => s + (d.correct / d.total) * d.domain.weight, 0);
  const percent = weight === 0 ? 0 : Math.round((earned / weight) * 100);
  const weakest = [...asked].sort((a, b) => a.correct / a.total - b.correct / b.total || b.domain.weight - a.domain.weight)[0]?.domain;
  return {
    percent,
    verdict: percent >= READY_PERCENT ? "READY" : percent >= CLOSE_PERCENT ? "CLOSE" : "KEEP STUDYING",
    correct: results.filter((r) => r.correct).length,
    total: results.length,
    unanswered: results.filter((r) => !r.answered).length,
    domains,
    weakest,
    missed: results.filter((r) => !r.correct).map((r) => r.q),
  };
}
