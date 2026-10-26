/**
 * CCNA 4.7 problems: 2.4 GHz channel overlap and centre frequency, and the
 * well-known port of AAA / tunnelling / management protocols. Answers come
 * from `lib/net/wireless`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { channel24Freq, channelsOverlap24, WELL_KNOWN_PORTS } from "@/lib/net/wireless";
import { randInt, rng } from "@/lib/rng";

const base = { topic: "ccna", type: "NETWORK" } as const;

export const channelOverlapGen: Generator = {
  id: "gen-ccna-wlanoverlap",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const ch = randInt(r, 1, 11);
    const all = Array.from({ length: 11 }, (_, i) => i + 1);
    const clear = all.filter((c) => !channelsOverlap24(ch, c));
    const clash = all.filter((c) => channelsOverlap24(ch, c));
    const right = clear[randInt(r, 0, clear.length - 1)];
    const pool = [...clash];
    const wrong: number[] = [];
    while (wrong.length < 3) wrong.push(pool.splice(randInt(r, 0, pool.length - 1), 1)[0]);
    const { choices, answer } = mcqChoices(r, `Channel ${right}`, wrong.map((c) => `Channel ${c}`));
    return {
      id: `gen-ccna-wlanoverlap:${ch}:${choices.join("|")}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `An access point uses 2.4 GHz channel ${ch} (22 MHz wide, channels 5 MHz apart). A neighbouring AP must not overlap with it. Which channel can it use?`,
      choices,
      answer,
      explain: `Channel centres are 2407 + 5n MHz, so channel ${ch} is ${channel24Freq(ch)} MHz and channel ${right} is ${channel24Freq(right)} MHz: ${Math.abs(channel24Freq(ch) - channel24Freq(right))} MHz apart, which is at least the 22 MHz channel width. The others sit less than 22 MHz away and overlap.`,
    } satisfies Question;
  },
};

export const channelFreqGen: Generator = {
  id: "gen-ccna-wlanfreq",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const ch = randInt(r, 1, 13);
    return {
      id: `gen-ccna-wlanfreq:${ch}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `What is the centre frequency, in MHz, of 2.4 GHz Wi-Fi channel ${ch}?`,
      answer: channel24Freq(ch),
      explain: `Channels 1-13 are centred at 2407 + 5 × n MHz. For n = ${ch}: 2407 + ${5 * ch} = ${channel24Freq(ch)} MHz.`,
    } satisfies Question;
  },
};

export const portGen: Generator = {
  id: "gen-ccna-secport",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const pick = WELL_KNOWN_PORTS[randInt(r, 0, WELL_KNOWN_PORTS.length - 1)];
    const answer = pick.port;
    const decoys = [...new Set(WELL_KNOWN_PORTS.map((p) => p.port))].filter((p) => p !== answer);
    for (const extra of ["TCP 443", "UDP 161", "UDP 53"]) if (!decoys.includes(extra)) decoys.push(extra);
    const shuffled = decoys.sort(() => r() - 0.5);
    const { choices, answer: idx } = mcqChoices(r, answer, shuffled);
    return {
      id: `gen-ccna-secport:${pick.protocol}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `Which transport protocol and port does ${pick.protocol} use?`,
      choices,
      answer: idx,
      explain: `${pick.protocol} uses ${answer}: ${pick.note}.`,
    } satisfies Question;
  },
};

export const WIRELESS_GENERATORS: readonly Generator[] = [channelOverlapGen, channelFreqGen, portGen];
