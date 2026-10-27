/**
 * 5.7 web security problems: same-origin, SameSite cookies, CORS preflight, DNS spoofing space,
 * reflection amplification and HSTS lifetimes. Answers come from `lib/net/websec`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { cookieSent, dnsSpoofSpace, hstsSeconds, needsPreflight, reflectedMbps, sameOrigin, type SameSite } from "@/lib/net/websec";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "SECURITY" } as const;
const fmt = (n: number) => n.toLocaleString("en-US");

export const sameOriginGen: Generator = {
  id: "gen-sde-sameorigin",
  ...base,
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const page = "https://app.example.com";
    const other = pick(r, [
      "https://app.example.com/api/me",
      "http://app.example.com/api/me",
      "https://api.example.com/me",
      "https://app.example.com:8443/me",
      "https://app.example.com:443/other",
      "https://example.com/me",
    ]);
    const same = sameOrigin(page, other);
    return {
      id: `gen-sde-sameorigin:${other}`,
      kind: "mcq",
      ...base,
      difficulty: 1,
      prompt: `A script on ${page} requests ${other}. Is that request same-origin?`,
      choices: ["Same-origin", "Cross-origin", "Same-origin only if the paths match", "Decided by the server's CORS headers"],
      answer: same ? 0 : 1,
      explain: "Origin = scheme + host + port. Any difference (http vs https, api. vs app., a non-default port) makes it cross-origin; the default port of the scheme (443 for https) equals the explicit one.",
    } satisfies Question;
  },
};

export const sameSiteGen: Generator = {
  id: "gen-sde-samesite",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const attr = pick(r, ["Strict", "Lax", "None"] as const satisfies readonly SameSite[]);
    const scenario = pick(r, [
      { text: "the user clicks a link on evil.test that navigates the whole tab to the bank (GET)", req: { crossSite: true, method: "GET", topLevelNav: true } },
      { text: "a hidden form on evil.test auto-submits a POST to the bank", req: { crossSite: true, method: "POST", topLevelNav: true } },
      { text: "an <img> tag on evil.test loads a URL on the bank", req: { crossSite: true, method: "GET", topLevelNav: false } },
      { text: "a script on the bank's own site calls fetch() to the bank's API", req: { crossSite: false, method: "GET", topLevelNav: false } },
    ] as const);
    const sent = cookieSent(attr, scenario.req);
    return {
      id: `gen-sde-samesite:${attr}:${scenario.text.slice(0, 18)}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `The bank's session cookie has SameSite=${attr}. Is it sent when ${scenario.text}?`,
      choices: ["Sent", "Not sent", "Sent only if the cookie is HttpOnly", "Sent only after a preflight"],
      answer: sent ? 0 : 1,
      explain: "Strict: same-site requests only. Lax: also top-level GET navigations, but not cross-site POSTs or subresources. None: always sent (and must be Secure). This is why Lax by default blunts most CSRF.",
    } satisfies Question;
  },
};

export const preflightGen: Generator = {
  id: "gen-sde-preflight",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const c = pick(r, [
      { m: "GET", h: [], t: undefined, d: "a GET with no custom headers" },
      { m: "POST", h: [], t: "application/x-www-form-urlencoded", d: "a form-encoded POST" },
      { m: "POST", h: [], t: "application/json", d: "a POST with Content-Type: application/json" },
      { m: "GET", h: ["Authorization"], t: undefined, d: "a GET with an Authorization header" },
      { m: "PUT", h: [], t: "text/plain", d: "a PUT request" },
      { m: "DELETE", h: [], t: undefined, d: "a DELETE request" },
      { m: "POST", h: [], t: "text/plain", d: "a POST with Content-Type: text/plain" },
    ] as const);
    const need = needsPreflight(c.m, c.h, c.t);
    return {
      id: `gen-sde-preflight:${c.d}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `A page makes a cross-origin fetch(): ${c.d}. Does the browser first send an OPTIONS preflight?`,
      choices: ["Yes, a preflight is sent", "No, it is a simple request", "Only if the response sets cookies", "Only if the page uses HTTP"],
      answer: need ? 0 : 1,
      explain: "Simple requests use GET/HEAD/POST, only CORS-safelisted headers, and a Content-Type of form-urlencoded, multipart/form-data or text/plain. Anything else (JSON bodies, Authorization, PUT/DELETE) triggers a preflight.",
    } satisfies Question;
  },
};

export const dnsSpaceGen: Generator = {
  id: "gen-sde-dnsspace",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const ports = pick(r, [1, 1024, 16384, 28232, 64511]);
    const n = dnsSpoofSpace(ports);
    return {
      id: `gen-sde-dnsspace:${ports}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `A resolver sends queries from ${fmt(ports)} possible source port${ports === 1 ? "" : "s"} and uses a random 16-bit transaction ID. How many (port, ID) combinations must an off-path attacker search to forge an answer?`,
      answer: n,
      unit: "combinations",
      explain: `65,536 IDs × ${fmt(ports)} ports = ${fmt(n)}. A fixed port (1) left only 65,536, which is what the Kaminsky attack exploited; source-port randomisation multiplies the space, and DNSSEC removes the guessing entirely.`,
    } satisfies Question;
  },
};

export const amplifyGen: Generator = {
  id: "gen-sde-amplify",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mbps = pick(r, [10, 20, 50, 100, 200]);
    const [proto, factor] = pick(r, [["DNS", 50], ["NTP monlist", 500], ["SSDP", 30], ["CLDAP", 70]] as const);
    const out = reflectedMbps(mbps, factor);
    return {
      id: `gen-sde-amplify:${mbps}:${proto}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `An attacker sends ${mbps} Mbit/s of spoofed ${proto} requests with the victim's address as the source. The service amplifies traffic ${factor}x. How much traffic reaches the victim, in Mbit/s?`,
      answer: out,
      unit: "Mbit/s",
      explain: `${mbps} × ${factor} = ${fmt(out)} Mbit/s. Reflection hides the attacker behind open resolvers; ingress filtering (BCP 38) and closing open reflectors stop it.`,
    } satisfies Question;
  },
};

export const hstsGen: Generator = {
  id: "gen-sde-hsts",
  ...base,
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const days = pick(r, [1, 7, 30, 90, 180, 365, 730]);
    const s = hstsSeconds(days);
    return {
      id: `gen-sde-hsts:${days}`,
      kind: "numeric",
      ...base,
      difficulty: 1,
      prompt: `You want browsers to remember HSTS for ${fmt(days)} day${days === 1 ? "" : "s"}. What max-age value, in seconds, goes in Strict-Transport-Security?`,
      answer: s,
      unit: "seconds",
      explain: `${fmt(days)} × 86,400 = ${fmt(s)} s. The HSTS preload list requires at least 31,536,000 s (1 year) plus includeSubDomains and preload.`,
    } satisfies Question;
  },
};

export const WEBSEC_GENERATORS: readonly Generator[] = [sameOriginGen, sameSiteGen, preflightGen, dnsSpaceGen, amplifyGen, hstsGen];
