/**
 * Error detection and correction: parity, the Internet checksum, CRC by
 * modulo-2 long division, and single-error-correcting Hamming codes. Bit
 * strings are written most significant bit first ("1011"). Checked against
 * Kurose & Ross §6.2, Forouzan ch. 10 and Tanenbaum §3.2 in tests.
 */

const assertBits = (bits: string) => {
  if (!/^[01]+$/.test(bits)) throw new Error(`not a bit string: "${bits}"`);
};

/** Number of 1 bits. */
export const ones = (bits: string): number => [...bits].filter((b) => b === "1").length;

/** The parity bit that makes the total count of 1s even (or odd). */
export function parityBit(bits: string, even = true): 0 | 1 {
  assertBits(bits);
  const odd = ones(bits) % 2;
  return (even ? odd : 1 - odd) as 0 | 1;
}

/** Positions (0-based) where two equal-length bit strings differ. */
export function hammingDistance(a: string, b: string): number {
  assertBits(a);
  assertBits(b);
  if (a.length !== b.length) throw new Error("bit strings differ in length");
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** A code with minimum distance d detects d − 1 bit errors and corrects ⌊(d − 1)/2⌋. */
export const detectable = (dmin: number): number => dmin - 1;
export const correctable = (dmin: number): number => Math.floor((dmin - 1) / 2);

/** 16-bit ones'-complement sum: add, and wrap every carry out of bit 15 back into bit 0. */
export function onesComplementSum(words: readonly number[]): number {
  let sum = 0;
  for (const w of words) {
    if (!Number.isInteger(w) || w < 0 || w > 0xffff) throw new Error(`not a 16-bit word: ${w}`);
    sum += w;
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  return sum;
}

/** The Internet checksum (RFC 1071): the ones' complement of the ones'-complement sum. */
export const internetChecksum = (words: readonly number[]): number => ~onesComplementSum(words) & 0xffff;

/** The receiver's check: the sum of the data words and the checksum is all 1s (0xFFFF). */
export const checksumOk = (words: readonly number[], checksum: number): boolean =>
  onesComplementSum([...words, checksum]) === 0xffff;

const xorBits = (a: string, b: string) => [...a].map((c, i) => (c === b[i] ? "0" : "1")).join("");

export interface CrcStep {
  /** Index of the dividend bit the generator is lined up under. */
  at: number;
  /** The working bits before the XOR (as wide as the generator). */
  before: string;
  /** The working bits after the XOR. */
  after: string;
}

export interface CrcResult {
  /** The r = (generator length − 1) check bits. */
  remainder: string;
  /** Data followed by the remainder: what goes on the wire. */
  codeword: string;
  /** Each XOR of the long division, in order. */
  steps: CrcStep[];
}

/** Modulo-2 long division of `dividend` by `generator`: the remainder and every XOR step. */
export function mod2Divide(dividend: string, generator: string): { remainder: string; steps: CrcStep[] } {
  assertBits(dividend);
  assertBits(generator);
  if (generator[0] !== "1" || generator.length < 2) throw new Error(`bad generator ${generator}`);
  const r = generator.length - 1;
  if (dividend.length < generator.length) return { remainder: dividend.padStart(r, "0"), steps: [] };
  const bits = [...dividend];
  const steps: CrcStep[] = [];
  for (let i = 0; i + generator.length <= bits.length; i++) {
    if (bits[i] !== "1") continue;
    const before = bits.slice(i, i + generator.length).join("");
    const after = xorBits(before, generator);
    for (let j = 0; j < after.length; j++) bits[i + j] = after[j];
    steps.push({ at: i, before, after });
  }
  return { remainder: bits.slice(bits.length - r).join(""), steps };
}

/** The CRC of `data` for this generator: append r zeros, divide, and the remainder is the check bits. */
export function crc(data: string, generator: string): CrcResult {
  const r = generator.length - 1;
  const { remainder, steps } = mod2Divide(data + "0".repeat(r), generator);
  return { remainder, codeword: data + remainder, steps };
}

/** The receiver accepts a codeword iff dividing it by the generator leaves no remainder. */
export const crcOk = (codeword: string, generator: string): boolean => !mod2Divide(codeword, generator).remainder.includes("1");

/** Fewest Hamming check bits r for m data bits: 2^r ≥ m + r + 1. */
export function hammingCheckBits(m: number): number {
  if (!Number.isInteger(m) || m < 1) throw new Error(`bad data length ${m}`);
  let r = 1;
  while (2 ** r < m + r + 1) r++;
  return r;
}

const isPow2 = (n: number) => (n & (n - 1)) === 0;

/**
 * Hamming SEC code with even parity: check bits sit at positions 1, 2, 4, 8…
 * (counting from 1 at the left), data bits fill the rest in order, and check
 * bit p covers every position whose number has bit p set.
 */
export function hammingEncode(data: string): string {
  assertBits(data);
  const n = data.length + hammingCheckBits(data.length);
  const code: number[] = new Array(n + 1).fill(0);
  let k = 0;
  for (let pos = 1; pos <= n; pos++) if (!isPow2(pos)) code[pos] = Number(data[k++]);
  for (let p = 1; p <= n; p <<= 1) {
    let x = 0;
    for (let pos = 1; pos <= n; pos++) if (pos & p && pos !== p) x ^= code[pos];
    code[p] = x;
  }
  return code.slice(1).join("");
}

/** The syndrome of a received Hamming codeword: 0 if every check passes, otherwise the position (from 1) of a single flipped bit. */
export function hammingSyndrome(code: string): number {
  assertBits(code);
  let s = 0;
  for (let pos = 1; pos <= code.length; pos++) if (code[pos - 1] === "1") s ^= pos;
  return s;
}

/** The data bits of a Hamming codeword (everything not at a power-of-two position). */
export const hammingData = (code: string): string => [...code].filter((_, i) => !isPow2(i + 1)).join("");

/** Which positions (from 1) a check bit at position p covers. */
export function hammingCoverage(p: number, n: number): number[] {
  const out: number[] = [];
  for (let pos = 1; pos <= n; pos++) if (pos & p) out.push(pos);
  return out;
}
