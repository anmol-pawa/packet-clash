/**
 * IPv6 text forms (RFC 4291 §2.2, RFC 5952): expand a shorthand address to its
 * eight 16-bit groups and compress it back to the canonical short form.
 */

/** "2001:db8::1" → [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]. Throws on anything malformed. */
export function parseIpv6(s: string): number[] {
  const bad = () => new Error(`not an IPv6 address: ${s}`);
  const halves = s.trim().split("::");
  if (halves.length > 2) throw bad();
  const groups = (part: string): number[] =>
    part === ""
      ? []
      : part.split(":").map((g) => {
          if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw bad();
          return parseInt(g, 16);
        });
  const head = groups(halves[0]);
  if (halves.length === 1) {
    if (head.length !== 8) throw bad();
    return head;
  }
  const tail = groups(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (missing < 1) throw bad();
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

/** The full form: eight lowercase 4-digit groups. */
export function expandIpv6(s: string): string {
  return parseIpv6(s)
    .map((g) => g.toString(16).padStart(4, "0"))
    .join(":");
}

/**
 * The canonical short form (RFC 5952): drop leading zeros in each group, then
 * replace the longest run of two or more all-zero groups with "::" (the
 * leftmost run if tied; a single zero group stays as "0").
 */
export function compressIpv6(s: string): string {
  const g = parseIpv6(s);
  let bestAt = -1;
  let bestLen = 1;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) [bestAt, bestLen] = [i, j - i];
    i = j;
  }
  const hex = (xs: number[]) => xs.map((x) => x.toString(16)).join(":");
  if (bestAt < 0) return hex(g);
  return `${hex(g.slice(0, bestAt))}::${hex(g.slice(bestAt + bestLen))}`;
}
