import { describe, expect, it } from "vitest";
import { DEBUG_BANK } from "@/content/questions/debugBank";
import { DEBUG_GENERATORS, jumpHopGen, mssGen, pmtudGen, slowPhaseGen, ssGen, ttfbGen } from "@/content/questions/debugGenerators";
import { GENERATORS } from "@/content/questions/generators";
import type { McqQuestion, NumericQuestion } from "@/game/engine/questions";
import { FAST_RETRANSMIT_DUPACKS, biggestJumpHop, lossIsReal, mssForMtu, pathMtu, pmtudOutcome, retransmitPercent, slowestPhase, ssDiagnosis, timeToFirstByteMs, totalMs } from "@/lib/net/debug";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 13);

describe("debug solver", () => {
  it("curl timing phases", () => {
    const p = { dns: 120, connect: 40, tls: 85, server: 900, download: 60 };
    expect(timeToFirstByteMs(p)).toBe(1145);
    expect(totalMs(p)).toBe(1205);
    expect(slowestPhase(p)).toBe("server");
  });
  it("traceroute jump and mtr loss", () => {
    expect(biggestJumpHop([2, 5, 12, 148, 150])).toBe(3);
    expect(lossIsReal([0, 40, 0, 0], 1)).toBe(false);
    expect(lossIsReal([0, 10, 10, 10], 1)).toBe(true);
  });
  it("MSS, path MTU and PMTUD", () => {
    expect(mssForMtu(1500)).toBe(1460);
    expect(mssForMtu(1492)).toBe(1452);
    expect(pathMtu([1500, 1400, 9000])).toBe(1400);
    expect(pmtudOutcome(1500, 1500, false)).toBe("fits");
    expect(pmtudOutcome(1500, 1400, true)).toBe("adapts");
    expect(pmtudOutcome(1500, 1400, false)).toBe("blackhole");
  });
  it("ss queues, retransmits, dup ACKs", () => {
    expect(ssDiagnosis(300000, 0)).toBe("app-not-reading");
    expect(ssDiagnosis(0, 50000)).toBe("peer-or-network-slow");
    expect(ssDiagnosis(0, 0)).toBe("healthy");
    expect(retransmitPercent(5, 200)).toBe(2.5);
    expect(FAST_RETRANSMIT_DUPACKS).toBe(3);
  });
});

describe("debug cards", () => {
  it("are well-formed MCQs", () => {
    for (const q of DEBUG_BANK as McqQuestion[]) {
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
  });
});

describe("debug generators", () => {
  it("are registered", () => {
    for (const g of DEBUG_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const s of seeds) {
      const sp = slowPhaseGen.generate(s) as McqQuestion;
      const v = [...sp.prompt.matchAll(/(\d+) ms/g)].map((m) => Number(m[1]));
      expect(sp.choices[sp.answer]).toBe(["DNS", "TCP connect", "TLS", "Server wait", "Download"][v.indexOf(Math.max(...v))]);

      const tt = ttfbGen.generate(s) as NumericQuestion;
      const t = [...tt.prompt.matchAll(/(\d+) ms/g)].map((m) => Number(m[1]));
      expect(tt.answer).toBe(t[0] + t[1] + t[2] + t[3]);

      const jh = jumpHopGen.generate(s) as McqQuestion;
      const r = [...jh.prompt.matchAll(/hop \d: (\d+) ms/g)].map((m) => Number(m[1]));
      const jumps = r.map((x, i) => x - (i ? r[i - 1] : 0));
      expect(jh.answer).toBe(jumps.indexOf(Math.max(...jumps)));
      expect(new Set(jumps).size).toBe(4);

      const m = mssGen.generate(s) as NumericQuestion;
      expect(m.answer).toBe(Number(/MTU of (\d+) bytes/.exec(m.prompt)![1]) - 40);

      const pm = pmtudGen.generate(s) as McqQuestion;
      const [, sender, path] = /uses a (\d+)-byte MTU.*?path is (\d+) bytes/.exec(pm.prompt)!;
      const icmp = !pm.prompt.includes("do not return");
      const want = Number(sender) <= Number(path) ? 0 : icmp ? 1 : 2;
      expect(pm.answer).toBe(want);

      const ss = ssGen.generate(s) as McqQuestion;
      const [, rq, sq] = /Recv-Q ([\d,]+) and Send-Q ([\d,]+)/.exec(ss.prompt)!.map((x) => Number(String(x).replace(/,/g, "")));
      expect(ss.answer).toBe(rq > 0 && rq >= sq ? 0 : 1);
    }
  });
});
