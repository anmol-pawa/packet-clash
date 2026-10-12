import { describe, expect, it } from "vitest";
import { broadcastOf, contains, formatCidr, formatIp, hostRange, isPrivate, maskOf, overlaps, parseCidr, parseIp, usableHosts } from "@/lib/net/ipv4";

describe("IPv4 / CIDR helper", () => {
  it("parses and formats dotted quads", () => {
    expect(parseIp("192.168.1.10")).toBe(3232235786);
    expect(formatIp(3232235786)).toBe("192.168.1.10");
    expect(formatIp(parseIp("255.255.255.255"))).toBe("255.255.255.255");
    for (const bad of ["1.2.3", "1.2.3.256", "a.b.c.d", "1.2.3.4.5", ""]) expect(() => parseIp(bad)).toThrow();
  });

  it("builds masks", () => {
    expect(formatIp(maskOf(24))).toBe("255.255.255.0");
    expect(formatIp(maskOf(26))).toBe("255.255.255.192");
    expect(formatIp(maskOf(20))).toBe("255.255.240.0");
    expect(formatIp(maskOf(0))).toBe("0.0.0.0");
    expect(formatIp(maskOf(32))).toBe("255.255.255.255");
  });

  // Classic worked examples (e.g. Forouzan ch. 18, Kurose & Ross §4.3.3).
  it("finds network, broadcast and host range", () => {
    const a = parseCidr("192.168.10.77/26");
    expect(formatCidr(a)).toBe("192.168.10.64/26");
    expect(formatIp(broadcastOf(a))).toBe("192.168.10.127");
    expect(hostRange(a).map(formatIp)).toEqual(["192.168.10.65", "192.168.10.126"]);
    // Forouzan: 167.199.170.82/27 → first 167.199.170.64, last 167.199.170.95
    const f = parseCidr("167.199.170.82/27");
    expect(formatIp(f.network)).toBe("167.199.170.64");
    expect(formatIp(broadcastOf(f))).toBe("167.199.170.95");
    // Kurose & Ross: 223.1.17.0/24 style /20 block
    const k = parseCidr("200.23.16.0/20");
    expect(formatIp(broadcastOf(k))).toBe("200.23.31.255");
  });

  it("counts usable hosts", () => {
    expect(usableHosts(24)).toBe(254);
    expect(usableHosts(26)).toBe(62);
    expect(usableHosts(30)).toBe(2);
    expect(usableHosts(31)).toBe(2);
    expect(usableHosts(32)).toBe(1);
  });

  it("tests containment and overlap", () => {
    const big = parseCidr("10.0.0.0/16");
    expect(contains(big, parseIp("10.0.255.1"))).toBe(true);
    expect(contains(big, parseIp("10.1.0.1"))).toBe(false);
    expect(overlaps(big, parseCidr("10.0.4.0/24"))).toBe(true);
    expect(overlaps(parseCidr("10.0.4.0/24"), parseCidr("10.0.5.0/24"))).toBe(false);
    expect(overlaps(parseCidr("10.255.0.0/30"), parseCidr("10.255.0.4/30"))).toBe(false);
  });

  it("knows the RFC 1918 private ranges", () => {
    expect(isPrivate(parseIp("10.20.30.40"))).toBe(true);
    expect(isPrivate(parseIp("172.31.255.255"))).toBe(true);
    expect(isPrivate(parseIp("172.32.0.1"))).toBe(false);
    expect(isPrivate(parseIp("192.168.0.1"))).toBe(true);
    expect(isPrivate(parseIp("8.8.8.8"))).toBe(false);
  });
});
