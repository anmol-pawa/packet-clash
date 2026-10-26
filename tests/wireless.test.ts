import { describe, expect, it } from "vitest";
import { WIRELESS_BANK } from "@/content/questions/wirelessBank";
import { WIRELESS_GENERATORS, channelFreqGen, channelOverlapGen, portGen } from "@/content/questions/wirelessGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { channel24Freq, channelsOverlap24, maxNonOverlapping24, portOf, standardsInBand } from "@/lib/net/wireless";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 11);

describe("wireless solver", () => {
  it("computes centre frequencies", () => {
    expect(channel24Freq(1)).toBe(2412);
    expect(channel24Freq(6)).toBe(2437);
    expect(channel24Freq(11)).toBe(2462);
    expect(channel24Freq(13)).toBe(2472);
    expect(channel24Freq(14)).toBe(2484);
    expect(() => channel24Freq(0)).toThrow();
  });
  it("finds the classic 1/6/11 plan", () => {
    expect(channelsOverlap24(1, 6)).toBe(false);
    expect(channelsOverlap24(6, 11)).toBe(false);
    expect(channelsOverlap24(1, 5)).toBe(true);
    expect(channelsOverlap24(3, 3)).toBe(true);
    expect(maxNonOverlapping24(11)).toBe(3);
    expect(maxNonOverlapping24(13)).toBe(3);
  });
  it("lists standards per band", () => {
    expect(standardsInBand("5 GHz")).toEqual(["802.11a", "802.11n", "802.11ac", "802.11ax"]);
    expect(standardsInBand("2.4 GHz")).toEqual(["802.11b", "802.11g", "802.11n", "802.11ax"]);
  });
  it("knows well-known ports", () => {
    expect(portOf("RADIUS authentication")).toBe("UDP 1812");
    expect(portOf("TACACS+")).toBe("TCP 49");
    expect(portOf("IKE (ISAKMP)")).toBe("UDP 500");
    expect(() => portOf("nope")).toThrow();
  });
});

describe("wireless cards and generators", () => {
  it("pin every card answer", () => {
    const expected: Record<string, string> = {
      "wlan-24-channels": "1, 6 and 11",
      "wlan-5ghz": "More non-overlapping channels and less interference, at the cost of shorter range",
      "wlan-standards": "802.11ac",
      "wlan-ssid-bssid": "The SSID is the network name; the BSSID is the MAC address of one access point radio",
      "wlan-ap-modes": "A lightweight AP is configured and managed by a wireless LAN controller; an autonomous AP is configured on its own",
      "wlan-capwap": "CAPWAP",
      "wlan-wpa": "WPA3",
      "wlan-wpa2-cipher": "AES with CCMP",
      "wlan-8021x": "Supplicant (client), authenticator (AP or switch) and authentication server (RADIUS)",
      "sec-aaa": "Authentication, authorization and accounting",
      "sec-radius-tacacs": "TACACS+ uses TCP, separates the three A functions and encrypts the entire body; RADIUS uses UDP and encrypts only the password",
      "sec-threats": "Denial of service (SYN flood)",
      "sec-vpn-types": "Site-to-site VPN",
      "sec-ipsec-modes": "Transport mode protects only the payload and keeps the original IP header; tunnel mode encapsulates the whole original packet in a new IP header",
      "sec-ike": "Phase 1 builds a secure management channel (the IKE SA); phase 2 negotiates the IPsec SAs that protect the data",
      "sec-esp-ah": "ESP",
      "sec-ssh-telnet": "SSH encrypts the session, while Telnet sends everything, including passwords, in clear text",
      "sec-enable-secret": "enable secret",
      "sec-hardening": "Shut it down and move it to an unused VLAN",
      "sec-dos-l2": "A rogue DHCP server handing out bad gateway and DNS information",
      "sec-ports": "UDP 1812",
      "wlan-roaming": "It reassociates with the new AP (BSSID) while the SSID and subnet stay the same",
    };
    expect(WIRELESS_BANK.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of WIRELESS_BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
    for (const q of WIRELESS_BANK) {
      expect(grade(q, correctResponse(q)), q.id).toBe(true);
      expect(new Set((q as McqQuestion).choices).size, q.id).toBe(4);
    }
  });

  it("are registered", () => {
    for (const g of WIRELESS_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("overlap answer is re-solved from the prompt", () => {
    for (const s of seeds) {
      const q = channelOverlapGen.generate(s) as McqQuestion;
      const ch = Number(/channel (\d+) \(/.exec(q.prompt)![1]);
      const flags = q.choices.map((c) => channelsOverlap24(ch, Number(c.replace("Channel ", ""))));
      flags.forEach((overlaps, i) => expect(overlaps, q.prompt).toBe(i !== q.answer ? true : false));
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("frequency answer is re-solved from the channel", () => {
    for (const s of seeds) {
      const q = channelFreqGen.generate(s) as NumericQuestion;
      expect(q.answer).toBe(2407 + 5 * Number(/channel (\d+)\?/.exec(q.prompt)![1]));
    }
  });

  it("port answer is re-solved from the protocol", () => {
    for (const s of seeds) {
      const q = portGen.generate(s) as McqQuestion;
      const proto = /does (.+) use\?/.exec(q.prompt)![1];
      expect(q.choices[q.answer]).toBe(portOf(proto));
      expect(new Set(q.choices).size).toBe(4);
    }
  });
});
