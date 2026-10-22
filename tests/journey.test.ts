import { describe, expect, it } from "vitest";
import { URL_JOURNEY, connectRtts, dnsRtts, journeyRtts, type Transport } from "@/lib/net/journey";
import { pageLoadRtts, dnsCost } from "@/lib/net/application";
import { JOURNEY_GENERATORS, firstByteGen, journeyOrderGen } from "@/content/questions/journeyGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { gymDeck } from "@/content/questions/decks";
import type { NumericQuestion, OrderQuestion } from "@/game/engine/questions";

describe("URL journey", () => {
  it("runs caches, ARP, DNS, TCP, TLS, HTTP, render in that order", () => {
    expect(URL_JOURNEY.map((s) => s.id)).toEqual(["parse", "dns-cache", "arp", "dns", "tcp", "tls", "http", "response", "render"]);
    expect(new Set(URL_JOURNEY.map((s) => s.id)).size).toBe(URL_JOURNEY.length);
  });
  it("DNS comes before TCP, and TCP before TLS before HTTP", () => {
    const at = (id: string) => URL_JOURNEY.findIndex((s) => s.id === id);
    expect(at("dns")).toBeLessThan(at("tcp"));
    expect(at("tcp")).toBeLessThan(at("tls"));
    expect(at("tls")).toBeLessThan(at("http"));
  });
});

describe("journey round trips", () => {
  it("a cached address over plain HTTP is 2 RTT, as in Kurose & Ross", () => {
    expect(journeyRtts("browser", "tcp").total).toBe(pageLoadRtts("non-persistent", 0));
  });
  it("cold DNS is resolver + root + TLD + authoritative = 4 RTT, agreeing with the DNS message count", () => {
    expect(dnsRtts("none")).toBe(4);
    expect(dnsRtts("none") * 2).toBe(dnsCost("iterative", "none").messages);
    expect(dnsRtts("tld")).toBe(3);
    expect(dnsRtts("auth")).toBe(2);
    expect(dnsRtts("answer")).toBe(1);
    expect(dnsRtts("browser")).toBe(0);
  });
  it("connection setup: TCP 1, +TLS 1.3 = 2, +TLS 1.2 = 3, QUIC 1, QUIC resumed 0", () => {
    const want: Record<Transport, number> = { tcp: 1, "tcp-tls13": 2, "tcp-tls12": 3, quic: 1, "quic-0rtt": 0 };
    for (const t of Object.keys(want) as Transport[]) expect(connectRtts(t)).toBe(want[t]);
  });
  it("a fully cold HTTPS load with TLS 1.3 takes 7 RTT; TLS 1.2 takes 8; QUIC 6", () => {
    expect(journeyRtts("none", "tcp-tls13")).toEqual({ dns: 4, connect: 2, request: 1, total: 7 });
    expect(journeyRtts("none", "tcp-tls12").total).toBe(8);
    expect(journeyRtts("none", "quic").total).toBe(6);
  });
});

describe("gym 8 generators", () => {
  it("are registered, deterministic and journey-typed", () => {
    for (const g of JOURNEY_GENERATORS) {
      expect(GENERATORS).toContain(g);
      for (let s = 1; s <= 50; s++) {
        const q = g.generate(s);
        expect(q).toEqual(g.generate(s));
        expect(q.topic).toBe("journey");
      }
    }
  });
  it("first-byte answers are recomputed from the id", () => {
    for (let s = 1; s <= 300; s++) {
      const q = firstByteGen.generate(s) as NumericQuestion;
      const [, cache, transport, rtt] = q.id.split(":");
      const dns = { browser: 0, answer: 1, auth: 2, tld: 3, none: 4 }[cache as "browser"];
      const connect = { tcp: 1, "tcp-tls13": 2, "tcp-tls12": 3, quic: 1, "quic-0rtt": 0 }[transport as "tcp"];
      expect(q.answer).toBe((dns + connect + 1) * +rtt);
    }
  });
  it("order questions are consecutive slices of the journey", () => {
    for (let s = 1; s <= 100; s++) {
      const q = journeyOrderGen.generate(s) as OrderQuestion;
      const titles = URL_JOURNEY.map((x) => x.title);
      const i = titles.indexOf(q.steps[0]);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(q.steps).toEqual(titles.slice(i, i + q.steps.length));
    }
  });
  it("gym 8 asks journey questions first", () => {
    const deck = gymDeck({ session: 0, cards: {} }, 8, 1);
    expect(deck.length).toBe(10);
    expect(deck.filter((q) => q.topic === "journey").length).toBeGreaterThanOrEqual(8);
  });
});
