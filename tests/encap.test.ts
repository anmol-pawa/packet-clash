import { describe, expect, it } from "vitest";
import { CHIP_H, bitSprite, chipSprite, tagSprite } from "@/game/art/headers";
import { MICRO, MICRO_H, microRows, microWidth } from "@/game/art/microFont";
import { HTTP_REQUEST, addedBlocks, decapsulate, encapsulate, totalBytes } from "@/game/engine/encap";
import { TYPES, type PacketType } from "@/game/engine/types";
import { parseSprite } from "@/lib/pixel";

const labels = (t: PacketType, i = -1) => encapsulate(t).at(i)!.blocks.map((b) => b.label);

describe("encapsulation", () => {
  it("adds one layer's header per step, top-down, ending as bits on the wire", () => {
    expect(encapsulate("APPLICATION").map((s) => s.pdu)).toEqual(["message", "segment", "packet", "frame", "bits"]);
    expect(encapsulate("SECURITY").map((s) => s.pdu)).toEqual(["record", "segment", "packet", "frame", "bits"]);
    expect(encapsulate("TRANSPORT").map((s) => s.pdu)).toEqual(["segment", "packet", "frame", "bits"]);
    expect(encapsulate("NETWORK").map((s) => s.pdu)).toEqual(["packet", "frame", "bits"]);
    expect(encapsulate("LINK").map((s) => s.pdu)).toEqual(["frame", "bits"]);
    expect(encapsulate("PHYSICAL").map((s) => s.pdu)).toEqual(["bits"]);
  });

  it("puts headers in wire order, with Ethernet's FCS as a trailer", () => {
    expect(labels("APPLICATION")).toEqual(["PRE", "ETH", "IP", "TCP", "HTTP", "FCS"]);
    expect(labels("SECURITY")).toEqual(["PRE", "ETH", "IP", "TCP", "TLS", "DATA", "FCS"]);
    expect(labels("TRANSPORT", 2)).toEqual(["ETH", "IP", "TCP", "DATA", "FCS"]);
    expect(labels("NETWORK", 0)).toEqual(["IP", "ICMP"]);
    expect(labels("PHYSICAL")).toEqual(["PRE"]);
  });

  it("has every step wrap the one before it intact", () => {
    for (const t of TYPES) {
      const steps = encapsulate(t);
      for (let i = 1; i < steps.length; i++) {
        const { before, after } = addedBlocks(steps[i - 1], steps[i]);
        expect(before.length + after.length).toBeGreaterThan(0);
        // each step adds headers of exactly one layer
        expect(new Set([...before, ...after].map((b) => b.layer)).size).toBe(1);
        expect([...before, ...after].every((b) => b.layer === steps[i].layer)).toBe(true);
        expect(before.every((b) => b.kind === "header")).toBe(true);
      }
    }
  });

  it("uses real header sizes: TCP/IPv4/Ethernet costs 58 bytes per frame", () => {
    const [seg, pkt, frame, bits] = encapsulate("TRANSPORT");
    expect(totalBytes(pkt) - totalBytes(seg)).toBe(20); // IPv4, no options
    expect(totalBytes(frame) - totalBytes(seg)).toBe(20 + 14 + 4);
    expect(totalBytes(frame) - totalBytes(seg) + 20).toBe(58); // with the TCP header
    expect(totalBytes(bits) - totalBytes(frame)).toBe(8); // 7-byte preamble + SFD
    expect(totalBytes(seg)).toBe(20 + 32);
  });

  it("pads a short payload so the frame meets Ethernet's 64-byte minimum", () => {
    const [frame] = encapsulate("LINK");
    expect(frame.blocks.map((b) => [b.label, b.bytes])).toEqual([["ETH", 14], ["ARP", 28], ["PAD", 18], ["FCS", 4]]);
    expect(totalBytes(frame)).toBe(64);
    // a long enough payload needs no padding
    for (const t of ["NETWORK", "TRANSPORT", "APPLICATION", "SECURITY"] as const) {
      const f = encapsulate(t).find((s) => s.pdu === "frame")!;
      expect(f.blocks.some((b) => b.label === "PAD")).toBe(false);
      expect(totalBytes(f)).toBeGreaterThanOrEqual(64);
    }
  });

  it("sizes the HTTP message and the TLS record from their contents", () => {
    expect(HTTP_REQUEST.length).toBe(29);
    expect(totalBytes(encapsulate("APPLICATION")[0])).toBe(29);
    expect(totalBytes(encapsulate("SECURITY")[0])).toBe(5 + 32);
    expect(totalBytes(encapsulate("NETWORK")[0])).toBe(20 + 8 + 32);
  });

  it("decapsulates in reverse, ending at the move's own PDU", () => {
    for (const t of TYPES) {
      const up = decapsulate(t);
      expect(up[0].pdu).toBe("bits");
      expect(up.at(-1)).toEqual(encapsulate(t)[0]);
      expect(up.at(-1)!.layer).toBe(t);
    }
  });

  it("rejects a PDU that isn't inside another", () => {
    expect(() => addedBlocks(encapsulate("LINK")[0], encapsulate("TRANSPORT")[0])).toThrow();
  });
});

describe("header chip art", () => {
  it("has a 3×5 glyph for every letter and digit", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
      expect(MICRO[ch], ch).toHaveLength(MICRO_H);
      expect(MICRO[ch].every((r) => /^[#.]{3}$/.test(r)), ch).toBe(true);
    }
    expect(new Set(Object.values(MICRO).map((g) => g.join())).size).toBeGreaterThan(30);
    expect(microRows("IP", "x")[0]).toBe("xxx.xxx");
    expect(microWidth("TCP")).toBe(11);
    expect(() => microRows("?", "x")).toThrow();
  });

  it("draws a valid chip for every block, PDU tag and bit", () => {
    for (const t of TYPES) {
      for (const step of encapsulate(t)) {
        for (const b of step.blocks) {
          const g = parseSprite(chipSprite(b));
          expect(g.height).toBe(CHIP_H);
          expect(g.width).toBe(microWidth(b.label) + 6);
        }
        expect(parseSprite(tagSprite(step.pdu.toUpperCase(), step.layer)).height).toBe(9);
      }
    }
    expect(parseSprite(bitSprite(0)).width).toBe(9);
    // headers and payloads look different, and the same block reuses its sprite
    const [ip, icmp] = encapsulate("NETWORK")[0].blocks;
    expect(chipSprite(ip).palette.b).not.toBe(chipSprite(icmp).palette.b);
    expect(chipSprite({ ...ip })).toBe(chipSprite(ip));
  });
});
