/**
 * Small checkers the CCNA lab scenarios (4.9) need on top of the other
 * solvers: host configuration faults, VLAN lists on a trunk and the reason an
 * EtherChannel fails to form. Pure, so the scenarios and tests share them.
 */
import { contains, maskOf, parseCidr, parseIp } from "./ipv4";
import { etherChannelForms, type EtherChannelMode } from "./stp";

export type HostFault = "invalid-address" | "gateway-off-subnet" | "gateway-not-router" | "ok";

export interface HostConfig {
  ip: string;
  prefix: number;
  gateway: string;
}

/** The first thing wrong with a host's IP settings, given the router interface it should use as gateway. */
export function diagnoseHost(h: HostConfig, routerIp: string): HostFault {
  const net = parseCidr(`${h.ip}/${h.prefix}`);
  const ip = parseIp(h.ip);
  const broadcast = (net.network | (~maskOf(h.prefix) >>> 0)) >>> 0;
  if (h.prefix < 31 && (ip === net.network || ip === broadcast)) return "invalid-address";
  if (!contains(net, parseIp(h.gateway))) return "gateway-off-subnet";
  if (parseIp(h.gateway) !== parseIp(routerIp)) return "gateway-not-router";
  return "ok";
}

/** Expands an IOS VLAN list such as "10-12,30" into numbers. */
export function parseVlanList(list: string): number[] {
  const out: number[] = [];
  for (const part of list.split(",")) {
    const m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!m) throw new Error(`bad VLAN list: ${list}`);
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (to < from) throw new Error(`bad VLAN range: ${part}`);
    for (let v = from; v <= to; v++) out.push(v);
  }
  return out;
}

export type ChannelOutcome = "forms" | "protocol-mismatch" | "nobody-initiates" | "on-needs-on";

/** Why a pair of EtherChannel modes does or doesn't bundle. */
export function etherChannelOutcome(a: EtherChannelMode, b: EtherChannelMode): ChannelOutcome {
  const lacp = (m: EtherChannelMode) => m === "active" || m === "passive";
  const pagp = (m: EtherChannelMode) => m === "desirable" || m === "auto";
  let out: ChannelOutcome;
  if (a === "on" || b === "on") out = a === b ? "forms" : "on-needs-on";
  else if ((lacp(a) && pagp(b)) || (pagp(a) && lacp(b))) out = "protocol-mismatch";
  else out = (a === "active" || a === "desirable" || b === "active" || b === "desirable") ? "forms" : "nobody-initiates";
  if ((out === "forms") !== etherChannelForms(a, b)) throw new Error("etherChannelOutcome disagrees with etherChannelForms");
  return out;
}
