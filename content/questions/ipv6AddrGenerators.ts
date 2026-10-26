/**
 * CCNA 4.5 problems: EUI-64 link-local address from a MAC, address type of a
 * prefix, and the /64 subnet for a subnet number. Every answer comes from
 * `lib/net/ipv6addr`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { compressIpv6 } from "@/lib/net/ipv6";
import { ipv6Type, linkLocalFromMac, subnet64, type Ipv6Type } from "@/lib/net/ipv6addr";
import { randInt, rng } from "@/lib/rng";

const byteHex = (n: number) => n.toString(16).padStart(2, "0");
const randMac = (r: () => number) =>
  Array.from({ length: 6 }, (_, i) => byteHex(i === 0 ? randInt(r, 0, 0x3f) * 4 : randInt(r, 0, 255)).toUpperCase()).join(":");

export const eui64Gen: Generator = {
  id: "gen-ccna-eui64",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const mac = randMac(r);
    const answer = linkLocalFromMac(mac);
    // Distractors: forget the bit flip, flip the wrong bit, and forget FF:FE.
    const b = mac.split(":").map((x) => parseInt(x, 16));
    const withFirst = (v: number) => linkLocalFromMac([byteHex(v), ...mac.split(":").slice(1)].join(":"));
    const flipped = byteHex(b[0] ^ 0x02);
    const grp = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
    const noFffe = compressIpv6(`fe80:0:0:0:0:${grp(b[0] ^ 2, b[1])}:${grp(b[2], b[3])}:${grp(b[4], b[5])}`);
    const { choices, answer: idx } = mcqChoices(r, answer, [withFirst(b[0] ^ 0x02), withFirst(b[0] ^ 0x03), noFffe]);
    return {
      id: `gen-ccna-eui64:${mac}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 3,
      prompt: `An interface has MAC address ${mac}. Which link-local address does it build with EUI-64?`,
      choices,
      answer: idx,
      explain: `Split the MAC, insert FF:FE in the middle and flip the 7th bit of the first byte (${byteHex(b[0]).toUpperCase()} → ${flipped.toUpperCase()}). Result: ${answer}.`,
    } satisfies Question;
  },
};

const SAMPLES: readonly { addr: string; type: Ipv6Type }[] = [
  { addr: "fe80::1", type: "link-local" },
  { addr: "fe80::a00:27ff:fe4e:66a1", type: "link-local" },
  { addr: "fd12:3456:789a::1", type: "unique-local" },
  { addr: "fc00:db8::5", type: "unique-local" },
  { addr: "ff02::5", type: "multicast" },
  { addr: "ff02::1:ff3c:4d5e", type: "multicast" },
  { addr: "2001:db8:acad:1::1", type: "global-unicast" },
  { addr: "2607:f8b0:4005:80a::200e", type: "global-unicast" },
  { addr: "3ffe:1900:4545:3::f", type: "global-unicast" },
  { addr: "::1", type: "loopback" },
  { addr: "::", type: "unspecified" },
];
const LABEL: Record<Ipv6Type, string> = {
  "link-local": "Link-local",
  "unique-local": "Unique local",
  multicast: "Multicast",
  "global-unicast": "Global unicast",
  loopback: "Loopback",
  unspecified: "Unspecified",
  other: "Other",
};

export const ipv6TypeGen: Generator = {
  id: "gen-ccna-v6type",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const s = SAMPLES[randInt(r, 0, SAMPLES.length - 1)];
    const type = ipv6Type(s.addr);
    const wrong = (["Link-local", "Unique local", "Multicast", "Global unicast", "Loopback"] as const).filter((l) => l !== LABEL[type]);
    const { choices, answer } = mcqChoices(r, LABEL[type], wrong.slice(0, 3));
    return {
      id: `gen-ccna-v6type:${s.addr}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 2,
      prompt: `What type of IPv6 address is ${s.addr}?`,
      choices,
      answer,
      explain: `Look at the leading bits: 2000::/3 global unicast, fc00::/7 unique local (fd in practice), fe80::/10 link-local, ff00::/8 multicast, ::1 loopback, :: unspecified. ${s.addr} is ${LABEL[type].toLowerCase()}.`,
    } satisfies Question;
  },
};

const PREFIXES = ["2001:db8:acad", "2001:db8:1234", "2607:f0d0:1002", "fd00:abcd:12"] as const;

export const subnetIdGen: Generator = {
  id: "gen-ccna-v6subnet",
  topic: "ccna",
  type: "NETWORK",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const p = PREFIXES[randInt(r, 0, PREFIXES.length - 1)];
    const n = randInt(r, 10, 4000);
    const answer = subnet64(p, n);
    const near = [n + 1, n - 1, n.toString(16) === String(n) ? n + 16 : parseInt(String(n), 16)].map((m) => subnet64(p, m));
    const { choices, answer: idx } = mcqChoices(r, answer, near.filter((x) => x !== answer));
    return {
      id: `gen-ccna-v6subnet:${p}:${n}`,
      kind: "mcq",
      topic: "ccna",
      type: "NETWORK",
      difficulty: 3,
      prompt: `You own ${p}::/48 and number your /64 subnets from 0. What is subnet number ${n} (decimal)?`,
      choices,
      answer: idx,
      explain: `The 16-bit subnet ID is the fourth group. ${n} in hex is ${n.toString(16)}, so the subnet is ${answer}. A /48 holds 2^16 = 65536 /64 subnets.`,
    } satisfies Question;
  },
};

export const IPV6_ADDR_GENERATORS: readonly Generator[] = [eui64Gen, ipv6TypeGen, subnetIdGen];
