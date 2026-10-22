import { describe, expect, it } from "vitest";
import { TLS13_HANDSHAKE, asymmetricKeys, bruteForceSeconds, diffieHellman, gcd, modInverse, modPow, passwordEntropy, rsaDecrypt, rsaEncrypt, rsaKey, symmetricKeys } from "@/lib/net/security";
import { SECURITY_GENERATORS, bruteForceGen, dhGen, entropyGen, keyCountGen, rsaGen } from "@/content/questions/securityGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { gymDeck } from "@/content/questions/decks";
import type { NumericQuestion } from "@/game/engine/questions";

describe("modular arithmetic", () => {
  it("modPow and modInverse agree with direct computation", () => {
    expect(modPow(5, 13, 77)).toBe(26);
    expect(modPow(7, 0, 13)).toBe(1);
    expect(modInverse(17, 3120)).toBe(2753);
    expect(modInverse(4, 8)).toBeNull();
    expect(gcd(48, 18)).toBe(6);
  });
});

describe("Diffie-Hellman", () => {
  it("p=23, g=5, a=6, b=15 gives 8, 19 and the secret 2", () => {
    expect(diffieHellman(23, 5, 6, 15)).toEqual({ publicA: 8, publicB: 19, secret: 2 });
  });
  it("both sides compute the same secret", () => {
    for (let a = 2; a < 20; a++) {
      const x = diffieHellman(23, 5, a, 7);
      expect(modPow(x.publicA, 7, 23)).toBe(x.secret);
    }
  });
});

describe("RSA", () => {
  it("Forouzan: p=7, q=11, e=13 gives d=37; 5 encrypts to 26", () => {
    const k = rsaKey(7, 11, 13)!;
    expect(k).toMatchObject({ n: 77, phi: 60, d: 37 });
    expect(rsaEncrypt(5, k)).toBe(26);
    expect(rsaDecrypt(26, k)).toBe(5);
  });
  it("p=61, q=53, e=17 gives n=3233, d=2753; 65 encrypts to 2790", () => {
    const k = rsaKey(61, 53, 17)!;
    expect(k).toMatchObject({ n: 3233, d: 2753 });
    expect(rsaEncrypt(65, k)).toBe(2790);
    expect(rsaDecrypt(2790, k)).toBe(65);
  });
  it("rejects an exponent that shares a factor with φ", () => {
    expect(rsaKey(7, 11, 6)).toBeNull();
  });
});

describe("key counts, brute force, entropy", () => {
  it("n(n-1)/2 symmetric keys vs 2n asymmetric", () => {
    expect(symmetricKeys(10)).toBe(45);
    expect(symmetricKeys(100)).toBe(4950);
    expect(asymmetricKeys(10)).toBe(20);
  });
  it("brute force searches half the key space", () => {
    expect(bruteForceSeconds(56, 1e9)).toBeCloseTo(2 ** 55 / 1e9, 0);
    expect(bruteForceSeconds(1, 1)).toBe(1);
  });
  it("entropy is length × log2(alphabet)", () => {
    expect(passwordEntropy(8, 2)).toBe(8);
    expect(passwordEntropy(10, 10)).toBeCloseTo(33.22, 2);
  });
  it("TLS 1.3 starts with ClientHello and ends in application data", () => {
    expect(TLS13_HANDSHAKE[0]).toMatch(/^ClientHello/);
    expect(TLS13_HANDSHAKE.at(-1)).toMatch(/^Application data/);
  });
});

describe("gym 7 generators", () => {
  it("are registered, deterministic and security-typed", () => {
    for (const g of SECURITY_GENERATORS) {
      expect(GENERATORS).toContain(g);
      for (let s = 1; s <= 50; s++) {
        const q = g.generate(s);
        expect(q).toEqual(g.generate(s));
        expect(q.topic).toBe("security");
        expect(q.type).toBe("SECURITY");
      }
    }
  });
  const nums = (g: (typeof SECURITY_GENERATORS)[number]) => Array.from({ length: 300 }, (_, i) => g.generate(i + 1) as NumericQuestion);
  it("DH answers are recomputed from the id", () => {
    for (const q of nums(dhGen)) {
      const [, p, g, a, b, ask] = q.id.split(":");
      const x = diffieHellman(+p, +g, +a, +b);
      expect(q.answer).toBe(ask === "publicA" ? x.publicA : x.secret);
    }
  });
  it("RSA answers round-trip", () => {
    for (const q of nums(rsaGen)) {
      const [, p, qq, e, ask, m] = q.id.split(":");
      const k = rsaKey(+p, +qq, +e)!;
      expect(q.answer).toBe(ask === "encrypt" ? rsaEncrypt(+m, k) : ask === "decrypt" ? +m : k.d);
    }
  });
  it("key counts, brute force and entropy match the solvers", () => {
    for (const q of nums(keyCountGen)) {
      const [, n, kind] = q.id.split(":");
      expect(q.answer).toBe(kind === "sym" ? symmetricKeys(+n) : asymmetricKeys(+n));
    }
    for (const q of nums(bruteForceGen)) {
      const [, bits, exp] = q.id.split(":");
      expect(q.answer).toBeCloseTo(bruteForceSeconds(+bits, 10 ** +exp), 6);
    }
    for (const q of nums(entropyGen)) {
      const [, size, len] = q.id.split(":");
      expect(q.answer).toBeCloseTo(+len * Math.log2(+size), 9);
    }
  });
  it("gym 7 asks security questions first", () => {
    const deck = gymDeck({ session: 0, cards: {} }, 7, 1);
    expect(deck.length).toBe(10);
    expect(deck.some((q) => q.topic === "security")).toBe(true);
  });
});
