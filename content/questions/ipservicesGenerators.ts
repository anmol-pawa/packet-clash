/**
 * CCNA 4.6 problems: NAT address terms, dynamic NAT pool exhaustion, syslog
 * thresholds, AF DSCP values, HSRP election and virtual MACs. Answers come from
 * `lib/net/ipservices`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { afDscp, hsrpActive, hsrpVirtualMac, natEntry, natPoolSize, dynamicNatDenied, SYSLOG_LEVELS, vrrpVirtualMac, type HsrpRouter } from "@/lib/net/ipservices";
import { formatIp, parseIp } from "@/lib/net/ipv4";
import { randInt, rng } from "@/lib/rng";

const base = { topic: "ccna", type: "NETWORK" } as const;

const TERMS = [
  ["insideLocal", "Inside local"],
  ["insideGlobal", "Inside global"],
  ["outsideGlobal", "Outside global"],
] as const;

export const natTermGen: Generator = {
  id: "gen-ccna-natterm",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const inside = `10.${randInt(r, 0, 200)}.${randInt(r, 0, 250)}.${randInt(r, 2, 250)}`;
    const global = `203.0.113.${randInt(r, 2, 250)}`;
    const outside = `${randInt(r, 52, 99)}.${randInt(r, 1, 250)}.${randInt(r, 1, 250)}.${randInt(r, 2, 250)}`;
    const srcPort = randInt(r, 1024, 65000);
    const dstPort = [80, 443, 25, 22][randInt(r, 0, 3)];
    const e = natEntry(inside, srcPort, global, outside, dstPort);
    const [key, label] = TERMS[randInt(r, 0, TERMS.length - 1)];
    const answer = e[key];
    const decoys = [e.insideLocal, e.insideGlobal, e.outsideGlobal, `${global}:${dstPort}`, `${inside}:${dstPort}`].filter((x) => x !== answer);
    const { choices, answer: idx } = mcqChoices(r, answer, decoys);
    return {
      id: `gen-ccna-natterm:${inside}:${srcPort}:${global}:${outside}:${dstPort}:${key}`,
      kind: "mcq",
      ...base,
      difficulty: 3,
      prompt: `A host ${inside} sends from port ${srcPort} to the server ${outside}:${dstPort}. The router does PAT with the outside address ${global} and keeps the source port. In show ip nat translations, which entry is the ${label} address?`,
      choices,
      answer: idx,
      explain: `Inside local = the host as seen inside (${e.insideLocal}); inside global = the same host as seen outside (${e.insideGlobal}); outside global = the server's real address (${e.outsideGlobal}). Without outside NAT the outside local address is the same as outside global.`,
    } satisfies Question;
  },
};

export const natPoolGen: Generator = {
  id: "gen-ccna-natpool",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const startN = parseIp(`198.51.100.${randInt(r, 2, 100)}`);
    const size = randInt(r, 2, 8);
    const hosts = size + randInt(r, 1, 6);
    const start = formatIp(startN);
    const end = formatIp(startN + size - 1);
    return {
      id: `gen-ccna-natpool:${start}:${end}:${hosts}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `Dynamic NAT (no overload) uses the pool ${start} - ${end}. ${hosts} inside hosts start a connection to the Internet at the same time. How many of them cannot be translated?`,
      answer: dynamicNatDenied(natPoolSize(start, end), hosts),
      explain: `The pool holds ${size} addresses and each active translation uses one, so ${hosts} - ${size} = ${hosts - size} hosts are denied until an entry times out. With overload (PAT) all of them would share an address.`,
    } satisfies Question;
  },
};

const sevText = (n: number) => `${n} (${SYSLOG_LEVELS[n]})`;

export const syslogGen: Generator = {
  id: "gen-ccna-syslog",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const level = randInt(r, 2, 5);
    const blocked = randInt(r, level + 1, 7);
    const sent = Array.from({ length: level + 1 }, (_, i) => i).sort(() => r() - 0.5).slice(0, 3);
    const { choices, answer } = mcqChoices(r, sevText(blocked), sent.map(sevText));
    return {
      id: `gen-ccna-syslog:${level}:${blocked}:${[...sent].sort().join("")}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `A router is set to "logging trap ${SYSLOG_LEVELS[level].toLowerCase()}" (level ${level}). Which of these message severities is NOT sent to the syslog server?`,
      choices,
      answer,
      explain: `A threshold of ${level} sends levels 0 to ${level}; a higher number is less severe and is filtered. Severity ${sevText(blocked)} is above the threshold.`,
    } satisfies Question;
  },
};

export const dscpGen: Generator = {
  id: "gen-ccna-dscp",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const cls = randInt(r, 1, 4);
    const drop = randInt(r, 1, 3);
    const dscp = afDscp(cls, drop);
    return {
      id: `gen-ccna-dscp:${cls}${drop}`,
      kind: "numeric",
      ...base,
      difficulty: 3,
      prompt: `What is the decimal DSCP value of AF${cls}${drop}?`,
      answer: dscp,
      explain: `AFxy = 8x + 2y: 8 × ${cls} + 2 × ${drop} = ${dscp}. The class x picks the queue; the drop precedence y says how early packets are discarded.`,
    } satisfies Question;
  },
};

const NAMES = ["R1", "R2", "R3", "R4"];

export const hsrpElectGen: Generator = {
  id: "gen-ccna-hsrpelect",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const top = [100, 105, 110, 120][randInt(r, 0, 3)];
    const used = new Set<string>();
    const routers: HsrpRouter[] = NAMES.map((name) => {
      let ip = "";
      do ip = `192.168.${randInt(r, 1, 4)}.${randInt(r, 2, 40)}`;
      while (used.has(ip));
      used.add(ip);
      // Two or three routers share the top priority so the tie-break decides.
      return { name, ip, priority: r() < 0.6 ? top : 100 };
    });
    routers[0].priority = top;
    routers[1].priority = top;
    const win = hsrpActive(routers);
    const { choices, answer } = mcqChoices(r, win.name, NAMES.filter((n) => n !== win.name));
    const list = routers.map((x) => `${x.name} priority ${x.priority}, ${x.ip}`).join("; ");
    return {
      id: `gen-ccna-hsrpelect:${routers.map((x) => `${x.priority}@${x.ip}`).join("|")}`,
      kind: "mcq",
      ...base,
      difficulty: 3,
      prompt: `Four routers boot at the same time in one HSRP group (no preempt needed). ${list}. Which becomes active?`,
      choices,
      answer,
      explain: `Highest priority wins; ties go to the highest IP address. ${win.name} has priority ${win.priority} and ${win.ip}, so it is the active router.`,
    } satisfies Question;
  },
};

export const hsrpMacGen: Generator = {
  id: "gen-ccna-hsrpmac",
  ...base,
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const v2 = r() < 0.5;
    const group = v2 ? randInt(r, 16, 4000) : randInt(r, 11, 250);
    const answer = hsrpVirtualMac(group, v2 ? 2 : 1);
    const wrong = [
      v2 ? hsrpVirtualMac(Math.min(group, 255), 1) : hsrpVirtualMac(group, 2),
      vrrpVirtualMac(Math.min(group, 255)),
      `0000.0c07.ac${String(group).slice(0, 2).padStart(2, "0")}`,
      v2 ? `0000.0c9f.f${String(group).padStart(3, "0")}` : `0000.0c9f.f${group.toString(16).padStart(3, "0")}`,
    ];
    const { choices, answer: idx } = mcqChoices(r, answer, wrong);
    return {
      id: `gen-ccna-hsrpmac:${v2 ? 2 : 1}:${group}`,
      kind: "mcq",
      ...base,
      difficulty: 3,
      prompt: `What is the virtual MAC address of HSRP version ${v2 ? 2 : 1} group ${group}?`,
      choices,
      answer: idx,
      explain: `${v2 ? "HSRPv2 is 0000.0C9F.Fxxx" : "HSRPv1 is 0000.0C07.ACxx"} with the group number in hex (${group} = 0x${group.toString(16)}), so ${answer}. VRRP uses 0000.5E00.01xx.`,
    } satisfies Question;
  },
};

export const IPSERVICES_GENERATORS: readonly Generator[] = [natTermGen, natPoolGen, syslogGen, dscpGen, hsrpElectGen, hsrpMacGen];
