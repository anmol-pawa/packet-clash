/**
 * CCNA 4.7 wireless and security: 2.4 GHz channel plan, 802.11 generations and
 * the well-known ports of AAA, tunnelling and management protocols.
 */

/** Centre frequency in MHz of a 2.4 GHz channel (1-13 are 5 MHz apart from 2412; channel 14 is the Japan-only 2484). */
export function channel24Freq(ch: number): number {
  if (ch === 14) return 2484;
  if (!Number.isInteger(ch) || ch < 1 || ch > 13) throw new Error("2.4 GHz channel 1-14");
  return 2407 + 5 * ch;
}

/** 2.4 GHz Wi-Fi channels are 22 MHz wide, so two channels overlap unless their centres are at least 22 MHz apart (5 channel numbers). */
export function channelsOverlap24(a: number, b: number): boolean {
  return Math.abs(channel24Freq(a) - channel24Freq(b)) < 22;
}

/** Most channels that can be used side by side without overlap in channels 1..max (1, 6, 11 for max 11-13). */
export function maxNonOverlapping24(maxChannel: number): number {
  return Math.floor((maxChannel - 1) / 5) + 1;
}

export interface Dot11 {
  amendment: string;
  wifi: string | null;
  bands: readonly string[];
  /** Theoretical maximum PHY rate quoted for the standard. */
  maxRate: string;
}

export const DOT11: readonly Dot11[] = [
  { amendment: "802.11b", wifi: null, bands: ["2.4 GHz"], maxRate: "11 Mbps" },
  { amendment: "802.11a", wifi: null, bands: ["5 GHz"], maxRate: "54 Mbps" },
  { amendment: "802.11g", wifi: null, bands: ["2.4 GHz"], maxRate: "54 Mbps" },
  { amendment: "802.11n", wifi: "Wi-Fi 4", bands: ["2.4 GHz", "5 GHz"], maxRate: "600 Mbps" },
  { amendment: "802.11ac", wifi: "Wi-Fi 5", bands: ["5 GHz"], maxRate: "6.9 Gbps" },
  { amendment: "802.11ax", wifi: "Wi-Fi 6", bands: ["2.4 GHz", "5 GHz"], maxRate: "9.6 Gbps" },
];

/** Standards that can run in the given band. */
export function standardsInBand(band: string): string[] {
  return DOT11.filter((d) => d.bands.includes(band)).map((d) => d.amendment);
}

export interface PortInfo {
  protocol: string;
  port: string;
  note: string;
}

export const WELL_KNOWN_PORTS: readonly PortInfo[] = [
  { protocol: "RADIUS authentication", port: "UDP 1812", note: "RADIUS combines authentication and authorization" },
  { protocol: "RADIUS accounting", port: "UDP 1813", note: "accounting is a separate port" },
  { protocol: "TACACS+", port: "TCP 49", note: "TACACS+ separates authentication, authorization and accounting and encrypts the whole body" },
  { protocol: "IKE (ISAKMP)", port: "UDP 500", note: "IPsec key negotiation" },
  { protocol: "IPsec NAT traversal", port: "UDP 4500", note: "ESP wrapped in UDP so it survives NAT" },
  { protocol: "CAPWAP control", port: "UDP 5246", note: "access point to wireless LAN controller control tunnel" },
  { protocol: "CAPWAP data", port: "UDP 5247", note: "client traffic tunnel from the AP to the controller" },
  { protocol: "SSH", port: "TCP 22", note: "encrypted remote CLI" },
  { protocol: "Telnet", port: "TCP 23", note: "clear-text remote CLI" },
];

export function portOf(protocol: string): string {
  const p = WELL_KNOWN_PORTS.find((x) => x.protocol === protocol);
  if (!p) throw new Error(`unknown protocol ${protocol}`);
  return p.port;
}
