/**
 * Web security for SDE interviews (ROADMAP 5.7): same-origin, SameSite cookie delivery, CORS
 * preflight rules, DNS spoofing search space, reflection amplification and HSTS lifetimes.
 */

export interface Origin {
  scheme: string;
  host: string;
  port: number;
}

/** Parse "scheme://host[:port]" (default ports 80 and 443). */
export function parseOrigin(url: string): Origin {
  const m = /^([a-z]+):\/\/([^/:]+)(?::(\d+))?/i.exec(url);
  if (!m) throw new Error(`bad origin: ${url}`);
  const scheme = m[1].toLowerCase();
  return { scheme, host: m[2].toLowerCase(), port: m[3] ? Number(m[3]) : scheme === "https" ? 443 : 80 };
}

/** Same-origin policy: scheme, host and port must all match. */
export function sameOrigin(a: string, b: string): boolean {
  const x = parseOrigin(a);
  const y = parseOrigin(b);
  return x.scheme === y.scheme && x.host === y.host && x.port === y.port;
}

export type SameSite = "Strict" | "Lax" | "None";

export interface CookieRequest {
  /** True when the request comes from a different site than the cookie's site. */
  crossSite: boolean;
  method: "GET" | "POST";
  /** True for a top-level navigation (clicking a link), false for subresources, fetch and forms posted by scripts. */
  topLevelNav: boolean;
}

/** Whether the browser attaches a cookie with this SameSite attribute to the request. */
export function cookieSent(attr: SameSite, req: CookieRequest): boolean {
  if (!req.crossSite || attr === "None") return true;
  if (attr === "Strict") return false;
  return req.topLevelNav && req.method === "GET";
}

const SAFE_METHODS = ["GET", "HEAD", "POST"];
const SIMPLE_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
const SIMPLE_HEADERS = ["accept", "accept-language", "content-language", "content-type"];

/** A cross-origin fetch skips the preflight only if method, headers and content type are all "simple" (CORS-safelisted). */
export function needsPreflight(method: string, headers: readonly string[], contentType?: string): boolean {
  if (!SAFE_METHODS.includes(method.toUpperCase())) return true;
  if (headers.some((h) => !SIMPLE_HEADERS.includes(h.toLowerCase()))) return true;
  if (contentType !== undefined && !SIMPLE_TYPES.includes(contentType.toLowerCase())) return true;
  return false;
}

/** Combinations an off-path attacker must search to forge a DNS answer: 16-bit transaction ID times the possible source ports. */
export function dnsSpoofSpace(sourcePorts: number): number {
  return 65536 * sourcePorts;
}

/** Traffic arriving at the victim of a reflection attack, in Mbit/s: attacker's spoofed-request rate times the amplification factor. */
export function reflectedMbps(attackerMbps: number, amplification: number): number {
  return attackerMbps * amplification;
}

/** HSTS max-age in seconds for a number of days. */
export function hstsSeconds(days: number): number {
  return days * 86400;
}

/** The HSTS preload list requires max-age of at least one year (31,536,000 s), includeSubDomains and preload. */
export const HSTS_PRELOAD_MIN_SECONDS = 31_536_000;
