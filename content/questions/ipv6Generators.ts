/**
 * Gym 3's IPv6 problem: write an address in its shortest legal form. Every
 * answer comes from `lib/net/ipv6`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { compressIpv6 } from "@/lib/net/ipv6";
import { randInt, rng } from "@/lib/rng";

const hex4 = (n: number) => n.toString(16).padStart(4, "0");
const short = (g: readonly number[]) => g.map((x) => x.toString(16)).join(":");

export const ipv6CompressGen: Generator = {
  id: "gen-ipv6-compress",
  topic: "network",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    // 2001:0db8 then a run of 3 zero groups and a run of 2, split by one non-zero group
    // with a leading zero, in either order, so "longest run" and "leftmost run" disagree.
    const x = randInt(r, 1, 0x0fff);
    const z = (n: number) => Array<number>(n).fill(0);
    const longFirst = r() < 0.5;
    const tail = longFirst ? [...z(3), x, ...z(2)] : [...z(2), x, ...z(3)];
    const g = [0x2001, 0x0db8, ...tail];
    const full = g.map(hex4).join(":");
    const answer = compressIpv6(full);
    const wrongAt = longFirst ? 6 : 2; // start of the shorter run
    const wrongRun = `${short(g.slice(0, wrongAt))}::${short(g.slice(wrongAt + 2))}`;
    const bothRuns = `${short(g.slice(0, 2))}::${short([x])}::`;
    const padded = answer.replace(/\b[0-9a-f]{1,3}\b/g, (h) => h.padStart(4, "0"));
    const mcq = mcqChoices(r, answer, [wrongRun, short(g), bothRuns, padded]);
    return {
      id: `gen-ipv6-compress:${full}`,
      kind: "mcq",
      topic: "network",
      type: "NETWORK",
      difficulty: 2,
      prompt: `Which is the shortest valid way to write ${full}?`,
      ...mcq,
      explain: `Drop the leading zeros in every group, then replace the longest run of all-zero groups with "::" (only once per address, and only for a run of two or more). Here that gives ${answer}.`,
    } satisfies Question;
  },
};

export const IPV6_GENERATORS: readonly Generator[] = [ipv6CompressGen];
