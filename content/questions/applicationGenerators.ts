/**
 * Gym 6's application-layer problems: DNS message counts, HTTP page-load
 * time, web-cache delay and DHCP timers. Every answer comes from
 * `lib/net/application`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { accessDelay, cacheAverageDelay, dhcpTimers, dnsCost, linkUtilization, pageLoadRtts, type DnsCache, type DnsMode, type HttpMode } from "@/lib/net/application";
import { randInt, rng } from "@/lib/rng";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const CACHE_TEXT: Record<DnsCache, string> = {
  none: "Nothing is cached.",
  tld: "The TLD server's address is cached.",
  auth: "The authoritative server's address is cached.",
  answer: "The answer itself is cached.",
};

export const dnsGen: Generator = {
  id: "gen-dns-cost",
  topic: "application",
  type: "APPLICATION",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mode: DnsMode = pick(r, ["iterative", "recursive"]);
    const cache: DnsCache = pick(r, ["none", "none", "tld", "auth"]);
    const extra = pick(r, [0, 0, 1]);
    const askLocal = r() < 0.5;
    const cost = dnsCost(mode, cache, extra);
    const sub = extra ? " The authoritative server for the domain delegates once more, to a server for the subdomain." : "";
    const how = mode === "iterative" ? "iteratively" : "recursively";
    return {
      id: `gen-dns-cost:${mode}:${cache}:${extra}:${askLocal ? "local" : "all"}`,
      kind: "numeric",
      topic: "application",
      type: "APPLICATION",
      difficulty: 2,
      prompt: askLocal
        ? `A host asks its local DNS server to resolve a name; the local server resolves it ${how}. ${CACHE_TEXT[cache]}${sub} How many queries does the local DNS server itself send?`
        : `A host asks its local DNS server (a recursive query) to resolve a name; the local server resolves it ${how}. ${CACHE_TEXT[cache]}${sub} How many DNS messages (queries and replies) are sent in total, counting the host ↔ local server pair?`,
      answer: askLocal ? cost.localQueries : cost.messages,
      explain: `${cost.serversContacted} server${cost.serversContacted === 1 ? "" : "s"} must be consulted (root, TLD, authoritative${extra ? " and one more delegation" : ""}, minus anything cached). ${
        askLocal
          ? mode === "iterative"
            ? "In iterative resolution the local server queries each of them itself: one query per server."
            : "In recursive resolution the local server sends a single query to the first server, which does the rest."
          : `Each hop is a query plus a reply, and the host asks its local server too: 2 × (${cost.serversContacted} + 1) = ${cost.messages}. Iterative and recursive give the same total; they differ in who sends the queries.`
      }`,
    } satisfies Question;
  },
};

export const httpLoadGen: Generator = {
  id: "gen-http-load",
  topic: "application",
  type: "APPLICATION",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const mode: HttpMode = pick(r, ["non-persistent", "persistent", "pipelined"]);
    const objects = randInt(r, 2, 10);
    const parallel = mode === "non-persistent" ? pick(r, [1, 1, 2, 5]) : 1;
    const rtt = pick(r, [20, 40, 50, 80, 100]);
    const rtts = pageLoadRtts(mode, objects, parallel);
    const rounds = Math.ceil(objects / parallel);
    const how = {
      "non-persistent": `HTTP/1.0 with a new TCP connection per object${parallel > 1 ? `, up to ${parallel} in parallel` : ", one after another"}`,
      persistent: "HTTP/1.1 with one persistent connection and no pipelining",
      pipelined: "HTTP/1.1 with a persistent connection and pipelining",
    }[mode];
    return {
      id: `gen-http-load:${mode}:${objects}:${parallel}:${rtt}`,
      kind: "numeric",
      topic: "application",
      type: "APPLICATION",
      difficulty: 2,
      prompt: `A web page is a base HTML file plus ${objects} small embedded objects, all on one server with RTT ${rtt} ms. Using ${how}, and ignoring transmission times, how long does it take to load the whole page?`,
      answer: rtts * rtt,
      unit: "ms",
      explain: `${
        mode === "non-persistent"
          ? `Every object costs 2 RTT (TCP handshake, then request/response). Base page: 2 RTT. Embedded objects: ${rounds} round${rounds === 1 ? "" : "s"} of 2 RTT.`
          : mode === "persistent"
            ? "The handshake is paid once: the base page takes 2 RTT, then each object takes 1 RTT (request/response)."
            : "Handshake plus base page is 2 RTT; with pipelining all embedded requests go out together and come back in 1 RTT more."
      } Total ${rtts} RTT × ${rtt} ms = ${rtts * rtt} ms.`,
    } satisfies Question;
  },
};

export const cacheGen: Generator = {
  id: "gen-web-cache",
  topic: "application",
  type: "APPLICATION",
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const hit = pick(r, [0.2, 0.4, 0.5, 0.6, 0.8, 0.9]);
    const cacheMs = pick(r, [5, 10, 20]);
    const originMs = pick(r, [100, 200, 300, 500]);
    const avg = cacheAverageDelay(hit, cacheMs, originMs);
    return {
      id: `gen-web-cache:${hit}:${cacheMs}:${originMs}`,
      kind: "numeric",
      topic: "application",
      type: "APPLICATION",
      difficulty: 2,
      prompt: `An institution puts a web cache on its LAN. A request answered by the cache takes ${cacheMs} ms; one that must go to the origin server takes ${originMs} ms. With a hit rate of ${Math.round(hit * 100)}%, what is the average delay per request?`,
      answer: avg,
      tolerance: 0.01,
      unit: "ms",
      explain: `Weighted average: ${hit} × ${cacheMs} + ${Math.round((1 - hit) * 100) / 100} × ${originMs} = ${Number(avg.toFixed(2))} ms. The cache also cuts traffic on the access link by the hit rate.`,
    } satisfies Question;
  },
};

export const accessLinkGen: Generator = {
  id: "gen-access-link",
  topic: "application",
  type: "APPLICATION",
  difficulty: 3,
  generate(seed) {
    const r = rng(seed);
    const linkMbps = pick(r, [15, 20, 25]);
    const objKb = pick(r, [100, 200, 500]);
    const bits = objKb * 8000;
    const target = pick(r, [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const rateUsed = Math.max(1, Math.floor((target * linkMbps * 1e6) / bits));
    const hit = pick(r, [0.4, 0.5, 0.6]);
    const askAfter = r() < 0.5;
    const u = linkUtilization(rateUsed, bits, linkMbps * 1e6);
    const answer = askAfter ? (1 - hit) * u : u;
    const delay = accessDelay(bits, linkMbps * 1e6, rateUsed) * 1000;
    return {
      id: `gen-access-link:${linkMbps}:${objKb}:${rateUsed}:${hit}:${askAfter ? "after" : "before"}`,
      kind: "numeric",
      topic: "application",
      type: "APPLICATION",
      difficulty: 3,
      prompt: `An institution's access link to the Internet runs at ${linkMbps} Mbps. Browsers make ${rateUsed} requests per second for objects averaging ${objKb} kB (1 kB = 1000 bytes), all served from the origin. ${
        askAfter
          ? `A web cache with a ${Math.round(hit * 100)}% hit rate is installed. What is the access link's utilisation now (a fraction, e.g. 0.4)?`
          : "What is the access link's utilisation (traffic intensity, a fraction such as 0.4)?"
      }`,
      answer,
      tolerance: 0.005,
      explain: `Utilisation = rate × size ÷ link rate = ${rateUsed} × ${bits.toLocaleString("en-US")} bits ÷ ${(linkMbps * 1e6).toLocaleString("en-US")} bps = ${Number(u.toFixed(4))}.${
        askAfter ? ` Only misses (${Math.round((1 - hit) * 100)}%) cross the link: ${Number(u.toFixed(4))} × ${Math.round((1 - hit) * 100) / 100} = ${Number(answer.toFixed(4))}.` : ""
      } Queueing delay grows like Δ/(1 − Δβ) (about ${Math.round(delay)} ms per object before the cache), so it explodes as utilisation nears 1.`,
    } satisfies Question;
  },
};

export const dhcpGen: Generator = {
  id: "gen-dhcp-timers",
  topic: "application",
  type: "APPLICATION",
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const hours = pick(r, [1, 2, 4, 8, 12, 24, 48]);
    const which = pick(r, ["t1", "t2"] as const);
    const { t1, t2 } = dhcpTimers(hours * 3600);
    const mins = (which === "t1" ? t1 : t2) / 60;
    return {
      id: `gen-dhcp-timers:${hours}:${which}`,
      kind: "numeric",
      topic: "application",
      type: "APPLICATION",
      difficulty: 1,
      prompt: `A DHCP server grants a ${hours}-hour lease. By default, after how many minutes does the client ${which === "t1" ? "first try to renew it with the same server (timer T1)" : "start broadcasting to any server to rebind (timer T2)"}?`,
      answer: mins,
      unit: "min",
      explain: `T1 = 50% of the lease = ${t1 / 60} min (unicast renew to the original server); T2 = 87.5% = ${t2 / 60} min (broadcast rebind to any server). The lease is ${hours * 60} min in all.`,
    } satisfies Question;
  },
};

export const APPLICATION_GENERATORS: readonly Generator[] = [dnsGen, httpLoadGen, cacheGen, accessLinkGen, dhcpGen];
