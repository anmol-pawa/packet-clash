/**
 * CCNA 4.2 problems: wildcard masks and reading access lists. Every answer
 * comes from `lib/net/acl`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { evaluateAcl, parseAclLine, wildcardMatchCount, wildcardOf, type AclPacket } from "@/lib/net/acl";
import { formatIp, maskOf, parseIp } from "@/lib/net/ipv4";
import { randInt, rng, shuffled } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

export const wildcardGen: Generator = {
  id: "gen-wildcard",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const prefix = randInt(r, 9, 30);
    const net = ((randInt(r, 1, 223) * 2 ** 24 + randInt(r, 0, 255) * 2 ** 16 + randInt(r, 0, 255) * 2 ** 8) & maskOf(prefix)) >>> 0;
    const w = wildcardOf(prefix);
    const { choices, answer } = mcqChoices(r, formatIp(w), [
      formatIp(maskOf(prefix)),
      formatIp(wildcardOf(prefix + 1)),
      formatIp(wildcardOf(prefix - 1)),
      formatIp(wildcardOf(prefix + 2)),
    ]);
    return {
      id: `gen-wildcard:${formatIp(net)}/${prefix}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 1,
      prompt: `Which wildcard mask matches exactly the addresses in ${formatIp(net)}/${prefix}?`,
      choices,
      answer,
      explain: `A wildcard mask is the subnet mask with every bit flipped: 255.255.255.255 − ${formatIp(maskOf(prefix))} = ${formatIp(w)}. A 0 bit means "must match", a 1 bit means "don't care". The ACL line would read \`${formatIp(net)} ${formatIp(w)}\`.`,
    } satisfies Question;
  },
};

export const wildcardCountGen: Generator = {
  id: "gen-wildcard-count",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const bits = randInt(r, 1, 14);
    const w = (2 ** bits - 1) >>> 0;
    const base = (parseIp("172.16.0.0") + randInt(r, 0, 3) * 2 ** 16) >>> 0;
    const n = wildcardMatchCount(w);
    return {
      id: `gen-wildcard-count:${formatIp(base)}:${formatIp(w)}`,
      kind: "numeric",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `How many different addresses does the ACL entry \`${formatIp(base)} ${formatIp(w)}\` match?`,
      answer: n,
      explain: `The wildcard ${formatIp(w)} has ${bits} one-bits, which are "don't care" bits. Each can be 0 or 1, so ${n} addresses match (2^${bits}). The 0 bits must equal the base address, so this block is ${formatIp(base)} to ${formatIp((base | w) >>> 0)}.`,
    } satisfies Question;
  },
};

const LINES: readonly string[] = [
  "deny tcp 10.1.1.0 0.0.0.255 host 10.9.9.10 eq www",
  "permit tcp 10.1.0.0 0.0.255.255 host 10.9.9.10 eq www",
  "deny ip 10.1.2.0 0.0.0.255 any",
  "permit udp any host 10.9.9.53 eq domain",
  "permit icmp any any",
  "deny tcp any any eq telnet",
  "permit ip 10.1.0.0 0.0.255.255 10.9.9.0 0.0.0.255",
  "deny udp 172.16.0.0 0.0.255.255 any",
];

const SRCS = ["10.1.1.7", "10.1.2.20", "10.1.3.5", "172.16.0.5", "192.168.50.9"];
const DSTS = ["10.9.9.10", "10.9.9.53", "10.9.9.99", "10.9.8.1"];
const FLOWS: readonly { protocol: AclPacket["protocol"]; dstPort?: number; text: string }[] = [
  { protocol: "tcp", dstPort: 80, text: "TCP to port 80" },
  { protocol: "tcp", dstPort: 23, text: "TCP to port 23" },
  { protocol: "udp", dstPort: 53, text: "UDP to port 53" },
  { protocol: "icmp", text: "an ICMP echo" },
];

interface Scenario {
  lines: string[];
  packet: AclPacket;
  text: string;
  id: string;
}

function scenario(seed: number): Scenario {
  const r = rng(seed);
  const count = 3;
  const lines = shuffled(r, LINES).slice(0, count);
  const flow = pick(r, FLOWS);
  const src = pick(r, SRCS);
  const dst = pick(r, DSTS);
  const packet: AclPacket = { protocol: flow.protocol, src: parseIp(src), dst: parseIp(dst), dstPort: flow.dstPort };
  return { lines, packet, text: `${src} sends ${flow.text} to ${dst}`, id: `${seed}:${lines.map((l) => LINES.indexOf(l)).join(".")}:${src}:${dst}:${flow.text.replace(/ /g, "_")}` };
}

const listing = (lines: readonly string[]) => lines.map((l, i) => `${i + 1}  ${l}`).join("\n");

export const aclVerdictGen: Generator = {
  id: "gen-acl-verdict",
  topic: "ccna",
  type: "SECURITY",
  difficulty: 2,
  generate(seed) {
    const sc = scenario(seed);
    const v = evaluateAcl(sc.lines.map(parseAclLine), sc.packet);
    const why = v.line === null ? "No line matches, so the implicit `deny ip any any` at the end drops it." : `Line ${v.line + 1} (\`${sc.lines[v.line]}\`) is the first match, so it decides.`;
    const { choices, answer } = mcqChoices(r0(seed), v.action === "permit" ? "Permitted" : "Denied", ["Permitted", "Denied", "Permitted only after the implicit deny", "The ACL is rejected as invalid"]);
    return {
      id: `gen-acl-verdict:${sc.id}`,
      kind: "mcq",
      topic: "ccna",
      type: "SECURITY",
      difficulty: 2,
      prompt: `An ACL is applied to the interface the packet arrives on:\n\n${listing(sc.lines)}\n\nWhat happens when ${sc.text}?`,
      choices,
      answer,
      explain: `IOS reads the lines top to bottom and stops at the first match. ${why} Order matters: swapping two overlapping lines can flip the result.`,
    } satisfies Question;
  },
};

const r0 = (seed: number) => rng(seed ^ 0x5bd1e995);

export const aclLineGen: Generator = {
  id: "gen-acl-line",
  topic: "ccna",
  type: "SECURITY",
  difficulty: 3,
  generate(seed) {
    const sc = scenario(seed);
    const v = evaluateAcl(sc.lines.map(parseAclLine), sc.packet);
    const choices = [...sc.lines.map((_, i) => `Line ${i + 1}`), "None: the implicit deny"];
    const answer = v.line ?? sc.lines.length;
    return {
      id: `gen-acl-line:${sc.id}`,
      kind: "mcq",
      topic: "ccna",
      type: "SECURITY",
      difficulty: 3,
      prompt: `${listing(sc.lines)}\n\nWhich line decides the fate of the packet when ${sc.text}?`,
      choices,
      answer,
      explain: `${v.line === null ? "Nothing matches, so the packet falls through to the invisible \`deny ip any any\`. That is why every ACL that should let other traffic through needs an explicit permit at the end." : `Line ${v.line + 1} is the first one that matches the source, destination, protocol and port, and IOS stops there (\`${sc.lines[v.line]}\`). Lines below it are never read for this packet.`}`,
    } satisfies Question;
  },
};

export const ACL_GENERATORS: readonly Generator[] = [wildcardGen, wildcardCountGen, aclVerdictGen, aclLineGen];
