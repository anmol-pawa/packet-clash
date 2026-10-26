/**
 * CCNA 4.6 IP services: NAT address terms and dynamic pools, syslog severity,
 * DSCP values and HSRP election / virtual MACs.
 */
import { parseIp } from "./ipv4";

export interface NatEntry {
  insideLocal: string;
  insideGlobal: string;
  outsideLocal: string;
  outsideGlobal: string;
}

/** The four NAT address terms for an inside host talking to an outside host (no outside NAT, source port kept). */
export function natEntry(insideIp: string, srcPort: number, globalIp: string, outsideIp: string, dstPort: number): NatEntry {
  return {
    insideLocal: `${insideIp}:${srcPort}`,
    insideGlobal: `${globalIp}:${srcPort}`,
    outsideLocal: `${outsideIp}:${dstPort}`,
    outsideGlobal: `${outsideIp}:${dstPort}`,
  };
}

/** Number of addresses in a dynamic NAT pool `start`–`end` inclusive. */
export function natPoolSize(start: string, end: string): number {
  const n = parseIp(end) - parseIp(start) + 1;
  if (n < 1) throw new Error("pool end is before its start");
  return n;
}

/** Dynamic NAT (no overload) gives each concurrent inside host one pool address; the rest are denied. */
export function dynamicNatDenied(poolSize: number, hosts: number): number {
  return Math.max(0, hosts - poolSize);
}

export const SYSLOG_LEVELS = ["Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Informational", "Debugging"] as const;

/** `logging trap N` sends every message whose severity number is N or lower (more severe). */
export function syslogSent(trapLevel: number, severity: number): boolean {
  return severity <= trapLevel;
}

/** AFxy: class x (1–4), drop precedence y (1–3) → DSCP 8x + 2y. */
export function afDscp(cls: number, drop: number): number {
  if (cls < 1 || cls > 4 || drop < 1 || drop > 3) throw new Error("AF class 1-4, drop 1-3");
  return 8 * cls + 2 * drop;
}
export const EF_DSCP = 46;
export const csDscp = (n: number): number => 8 * n;
/** DSCP occupies the top six bits of the old ToS byte. */
export const tosByte = (dscp: number): number => dscp << 2;

export interface HsrpRouter {
  name: string;
  priority: number;
  ip: string;
}

/** Routers that come up together: highest priority wins, ties go to the highest interface IP. */
export function hsrpActive(routers: readonly HsrpRouter[]): HsrpRouter {
  return [...routers].sort((a, b) => b.priority - a.priority || parseIp(b.ip) - parseIp(a.ip))[0];
}

/** Without `preempt`, a router that comes back with a higher priority stays standby. */
export function hsrpAfterRecovery(current: HsrpRouter, recovered: HsrpRouter, preempt: boolean): HsrpRouter {
  return preempt && recovered.priority > current.priority ? recovered : current;
}

/** HSRP version 1: 0000.0C07.ACxx (xx = group in hex); version 2: 0000.0C9F.Fxxx (xxx = group, 12 bits). */
export function hsrpVirtualMac(group: number, version: 1 | 2): string {
  if (version === 1) {
    if (group < 0 || group > 255) throw new Error("HSRPv1 groups are 0-255");
    return `0000.0c07.ac${group.toString(16).padStart(2, "0")}`;
  }
  if (group < 0 || group > 4095) throw new Error("HSRPv2 groups are 0-4095");
  return `0000.0c9f.f${group.toString(16).padStart(3, "0")}`;
}

/** VRRP: 0000.5E00.01xx where xx is the VRID in hex. */
export function vrrpVirtualMac(vrid: number): string {
  return `0000.5e00.01${vrid.toString(16).padStart(2, "0")}`;
}
