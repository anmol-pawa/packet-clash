/**
 * Security arithmetic: modular exponentiation, Diffie-Hellman, toy RSA, key
 * counts for n parties, brute-force search time and password entropy. Worked
 * examples: Forouzan (RSA with p=7, q=11), the classic p=61, q=53 RSA example
 * and the p=23, g=5 Diffie-Hellman exchange.
 */

/** base^exp mod m by square-and-multiply (all arguments small enough for exact Number arithmetic). */
export function modPow(base: number, exp: number, m: number): number {
  let result = 1;
  let b = base % m;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % m;
    b = (b * b) % m;
    e = Math.floor(e / 2);
  }
  return result;
}

/** Greatest common divisor. */
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The inverse of `a` mod `m` (extended Euclid), or null when gcd(a, m) ≠ 1. */
export function modInverse(a: number, m: number): number | null {
  let [r0, r1] = [m, ((a % m) + m) % m];
  let [t0, t1] = [0, 1];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return r0 === 1 ? ((t0 % m) + m) % m : null;
}

export interface DhExchange {
  /** Alice's public value g^a mod p. */
  publicA: number;
  /** Bob's public value g^b mod p. */
  publicB: number;
  /** The shared secret g^(ab) mod p, which both sides compute. */
  secret: number;
}

/** A Diffie-Hellman exchange with public prime `p`, generator `g` and private exponents `a`, `b`. */
export function diffieHellman(p: number, g: number, a: number, b: number): DhExchange {
  const publicA = modPow(g, a, p);
  const publicB = modPow(g, b, p);
  const secret = modPow(publicB, a, p);
  return { publicA, publicB, secret };
}

export interface RsaKey {
  n: number;
  phi: number;
  e: number;
  /** The private exponent: e⁻¹ mod φ(n). */
  d: number;
}

/** Toy RSA from primes p, q and public exponent e (null if e is not coprime to φ). */
export function rsaKey(p: number, q: number, e: number): RsaKey | null {
  const phi = (p - 1) * (q - 1);
  const d = modInverse(e, phi);
  return d === null ? null : { n: p * q, phi, e, d };
}

export const rsaEncrypt = (m: number, k: RsaKey): number => modPow(m, k.e, k.n);
export const rsaDecrypt = (c: number, k: RsaKey): number => modPow(c, k.d, k.n);

/** Keys needed so every pair of `n` parties can talk privately with symmetric crypto: n(n−1)/2. */
export const symmetricKeys = (n: number): number => (n * (n - 1)) / 2;

/** Keys with public-key crypto: one key pair per party, 2n keys (n public, n private). */
export const asymmetricKeys = (n: number): number => 2 * n;

/** Average brute-force time in seconds: half the key space at `keysPerSecond`. */
export const bruteForceSeconds = (keyBits: number, keysPerSecond: number): number => 2 ** (keyBits - 1) / keysPerSecond;

/** Entropy in bits of a random password: length × log₂(alphabet size). */
export const passwordEntropy = (length: number, alphabet: number): number => length * Math.log2(alphabet);

/** Hash output size in bits for a hex digest of `hexChars` characters (4 bits each). */
export const digestBits = (hexChars: number): number => hexChars * 4;

/** Work to find a collision on an n-bit hash by the birthday bound: about 2^(n/2) hashes. */
export const birthdayBits = (hashBits: number): number => hashBits / 2;

/** The TLS 1.3 full handshake in order (RFC 8446 §2). */
export const TLS13_HANDSHAKE = [
  "ClientHello (with a key share)",
  "ServerHello (with its key share)",
  "EncryptedExtensions, Certificate and CertificateVerify",
  "Server Finished",
  "Client Finished",
  "Application data, encrypted",
] as const;
