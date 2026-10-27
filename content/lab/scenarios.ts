/**
 * CCNA lab scenarios (4.9): a small IOS config or `show` output and one
 * question about it. Every exhibit is built from structured data and every
 * answer is computed by the `lib/net` solvers on that same data, so the text
 * the player reads and the answer can't drift apart.
 */
import { mcqChoices, type McqQuestion } from "@/game/engine/questions";
import { evaluateAcl, aclKindOfNumber, formatAclLine, parseAclLine, placement, type AclPacket } from "@/lib/net/acl";
import { formatCidr, formatIp, maskOf, parseCidr, parseIp, usableHosts } from "@/lib/net/ipv4";
import { ADMIN_DISTANCE, ROUTE_CODE, installedFor, route, selectRoute, showRouteLine, type Route, type RouteSource } from "@/lib/net/iproute";
import { linkLocalFromMac } from "@/lib/net/ipv6addr";
import { diagnoseHost, etherChannelOutcome, parseVlanList, type ChannelOutcome, type HostFault } from "@/lib/net/lab";
import { electDr, ospfCost, pathCost } from "@/lib/net/ospf";
import { computeStp, effectivePriority, stpPortCost, violationOutcome, type EtherChannelMode, type StpBridge, type ViolationMode } from "@/lib/net/stp";
import { compareBridgeIds } from "@/lib/net/switching";
import type { PacketType } from "@/game/engine/types";
import { randInt, rng, shuffled } from "@/lib/rng";

export interface LabExhibit {
  title: string;
  /** Monospace text: a config or `show` output. */
  text: string;
}

export interface LabScenario {
  id: string;
  title: string;
  exhibits: LabExhibit[];
  question: McqQuestion;
}

export interface LabBuilder {
  id: string;
  title: string;
  build(seed: number): LabScenario;
}

type R = () => number;
const pick = <T>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const hex = (r: R, n: number) => Array.from({ length: n }, () => randInt(r, 0, 15).toString(16)).join("");
const macDots = (h: string) => `${h.slice(0, 4)}.${h.slice(4, 8)}.${h.slice(8, 12)}`;

interface Spec {
  type: PacketType;
  difficulty?: 1 | 2 | 3;
  prompt: string;
  answer: string;
  wrong: readonly string[];
  explain: string;
}

function scenario(b: Omit<LabBuilder, "build">, seed: number, r: R, exhibits: LabExhibit[], s: Spec): LabScenario {
  const { choices, answer } = mcqChoices(r, s.answer, s.wrong);
  return {
    id: `lab-${b.id}:${seed}`,
    title: b.title,
    exhibits,
    question: {
      id: `lab-${b.id}:${seed}`,
      kind: "mcq",
      topic: "ccna",
      type: s.type,
      difficulty: s.difficulty ?? 2,
      prompt: s.prompt,
      choices,
      answer,
      explain: s.explain,
    },
  };
}

function def(id: string, title: string, fn: (b: Omit<LabBuilder, "build">, seed: number, r: R) => LabScenario): LabBuilder {
  const meta = { id, title };
  return { ...meta, build: (seed) => fn(meta, seed, rng(seed)) };
}

// ---------------------------------------------------------------- switching

function switches(r: R, n: number): StpBridge[] {
  const prios = shuffled(r, [4096, 8192, 24576, 28672, 32768, 32768, 32768, 36864, 40960]).slice(0, n);
  return prios.map((p, i) => ({ name: `SW${i + 1}`, priority: effectivePriority(p, 1), mac: `0019${hex(r, 8)}` }));
}

const stpRoot = def("stp-root", "Who is the root bridge?", (b, seed, r) => {
  const bridges = switches(r, 3);
  const root = [...bridges].sort(compareBridgeIds)[0];
  const ex = bridges.map((s) => ({
    title: `${s.name}# show spanning-tree vlan 1 | include Bridge ID`,
    text: `  Bridge ID  Priority    ${s.priority}  (priority ${s.priority - 1} sys-id-ext 1)\n             Address     ${macDots(s.mac)}`,
  }));
  const others = bridges.filter((s) => s !== root);
  const lowMac = [...bridges].sort((x, y) => x.mac.localeCompare(y.mac))[0];
  return scenario(b, seed, r, ex, {
    type: "LINK",
    prompt: "All three switches run PVST+ on VLAN 1 and are connected together. Which switch becomes the root bridge?",
    answer: root.name,
    wrong: [...others.map((s) => s.name), lowMac.name, "The switch with the most ports"],
    explain: `The lowest bridge ID wins: priority first (${root.priority} is the lowest here), and the MAC address only breaks a tie. ${root.name} has the lowest priority${bridges.filter((x) => x.priority === root.priority).length > 1 ? " tied with another switch, then the lower MAC" : ""}.`,
  });
});

const stpBlocked = def("stp-blocked", "Where does STP block?", (b, seed, r) => {
  for (let attempt = 0; ; attempt++) {
    const bridges = switches(r, 3);
    const speeds = [10, 100, 1000];
    const links = [
      { a: "SW1", b: "SW2", mbps: pick(r, speeds) },
      { a: "SW2", b: "SW3", mbps: pick(r, speeds) },
      { a: "SW1", b: "SW3", mbps: pick(r, speeds) },
    ];
    const res = computeStp(bridges, links.map((l) => ({ a: l.a, b: l.b, cost: stpPortCost(l.mbps) })));
    const blocked = res.ports.filter((p) => p.role === "blocked");
    if (blocked.length !== 1 && attempt < 200) continue;
    const bl = blocked[0];
    const text = (s: StpBridge) => `${s.name}: priority ${s.priority - 1}, MAC ${macDots(s.mac)}`;
    const ans = `${bl.bridge}, on its link to ${bl.peer}`;
    const wrong = res.ports.filter((p) => p !== bl && p.role !== "blocked").map((p) => `${p.bridge}, on its link to ${p.peer}`);
    return scenario(b, seed, r, [
      { title: "Bridges (VLAN 1)", text: bridges.map(text).join("\n") },
      { title: "Links", text: links.map((l) => `${l.a} — ${l.b}   ${l.mbps} Mbps`).join("\n") },
    ], {
      type: "LINK",
      difficulty: 3,
      prompt: "STP has converged with default costs. Which port ends up in the blocking state?",
      answer: ans,
      wrong,
      explain: `${res.root} is the root. Each other switch picks its lowest-cost path to the root as its root port, the link ends with the lower root path cost become designated, and the remaining end blocks. ${bl.bridge} (root path cost ${res.pathCost[bl.bridge]}) blocks toward ${bl.peer} (root path cost ${res.pathCost[bl.peer]}).`,
    });
  }
});

const trunkAllowed = def("trunk-allowed", "Trunk allowed list", (b, seed, r) => {
  const vlans = [10, 11, 12, 20];
  const missing = pick(r, vlans);
  const list = {
    10: "11-12,20",
    11: "10,12,20",
    12: "10-11,20",
    20: "10-12",
  }[missing as 10 | 11 | 12 | 20];
  const allowed = parseVlanList(list);
  const blocked = vlans.filter((v) => !allowed.includes(v));
  return scenario(b, seed, r, [
    { title: "SW1# show running-config interface gi0/1", text: `interface GigabitEthernet0/1\n switchport trunk encapsulation dot1q\n switchport mode trunk\n switchport trunk allowed vlan ${list}` },
    { title: "VLANs with hosts on both switches", text: vlans.map((v) => `VLAN ${v}`).join("\n") },
  ], {
    type: "LINK",
    prompt: "Users complain that one VLAN can't reach its other-switch peers over this trunk. Which VLAN is it?",
    answer: `VLAN ${blocked[0]}`,
    wrong: vlans.filter((v) => v !== blocked[0]).map((v) => `VLAN ${v}`).concat("None: the native VLAN carries them all"),
    explain: `\`switchport trunk allowed vlan\` lists the only VLANs the trunk carries. VLAN ${blocked[0]} is missing from "${list}", so its frames are never sent over Gi0/1.`,
  });
});

const portSecurity = def("port-security", "Port security violation", (b, seed, r) => {
  const mode = pick<ViolationMode>(r, ["protect", "restrict", "shutdown"]);
  const max = randInt(r, 1, 2);
  const o = violationOutcome(mode);
  const text: Record<ViolationMode, string> = {
    protect: "The violating frames are dropped silently: no log message and no violation counter; the port stays up.",
    restrict: "The violating frames are dropped, a syslog message is sent and the counter rises; the port stays up.",
    shutdown: "The port goes err-disabled and stays down until an admin shuts and re-enables it.",
  };
  const outcome = o.errDisabled ? text.shutdown : o.logsAndCounts ? text.restrict : text.protect;
  return scenario(b, seed, r, [
    { title: "SW1# show running-config interface fa0/5", text: `interface FastEthernet0/5\n switchport mode access\n switchport port-security\n switchport port-security maximum ${max}\n switchport port-security mac-address sticky${mode === "shutdown" ? "" : `\n switchport port-security violation ${mode}`}` },
  ], {
    type: "SECURITY",
    prompt: `${max} sticky MAC${max > 1 ? "s have" : " has"} been learned on Fa0/5. A new device with a different MAC address is plugged into the port. What happens?`,
    answer: outcome,
    wrong: [...Object.values(text).filter((t) => t !== outcome), "The frames are forwarded and the new MAC is added to the table."],
    explain: `The ${max}-address limit is exceeded, which is a violation. The default (and \`shutdown\`) mode err-disables the port; \`restrict\` drops and logs; \`protect\` drops quietly.${mode === "shutdown" ? " No violation command is shown, so the default, shutdown, applies." : ""}`,
  });
});

const channelText: Record<ChannelOutcome, string> = {
  forms: "Yes, the EtherChannel forms",
  "protocol-mismatch": "No, one side runs LACP and the other PAgP",
  "nobody-initiates": "No, both sides wait passively for the other to start",
  "on-needs-on": "No, `on` only bundles with another `on`",
};

const etherChannel = def("etherchannel", "Will the bundle form?", (b, seed, r) => {
  const modes: EtherChannelMode[] = ["active", "passive", "desirable", "auto", "on"];
  const a = pick(r, modes);
  const c = pick(r, modes);
  const out = etherChannelOutcome(a, c);
  const cfg = (m: EtherChannelMode) => `interface range gi0/1 - 2\n channel-group 1 mode ${m}`;
  return scenario(b, seed, r, [
    { title: "SW1# show running-config", text: cfg(a) },
    { title: "SW2# show running-config", text: cfg(c) },
  ], {
    type: "LINK",
    prompt: "Two links are cabled between SW1 and SW2 with matching speed and duplex. What happens to the channel?",
    answer: channelText[out],
    wrong: Object.values(channelText).filter((t) => t !== channelText[out]),
    explain: `LACP uses active/passive, PAgP uses desirable/auto, and \`on\` uses no protocol at all. A channel needs the same protocol on both ends and at least one side that starts the negotiation (active or desirable); ${a}/${c} gives: ${channelText[out].toLowerCase()}.`,
  });
});

// ------------------------------------------------------------------ routing

const aclPool = [
  "permit tcp 10.1.1.0 0.0.0.255 any eq www",
  "deny tcp 10.1.0.0 0.0.255.255 any eq www",
  "permit tcp 10.1.0.0 0.0.255.255 host 192.168.9.10 eq 443",
  "deny ip 10.1.2.0 0.0.0.255 any",
  "permit icmp any any",
  "deny udp any any eq domain",
  "permit ip 10.1.0.0 0.0.255.255 any",
  "deny tcp any host 192.168.9.10 range 20 21",
];

function aclScenario(b: Omit<LabBuilder, "build">, seed: number, r: R, ask: "verdict" | "line"): LabScenario {
  const lines = shuffled(r, aclPool).slice(0, 4);
  const acl = lines.map(parseAclLine);
  const pkt: AclPacket = {
    protocol: pick<AclPacket["protocol"]>(r, ["tcp", "tcp", "udp", "icmp"]),
    src: parseIp(`10.1.${randInt(r, 1, 3)}.${randInt(r, 2, 200)}`),
    dst: parseIp(pick(r, ["192.168.9.10", "192.168.9.77", "172.16.4.4"])),
  };
  if (pkt.protocol === "tcp") pkt.dstPort = pick(r, [80, 443, 21, 25]);
  if (pkt.protocol === "udp") pkt.dstPort = pick(r, [53, 123]);
  const v = evaluateAcl(acl, pkt);
  const what = `${pkt.protocol.toUpperCase()} from ${formatIp(pkt.src)} to ${formatIp(pkt.dst)}${pkt.dstPort ? ` port ${pkt.dstPort}` : ""}`;
  const numbered = lines.map((l, i) => `${(i + 1) * 10} ${formatAclLine(parseAclLine(l))}`);
  const ex = [
    { title: "R1# show ip access-lists WEB-IN", text: `Extended IP access list WEB-IN\n${numbered.map((l) => "    " + l).join("\n")}` },
    { title: "R1# show running-config interface gi0/0", text: `interface GigabitEthernet0/0\n ip address 10.1.0.1 255.255.0.0\n ip access-group WEB-IN in` },
  ];
  const label = (action: string, line: number | null) => (line === null ? "Denied by the implicit deny at the end" : `${action === "permit" ? "Permitted" : "Denied"} by line ${(line + 1) * 10}`);
  const answer = label(v.action, v.line);
  const options = [...acl.map((e, i) => label(e.action, i)), label("deny", null)];
  if (ask === "verdict") {
    const verdict = v.action === "permit" ? "Permitted" : "Denied";
    return scenario(b, seed, r, ex, {
      type: "SECURITY",
      prompt: `A ${what} arrives on Gi0/0 inbound. Which result and line applies?`,
      answer,
      wrong: options.filter((o) => o !== answer),
      explain: `ACLs are read top-down and the first matching line decides. ${v.line === null ? "No line matches, so the implicit deny any any drops it." : `Line ${(v.line + 1) * 10} is the first match, so the packet is ${verdict.toLowerCase()}; lower lines are never checked.`}`,
    });
  }
  const verdict = v.action === "permit" ? "forwarded" : "dropped";
  return scenario(b, seed, r, ex, {
    type: "SECURITY",
    difficulty: 3,
    prompt: `A ${what} arrives on Gi0/0 inbound. Is it forwarded or dropped, and why?`,
    answer: `${verdict === "forwarded" ? "Forwarded" : "Dropped"}: ${label(v.action, v.line).toLowerCase()}`,
    wrong: [
      ...options.filter((o) => o !== answer).map((o) => `${v.action === "permit" ? "Dropped" : "Forwarded"}: ${o.toLowerCase()}`),
      ...options.filter((o) => o !== answer).map((o) => `${verdict === "forwarded" ? "Forwarded" : "Dropped"}: ${o.toLowerCase()}`),
    ].filter((o) => o !== `${verdict === "forwarded" ? "Forwarded" : "Dropped"}: ${answer.toLowerCase()}`),
    explain: `First match wins, top to bottom. ${v.line === null ? "Nothing matches, so the implicit deny drops the packet." : `Line ${(v.line + 1) * 10} matches first and is a ${v.action}.`}`,
  });
}

const aclVerdict = def("acl-verdict", "What does this ACL do?", (b, seed, r) => aclScenario(b, seed, r, "verdict"));
const aclForward = def("acl-forward", "Forwarded or dropped?", (b, seed, r) => aclScenario(b, seed, r, "line"));

const aclKind = def("acl-kind", "Which ACL, and where?", (b, seed, r) => {
  const n = pick(r, [5, 42, 99, 101, 150, 199, 1350, 2100]);
  const kind = aclKindOfNumber(n)!;
  const line = kind === "standard" ? `access-list ${n} deny 10.4.0.0 0.0.255.255` : `access-list ${n} deny tcp 10.4.0.0 0.0.255.255 any eq 23`;
  const near = placement(kind);
  const label = (k: string, p: string) => `${k[0].toUpperCase()}${k.slice(1)} ACL, best applied close to the ${p}`;
  return scenario(b, seed, r, [{ title: "R2# show running-config | include access-list", text: line }], {
    type: "SECURITY",
    prompt: "What kind of ACL is this, and where should it normally be applied?",
    answer: label(kind, near),
    wrong: [label(kind, near === "source" ? "destination" : "source"), label(kind === "standard" ? "extended" : "standard", placement(kind)), label(kind === "standard" ? "extended" : "standard", near === "source" ? "destination" : "source")],
    explain: `Numbers 1–99 and 1300–1999 are standard (source address only); 100–199 and 2000–2699 are extended. Because a standard ACL can't say where the traffic is going, put it near the destination; put an extended ACL near the source so unwanted traffic dies early.`,
  });
});

const hostSources: RouteSource[] = ["ospf", "eigrp", "rip", "static"];

const routeNextHop = def("route-nexthop", "Next hop for a destination", (b, seed, r) => {
  const o = 10;
  const routes: Route[] = [
    route("0.0.0.0/0", "static", 0, { nextHop: "203.0.113.1" }),
    route(`${o}.1.0.0/16`, "ospf", 20, { nextHop: "10.255.0.2" }),
    route(`${o}.1.4.0/22`, "eigrp", 3072, { nextHop: "10.255.1.2" }),
    route(`${o}.1.4.128/25`, "rip", 2, { nextHop: "10.255.2.2" }),
    route(`${o}.1.7.0/24`, "ebgp", 0, { nextHop: "10.255.3.2" }),
  ];
  const dests = [`${o}.1.4.200`, `${o}.1.5.9`, `${o}.1.7.50`, `${o}.1.200.3`, `${o}.9.9.9`, `${o}.1.4.20`];
  const dest = pick(r, dests);
  const sel = selectRoute(routes, dest)!;
  const hops = [...new Set(routes.map((x) => x.nextHop!))];
  return scenario(b, seed, r, [{ title: "R1# show ip route", text: routes.map((x) => showRouteLine(x)).join("\n") }], {
    type: "NETWORK",
    prompt: `R1 receives a packet for ${dest}. Which next hop does it use?`,
    answer: sel.nextHop!,
    wrong: hops.filter((h) => h !== sel.nextHop),
    explain: `The longest matching prefix wins before administrative distance or metric is even considered. ${dest} matches ${formatCidr(sel.prefix)}, the most specific route that contains it, so the next hop is ${sel.nextHop}.`,
  });
});

const routeSource = def("route-source", "Which route is installed?", (b, seed, r) => {
  const srcs = shuffled(r, hostSources).slice(0, 3);
  const prefix = `192.168.${randInt(r, 10, 99)}.0/24`;
  const routes = srcs.map((s, i) => route(prefix, s, randInt(r, 1, 30) * 10 + i, { nextHop: `10.0.${i + 1}.2` }));
  const best = installedFor(routes, prefix)!;
  const name = (x: Route) => `${x.source.toUpperCase()} (${ROUTE_CODE[x.source]}), via ${x.nextHop}`;
  return scenario(b, seed, r, [
    {
      title: `R1 knows ${prefix} from three sources`,
      text: routes.map((x) => `${ROUTE_CODE[x.source].padEnd(2)} ${prefix} [AD ${x.ad} / metric ${x.metric}] via ${x.nextHop}`).join("\n"),
    },
  ], {
    type: "NETWORK",
    prompt: "All three are for the same prefix. Which one does R1 install in its routing table?",
    answer: name(best),
    wrong: routes.filter((x) => x !== best).map(name).concat("All of them: IOS load-balances across protocols"),
    explain: `With the same prefix length, the lowest administrative distance wins (${routes.map((x) => `${x.source} ${ADMIN_DISTANCE[x.source]}`).join(", ")}); metrics from different protocols are never compared. ${best.source.toUpperCase()} has AD ${best.ad}.`,
  });
});

const ospfDr = def("ospf-dr", "Who is the DR?", (b, seed, r) => {
  for (;;) {
    const routers = Array.from({ length: 4 }, (_, i) => ({
      name: `R${i + 1}`,
      routerId: `${i + 1}.${randInt(r, 1, 254)}.${randInt(r, 1, 254)}.${randInt(r, 1, 254)}`,
      priority: pick(r, [0, 1, 1, 1, 10, 100, 100]),
    }));
    const { dr, bdr } = electDr(routers);
    if (!dr || !bdr) continue;
    return scenario(b, seed, r, [
      {
        title: "Multi-access segment (all routers powered on together)",
        text: `Router  Router ID          Priority\n${routers.map((x) => `${x.name.padEnd(7)} ${x.routerId.padEnd(18)} ${x.priority}`).join("\n")}`,
      },
    ], {
      type: "NETWORK",
      prompt: "The routers boot together on one Ethernet segment. Which router becomes the DR?",
      answer: dr.name,
      wrong: routers.filter((x) => x !== dr).map((x) => x.name),
      explain: `Highest OSPF priority wins, then highest router ID; priority 0 can never be DR or BDR. ${dr.name} wins (priority ${dr.priority}, ID ${dr.routerId}) and ${bdr.name} becomes BDR.`,
    });
  }
});

const ospfCostPath = def("ospf-cost", "Total OSPF cost", (b, seed, r) => {
  const ref = pick(r, [100, 1000]);
  const speeds = [10, 100, 1000];
  const hops = Array.from({ length: 3 }, (_, i) => ({ name: `R${i + 1} → R${i + 2}`, mbps: pick(r, speeds) }));
  const costs = hops.map((h) => ospfCost(h.mbps, ref));
  const total = pathCost(costs);
  const defaultTotal = pathCost(hops.map((h) => ospfCost(h.mbps)));
  const wrong = new Set<number>([defaultTotal, total + 1, total - 1, Math.max(...costs), total * 2, total + 10]);
  wrong.delete(total);
  return scenario(b, seed, r, [
    { title: "R1# show running-config | section ospf", text: `router ospf 1\n${ref === 100 ? "" : ` auto-cost reference-bandwidth ${ref}\n`} network 0.0.0.0 255.255.255.255 area 0` },
    { title: "Links on the path from R1 to R4's LAN (outgoing interface speeds)", text: hops.map((h) => `${h.name}   ${h.mbps} Mbps`).join("\n") },
  ], {
    type: "NETWORK",
    difficulty: 3,
    prompt: "What is R1's OSPF metric to R4's LAN, ignoring the LAN's own interface cost?",
    answer: String(total),
    wrong: [...wrong].filter((n) => n > 0).map(String).concat(["7", "8", "9"]),
    explain: `Cost = reference bandwidth / interface bandwidth (${ref} Mbps${ref === 100 ? ", the default" : ", set by auto-cost"}), minimum 1, summed over the outgoing interfaces: ${costs.join(" + ")} = ${total}.`,
  });
});

// ---------------------------------------------------------------- IP basics

const hostFaults: Record<HostFault, string> = {
  "invalid-address": "The host IP is the network or broadcast address of its subnet",
  "gateway-off-subnet": "The default gateway is not in the host's own subnet",
  "gateway-not-router": "The default gateway is in the subnet but is not the router's address",
  ok: "Nothing is wrong with the IP settings",
};

const pingFails = def("ping-fails", "Why is the ping failing?", (b, seed, r) => {
  const third = randInt(r, 1, 200);
  const prefix = pick(r, [24, 26, 27]);
  const net = parseCidr(`192.168.${third}.0/${prefix}`);
  const router = formatIp(net.network + 1);
  const fault = pick<HostFault>(r, ["invalid-address", "gateway-off-subnet", "gateway-not-router"]);
  const size = 2 ** (32 - prefix);
  const host: Record<HostFault, { ip: string; gateway: string }> = {
    "invalid-address": { ip: formatIp(net.network + size - 1), gateway: router },
    "gateway-off-subnet": { ip: formatIp(net.network + randInt(r, 10, size - 2)), gateway: formatIp(net.network + size + 1) },
    "gateway-not-router": { ip: formatIp(net.network + randInt(r, 10, size - 2)), gateway: formatIp(net.network + randInt(r, 5, 9)) },
    ok: { ip: "", gateway: "" },
  };
  const cfg = { ...host[fault], prefix };
  const found = diagnoseHost(cfg, router);
  return scenario(b, seed, r, [
    { title: "PC1> show ip", text: `IP/MASK     : ${cfg.ip}/${prefix} (${formatIp(maskOf(prefix))})\nGATEWAY     : ${cfg.gateway}` },
    { title: "R1# show ip interface brief", text: `Interface        IP-Address       Status  Protocol\nGigabitEthernet0/0  ${router}  up      up` },
    { title: "PC1> ping 10.99.0.5", text: "host (" + cfg.gateway + ") not reachable" },
  ], {
    type: "NETWORK",
    prompt: "PC1 can't reach anything off its LAN. What is wrong?",
    answer: hostFaults[found],
    wrong: Object.values(hostFaults).filter((t) => t !== hostFaults[found]),
    explain:
      found === "invalid-address"
        ? `With a /${prefix} mask the last address ${cfg.ip} is the subnet's broadcast address, which can't be assigned to a host.`
        : found === "gateway-off-subnet"
          ? `A host only ARPs for addresses in its own subnet. ${cfg.gateway} is outside ${formatCidr(net)}, so PC1 can't even deliver frames to its gateway.`
          : `${cfg.gateway} is inside the subnet, so PC1 ARPs for it, but the router's interface is ${router}; nobody answers.`,
  });
});

const dhcpPool = def("dhcp-pool", "DHCP pool size", (b, seed, r) => {
  const prefix = pick(r, [24, 25, 26, 27]);
  const third = randInt(r, 0, 250);
  const net = parseCidr(`192.168.${third}.0/${prefix}`);
  const exLast = randInt(r, 5, 20);
  const excluded = exLast;
  const addrs = usableHosts(prefix) - excluded;
  return scenario(b, seed, r, [
    {
      title: "R1# show running-config | section dhcp",
      text: `ip dhcp excluded-address ${formatIp(net.network + 1)} ${formatIp(net.network + exLast)}\nip dhcp pool LAN\n network ${formatIp(net.network)} ${formatIp(maskOf(prefix))}\n default-router ${formatIp(net.network + 1)}\n dns-server 8.8.8.8`,
    },
  ], {
    type: "APPLICATION",
    prompt: "At most how many clients can lease an address from this pool?",
    answer: String(addrs),
    wrong: [String(usableHosts(prefix)), String(addrs + 1), String(addrs - 1), String(usableHosts(prefix) + 2)],
    explain: `A /${prefix} has ${usableHosts(prefix)} usable addresses (2^${32 - prefix} − 2). The excluded range ${formatIp(net.network + 1)}–${formatIp(net.network + exLast)} removes ${excluded}, leaving ${addrs}.`,
  });
});

const eui64 = def("ipv6-linklocal", "IPv6 link-local from the MAC", (b, seed, r) => {
  const bytes = Array.from({ length: 6 }, () => randInt(r, 0, 255));
  bytes[0] &= 0xfc;
  const mac = bytes.map((x) => x.toString(16).padStart(2, "0")).join(":");
  const answer = linkLocalFromMac(mac);
  const flipped = linkLocalFromMac([(bytes[0] ^ 0x02).toString(16).padStart(2, "0"), ...mac.split(":").slice(1)].join(":"));
  const swapped = linkLocalFromMac([bytes[0], bytes[1], bytes[2] ^ 0x10, bytes[3], bytes[4], bytes[5]].map((x) => x.toString(16).padStart(2, "0")).join(":"));
  const tail = linkLocalFromMac([bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5] ^ 0x01].map((x) => x.toString(16).padStart(2, "0")).join(":"));
  const dotted = macDots(mac.replaceAll(":", ""));
  return scenario(b, seed, r, [
    { title: "R1# show interfaces gi0/0 | include address", text: `  Hardware is CN Gigabit Ethernet, address is ${dotted} (bia ${dotted})` },
    { title: "R1# show running-config interface gi0/0", text: `interface GigabitEthernet0/0\n ipv6 enable` },
  ], {
    type: "NETWORK",
    prompt: "R1 builds its link-local address with modified EUI-64. Which address does show ipv6 interface display?",
    answer,
    wrong: [flipped, swapped, tail],
    explain: `Split the MAC in half, insert FF:FE, and flip the 7th bit (universal/local) of the first byte; then prefix fe80::/64. ${mac} → ${answer}.`,
  });
});

export const LAB_BUILDERS: readonly LabBuilder[] = [
  stpRoot,
  stpBlocked,
  trunkAllowed,
  portSecurity,
  etherChannel,
  aclVerdict,
  aclForward,
  aclKind,
  routeNextHop,
  routeSource,
  ospfDr,
  ospfCostPath,
  pingFails,
  dhcpPool,
  eui64,
];

/** A seeded run of scenarios, one per builder in shuffled order. */
export function labDeck(seed: number): LabScenario[] {
  const r = rng(seed);
  return shuffled(r, LAB_BUILDERS).map((b, i) => b.build(seed * 31 + i + 1));
}
