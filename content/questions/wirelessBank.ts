/**
 * CCNA 4.7, wireless and security fundamentals: 802.11 channels and standards,
 * WLC/CAPWAP, WPA2/WPA3 and 802.1X, AAA, VPNs/IPsec and device hardening.
 * Every answer is pinned in tests/wireless.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "ccna", type: "NETWORK", difficulty, prompt, choices, answer: slot, explain };
}

export const WIRELESS_BANK: readonly Question[] = [
  card("wlan-24-channels", 1, 0, "Which three 2.4 GHz channels (US) do not overlap with each other?", "1, 6 and 11", ["1, 5 and 9", "2, 7 and 12", "3, 6 and 9"],
    "2.4 GHz channels are 22 MHz wide but only 5 MHz apart, so channels need to be five numbers apart to avoid overlap: 1, 6, 11 is the classic plan."),
  card("wlan-5ghz", 1, 2, "Compared with 2.4 GHz, what is a typical advantage of the 5 GHz band?", "More non-overlapping channels and less interference, at the cost of shorter range", ["Better wall penetration and longer range", "Only three channels, so planning is easier", "It is shared with microwave ovens and Bluetooth"],
    "Higher frequencies attenuate faster, so range is shorter, but 5 GHz offers many more non-overlapping channels and is less crowded than 2.4 GHz."),
  card("wlan-standards", 2, 3, "Which 802.11 standard (Wi-Fi 5) works only in the 5 GHz band?", "802.11ac", ["802.11n", "802.11g", "802.11ax"],
    "802.11ac is 5 GHz only. 802.11n (Wi-Fi 4) and 802.11ax (Wi-Fi 6) use both 2.4 and 5 GHz; 802.11b/g are 2.4 GHz and 802.11a is 5 GHz."),
  card("wlan-ssid-bssid", 2, 1, "What is the difference between an SSID and a BSSID?", "The SSID is the network name; the BSSID is the MAC address of one access point radio", ["The SSID is the AP's MAC address; the BSSID is the network name", "The SSID is per client; the BSSID is per channel", "They are the same value on every AP"],
    "Several APs can broadcast one SSID to form an ESS. Each radio has its own BSSID (its MAC), which is how a client tells them apart."),
  card("wlan-ap-modes", 2, 0, "What is the main difference between an autonomous AP and a lightweight AP?", "A lightweight AP is configured and managed by a wireless LAN controller; an autonomous AP is configured on its own", ["A lightweight AP has no radio", "An autonomous AP always uses WPA3", "A lightweight AP can only run at 2.4 GHz"],
    "Lightweight APs join a WLC (split-MAC architecture) and take their configuration and policy from it. Autonomous APs are standalone and each has its own config."),
  card("wlan-capwap", 3, 3, "Which protocol builds the tunnels between a lightweight AP and its WLC?", "CAPWAP", ["GRE over TCP 443", "IKE", "LACP"],
    "CAPWAP uses UDP 5246 for control and UDP 5247 for data between AP and controller."),
  card("wlan-wpa", 2, 1, "Which wireless security protocol replaces the PSK exchange with SAE and requires protected management frames?", "WPA3", ["WPA2-Personal", "WEP", "WPA"],
    "WPA3-Personal uses SAE (Simultaneous Authentication of Equals), which resists offline dictionary attacks that work against a captured WPA2 handshake. WPA2 uses AES-CCMP; WEP is broken."),
  card("wlan-wpa2-cipher", 2, 2, "Which encryption does WPA2 use?", "AES with CCMP", ["RC4 with a 24-bit IV (WEP)", "DES in ECB mode", "3DES with SHA-1"],
    "WEP and original WPA (TKIP) rely on RC4. WPA2 mandates AES-CCMP; WPA3 uses AES-GCMP in its stronger modes."),
  card("wlan-8021x", 3, 0, "In WPA2/WPA3-Enterprise, which three roles take part in 802.1X authentication?", "Supplicant (client), authenticator (AP or switch) and authentication server (RADIUS)", ["Client, router and DHCP server", "Initiator, responder and CA", "Master, slave and gateway"],
    "The supplicant sends EAP messages through the authenticator, which relays them to a RADIUS server that decides and tells the authenticator to open the port."),
  card("sec-aaa", 1, 1, "What do the three As in AAA stand for?", "Authentication, authorization and accounting", ["Access, audit and alerting", "Authentication, addressing and authorization", "Accounting, approval and auditing"],
    "Authentication proves who you are, authorization decides what you may do, accounting records what you did."),
  card("sec-radius-tacacs", 3, 3, "Which statement correctly compares RADIUS and TACACS+?", "TACACS+ uses TCP, separates the three A functions and encrypts the entire body; RADIUS uses UDP and encrypts only the password", ["RADIUS uses TCP 49; TACACS+ uses UDP 1812", "Both are Cisco proprietary and use UDP", "RADIUS separates authorization from authentication; TACACS+ does not"],
    "TACACS+ (TCP 49, Cisco) suits per-command device administration. RADIUS (UDP 1812/1813, open standard) combines authentication and authorization and is the usual choice for network access such as 802.1X."),
  card("sec-threats", 1, 2, "An attacker floods a server with half-open TCP connections so real users cannot connect. What kind of attack is this?", "Denial of service (SYN flood)", ["Man-in-the-middle", "Phishing", "Password spraying"],
    "A SYN flood exhausts the server's connection table. Mitigations include SYN cookies and rate limiting."),
  card("sec-vpn-types", 2, 0, "Which VPN type connects two whole offices permanently, with the tunnel set up by the routers or firewalls at each site?", "Site-to-site VPN", ["Remote-access VPN", "Clientless SSL portal", "Point-to-point serial link"],
    "Site-to-site VPNs (often IPsec) protect traffic between networks. Remote-access VPNs connect a single user's device, via a client or browser, to a network."),
  card("sec-ipsec-modes", 3, 1, "What is the difference between IPsec transport mode and tunnel mode?", "Transport mode protects only the payload and keeps the original IP header; tunnel mode encapsulates the whole original packet in a new IP header", ["Transport mode is used between sites, tunnel mode between hosts", "Tunnel mode only encrypts the IP header", "Transport mode uses IKE and tunnel mode does not"],
    "Tunnel mode (typical for site-to-site gateways) hides the original source and destination; transport mode is used host to host."),
  card("sec-ike", 3, 2, "What happens in IKE phase 1 and phase 2?", "Phase 1 builds a secure management channel (the IKE SA); phase 2 negotiates the IPsec SAs that protect the data", ["Phase 1 encrypts data; phase 2 authenticates users", "Phase 1 picks the tunnel route; phase 2 assigns IP addresses", "Phase 1 negotiates ESP; phase 2 negotiates AH"],
    "Phase 1 authenticates the peers and runs Diffie-Hellman over UDP 500 to protect phase 2. Phase 2 (quick mode) sets up the IPsec SAs using ESP or AH."),
  card("sec-esp-ah", 3, 3, "Which IPsec protocol provides confidentiality (encryption) as well as integrity?", "ESP", ["AH", "IKE", "GRE"],
    "ESP (IP protocol 50) encrypts and authenticates. AH (protocol 51) authenticates only and breaks when NAT changes the header."),
  card("sec-ssh-telnet", 1, 0, "Why should SSH be used instead of Telnet for remote device management?", "SSH encrypts the session, while Telnet sends everything, including passwords, in clear text", ["SSH is faster than Telnet", "Telnet needs a license", "SSH works without any IP address"],
    "Telnet is TCP 23 in clear text. SSH (TCP 22) encrypts. On Cisco IOS use `transport input ssh`, a domain name, and `crypto key generate rsa`."),
  card("sec-enable-secret", 2, 2, "Which stores the privileged-EXEC password with a hash rather than a reversible encoding?", "enable secret", ["enable password", "service password-encryption alone", "line vty password"],
    "`enable secret` stores a salted hash (type 5/8/9). `enable password` is clear text, and `service password-encryption` only applies weak type 7 reversible encoding to passwords in the config."),
  card("sec-hardening", 2, 1, "Which is a standard step when hardening an unused switch port?", "Shut it down and move it to an unused VLAN", ["Leave it up in VLAN 1 for later", "Enable DTP auto so it can negotiate", "Set it as the native VLAN"],
    "Unused ports should be administratively down, placed in a dead-end VLAN (not VLAN 1), and not left to negotiate trunking."),
  card("sec-dos-l2", 3, 0, "Which attack does DHCP snooping mainly prevent?", "A rogue DHCP server handing out bad gateway and DNS information", ["MAC flooding", "ARP storms from loops", "Telnet brute forcing"],
    "Snooping classifies ports as trusted or untrusted and drops DHCP server messages from untrusted ones. It builds the binding table that Dynamic ARP Inspection uses."),
  card("sec-ports", 2, 2, "Which port does RADIUS use for authentication requests?", "UDP 1812", ["TCP 49", "UDP 1645 only", "TCP 1812"],
    "Modern RADIUS uses UDP 1812 for authentication and 1813 for accounting (older implementations used 1645/1646)."),
  card("wlan-roaming", 2, 3, "A client moves between two APs that broadcast the same SSID in the same ESS. What keeps it connected?", "It reassociates with the new AP (BSSID) while the SSID and subnet stay the same", ["It must obtain a new SSID", "The first AP forwards all frames over STP", "The client disables its radio"],
    "Roaming is the client's decision, based on signal strength. Both APs must map the SSID to the same VLAN for the IP address to stay valid (otherwise a WLC can tunnel to the anchor)."),
];
