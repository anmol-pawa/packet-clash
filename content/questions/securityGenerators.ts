/**
 * Gym 7's security problems: Diffie-Hellman secrets, toy RSA, key counts for
 * n parties, brute-force time and password entropy. Every answer comes from
 * `lib/net/security`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { asymmetricKeys, bruteForceSeconds, diffieHellman, passwordEntropy, rsaDecrypt, rsaEncrypt, rsaKey, symmetricKeys } from "@/lib/net/security";
import { randInt, rng } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** Small primes with a generator for Diffie-Hellman: [p, g]. */
const DH_GROUPS: readonly (readonly [number, number])[] = [
  [23, 5],
  [11, 2],
  [13, 2],
  [17, 3],
  [19, 2],
];

export const dhGen: Generator = {
  id: "gen-dh",
  topic: "security",
  type: "SECURITY",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const [p, g] = pick(r, DH_GROUPS);
    const a = randInt(r, 2, p - 2);
    const b = randInt(r, 2, p - 2);
    const x = diffieHellman(p, g, a, b);
    const ask = pick(r, ["publicA", "secret"] as const);
    return {
      id: `gen-dh:${p}:${g}:${a}:${b}:${ask}`,
      kind: "numeric",
      topic: "security",
      type: "SECURITY",
      difficulty: 3,
      prompt:
        ask === "publicA"
          ? `Alice and Bob run Diffie-Hellman with p = ${p} and g = ${g}. Alice's private exponent is ${a}. What public value does she send to Bob?`
          : `Alice and Bob run Diffie-Hellman with p = ${p} and g = ${g}. Alice's private exponent is ${a} and Bob's is ${b}. What shared secret do they both end up with?`,
      answer: x[ask],
      explain:
        ask === "publicA"
          ? `Alice sends g^a mod p = ${g}^${a} mod ${p} = ${x.publicA}.`
          : `Alice sends ${g}^${a} mod ${p} = ${x.publicA}; Bob sends ${g}^${b} mod ${p} = ${x.publicB}. Each raises the other's value to their own exponent: ${x.publicB}^${a} mod ${p} = ${x.publicA}^${b} mod ${p} = ${x.secret}. An eavesdropper sees p, g and both public values but would have to solve a discrete logarithm.`,
    } satisfies Question;
  },
};

/** Prime pairs for toy RSA, with exponents coprime to φ(n). */
const RSA_KEYS: readonly (readonly [number, number, number])[] = [
  [7, 11, 13],
  [61, 53, 17],
  [5, 11, 3],
  [3, 11, 7],
  [11, 13, 7],
  [17, 11, 7],
];

export const rsaGen: Generator = {
  id: "gen-rsa",
  topic: "security",
  type: "SECURITY",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const [p, q, e] = pick(r, RSA_KEYS);
    const key = rsaKey(p, q, e)!;
    const ask = pick(r, ["encrypt", "decrypt", "d"] as const);
    const m = randInt(r, 2, Math.min(key.n - 1, 30));
    const c = rsaEncrypt(m, key);
    const answer = ask === "encrypt" ? c : ask === "decrypt" ? rsaDecrypt(c, key) : key.d;
    const prompt = {
      encrypt: `Toy RSA with p = ${p}, q = ${q} and public exponent e = ${e}. What is the ciphertext for the message ${m}?`,
      decrypt: `Toy RSA with p = ${p}, q = ${q} and public exponent e = ${e}. A message was encrypted to ${c}. What was the plaintext?`,
      d: `Toy RSA with p = ${p}, q = ${q} and public exponent e = ${e}. What is the private exponent d?`,
    }[ask];
    return {
      id: `gen-rsa:${p}:${q}:${e}:${ask}:${m}`,
      kind: "numeric",
      topic: "security",
      type: "SECURITY",
      difficulty: 3,
      prompt,
      answer,
      explain: `n = p × q = ${key.n} and φ(n) = (p − 1)(q − 1) = ${key.phi}. The private exponent is the inverse of e mod φ: d = ${key.d}, since ${e} × ${key.d} = ${e * key.d} ≡ 1 (mod ${key.phi}). ${
        ask === "encrypt" ? `Encrypt: m^e mod n = ${m}^${e} mod ${key.n} = ${c}.` : ask === "decrypt" ? `Decrypt: c^d mod n = ${c}^${key.d} mod ${key.n} = ${answer}.` : "Anyone can encrypt with (e, n); only the holder of d can decrypt."
      }`,
    } satisfies Question;
  },
};

export const keyCountGen: Generator = {
  id: "gen-key-count",
  topic: "security",
  type: "SECURITY",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const n = pick(r, [4, 5, 6, 8, 10, 20, 50, 100]);
    const sym = r() < 0.5;
    return {
      id: `gen-key-count:${n}:${sym ? "sym" : "asym"}`,
      kind: "numeric",
      topic: "security",
      type: "SECURITY",
      difficulty: 2,
      prompt: sym
        ? `${n} people each want a private channel with every other person using symmetric-key encryption. How many keys are needed in total?`
        : `${n} people each want to receive confidential messages from anyone using public-key cryptography. How many keys (public and private) exist in total?`,
      answer: sym ? symmetricKeys(n) : asymmetricKeys(n),
      explain: sym
        ? `One shared key per pair: n(n − 1)/2 = ${n} × ${n - 1} / 2 = ${symmetricKeys(n)}. It grows with n², and each key must first be shared securely.`
        : `Each person owns one key pair: 2n = ${asymmetricKeys(n)} keys. Public keys can be published, so nothing has to be shared secretly in advance.`,
    } satisfies Question;
  },
};

export const bruteForceGen: Generator = {
  id: "gen-brute-force",
  topic: "security",
  type: "SECURITY",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const bits = pick(r, [24, 32, 40, 48, 56]);
    const exp = pick(r, [3, 6, 9]);
    const rate = 10 ** exp;
    const secs = bruteForceSeconds(bits, rate);
    return {
      id: `gen-brute-force:${bits}:${exp}`,
      kind: "numeric",
      topic: "security",
      type: "SECURITY",
      difficulty: 2,
      prompt: `An attacker tests 10^${exp} keys per second against a ${bits}-bit symmetric key. On average, how many seconds until the key is found (they search half the key space)?`,
      answer: secs,
      tolerance: 0.01,
      unit: "s",
      explain: `The key space is 2^${bits} = ${(2 ** bits).toLocaleString("en-US")}; on average half of it is searched: 2^${bits - 1} / 10^${exp} = ${Number(secs.toPrecision(5))} s. Each extra key bit doubles the work.`,
    } satisfies Question;
  },
};

export const entropyGen: Generator = {
  id: "gen-password-entropy",
  topic: "security",
  type: "SECURITY",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const [name, size] = pick(r, [
      ["lowercase letters", 26],
      ["digits", 10],
      ["letters of both cases and digits", 62],
      ["printable ASCII characters", 94],
      ["hexadecimal digits", 16],
    ] as const);
    const len = randInt(r, 4, 16);
    const bits = passwordEntropy(len, size);
    return {
      id: `gen-password-entropy:${size}:${len}`,
      kind: "numeric",
      topic: "security",
      type: "SECURITY",
      difficulty: 2,
      prompt: `A password of ${len} random ${name} (${size} possible symbols per position). How many bits of entropy does it have (to one decimal place)?`,
      answer: bits,
      tolerance: 0.1,
      unit: "bits",
      explain: `Entropy = length × log₂(alphabet) = ${len} × log₂(${size}) = ${len} × ${Number(Math.log2(size).toFixed(3))} = ${Number(bits.toFixed(1))} bits, so about 2^${Math.round(bits)} guesses in the worst case.`,
    } satisfies Question;
  },
};

export const SECURITY_GENERATORS: readonly Generator[] = [dhGen, rsaGen, keyCountGen, bruteForceGen, entropyGen];
