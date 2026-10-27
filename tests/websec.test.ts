import { describe, expect, it } from "vitest";
import { WEBSEC_BANK } from "@/content/questions/webSecBank";
import { WEBSEC_GENERATORS, amplifyGen, dnsSpaceGen, hstsGen, preflightGen, sameOriginGen, sameSiteGen } from "@/content/questions/webSecGenerators";
import { GENERATORS } from "@/content/questions/generators";
import type { McqQuestion, NumericQuestion } from "@/game/engine/questions";
import { HSTS_PRELOAD_MIN_SECONDS, cookieSent, dnsSpoofSpace, hstsSeconds, needsPreflight, parseOrigin, reflectedMbps, sameOrigin } from "@/lib/net/websec";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 13);

describe("websec solver", () => {
  it("same-origin follows the MDN table (scheme, host, port)", () => {
    const page = "http://store.company.com/dir/page.html";
    expect(sameOrigin(page, "http://store.company.com/dir2/other.html")).toBe(true);
    expect(sameOrigin(page, "https://store.company.com/page.html")).toBe(false);
    expect(sameOrigin(page, "http://store.company.com:81/dir/page.html")).toBe(false);
    expect(sameOrigin(page, "http://news.company.com/dir/page.html")).toBe(false);
    expect(parseOrigin("https://a.test").port).toBe(443);
    expect(sameOrigin("https://a.test", "https://a.test:443/x")).toBe(true);
  });
  it("SameSite delivery", () => {
    const nav = { crossSite: true, method: "GET", topLevelNav: true } as const;
    const post = { crossSite: true, method: "POST", topLevelNav: true } as const;
    const img = { crossSite: true, method: "GET", topLevelNav: false } as const;
    const own = { crossSite: false, method: "POST", topLevelNav: false } as const;
    expect([cookieSent("Strict", nav), cookieSent("Lax", nav), cookieSent("None", nav)]).toEqual([false, true, true]);
    expect([cookieSent("Strict", post), cookieSent("Lax", post), cookieSent("None", post)]).toEqual([false, false, true]);
    expect(cookieSent("Lax", img)).toBe(false);
    expect([cookieSent("Strict", own), cookieSent("Lax", own)]).toEqual([true, true]);
  });
  it("CORS simple vs preflighted (Fetch standard)", () => {
    expect(needsPreflight("GET", [])).toBe(false);
    expect(needsPreflight("POST", [], "application/x-www-form-urlencoded")).toBe(false);
    expect(needsPreflight("POST", [], "application/json")).toBe(true);
    expect(needsPreflight("GET", ["Authorization"])).toBe(true);
    expect(needsPreflight("DELETE", [])).toBe(true);
    expect(needsPreflight("post", ["Accept"], "TEXT/PLAIN")).toBe(false);
  });
  it("DNS spoof space, amplification and HSTS", () => {
    expect(dnsSpoofSpace(1)).toBe(2 ** 16);
    expect(dnsSpoofSpace(65536)).toBe(2 ** 32);
    expect(reflectedMbps(100, 50)).toBe(5000);
    expect(hstsSeconds(365)).toBe(HSTS_PRELOAD_MIN_SECONDS);
  });
});

describe("websec cards", () => {
  it("are well-formed security MCQs", () => {
    for (const q of WEBSEC_BANK as McqQuestion[]) {
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
  });
});

describe("websec generators", () => {
  it("are registered", () => {
    for (const g of WEBSEC_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const s of seeds) {
      const so = sameOriginGen.generate(s) as McqQuestion;
      const [, page, target] = /on (\S+) requests (\S+)\./.exec(so.prompt)!;
      expect(so.answer).toBe(sameOrigin(page, target) ? 0 : 1);

      const ss = sameSiteGen.generate(s) as McqQuestion;
      const attr = /SameSite=(\w+)/.exec(ss.prompt)![1];
      const cross = !ss.prompt.includes("bank's own site");
      const top = ss.prompt.includes("navigates") || ss.prompt.includes("auto-submits");
      const post = ss.prompt.includes("POST to");
      const expected = !cross || attr === "None" || (attr === "Lax" && top && !post);
      expect(ss.answer).toBe(expected ? 0 : 1);

      const pf = preflightGen.generate(s) as McqQuestion;
      const json = pf.prompt.includes("application/json") || pf.prompt.includes("Authorization") || /a (PUT|DELETE) request/.test(pf.prompt);
      expect(pf.answer).toBe(json ? 0 : 1);

      const d = dnsSpaceGen.generate(s) as NumericQuestion;
      expect(d.answer).toBe(65536 * Number(/from ([\d,]+) possible/.exec(d.prompt)![1].replace(/,/g, "")));

      const a = amplifyGen.generate(s) as NumericQuestion;
      const [mb, f] = [Number(/sends (\d+) Mbit/.exec(a.prompt)![1]), Number(/amplifies traffic (\d+)x/.exec(a.prompt)![1])];
      expect(a.answer).toBe(mb * f);

      const h = hstsGen.generate(s) as NumericQuestion;
      expect(h.answer).toBe(Number(/for ([\d,]+) day/.exec(h.prompt)![1].replace(/,/g, "")) * 86400);
    }
  });
});
