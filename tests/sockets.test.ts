import { describe, expect, it } from "vitest";
import { SOCKET_BANK } from "@/content/questions/socketBank";
import { SOCKET_GENERATORS, backlogGen, fdLimitGen, loopRateGen, threadMemGen } from "@/content/questions/socketGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { correctResponse, grade, type NumericQuestion, type OrderQuestion } from "@/game/engine/questions";
import { CLIENT_CALLS, SERVER_CALLS, effectiveBacklog, loopRequestsPerSec, maxConnections, threadStackMiB } from "@/lib/net/sockets";

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

describe("sockets solver", () => {
  it("server call order is socket, bind, listen, accept, I/O, close (Stevens)", () => {
    expect(SERVER_CALLS.slice(0, 4)).toEqual(["socket()", "bind()", "listen()", "accept()"]);
    expect(CLIENT_CALLS.slice(0, 2)).toEqual(["socket()", "connect()"]);
  });
  it("backlog is clamped to somaxconn", () => {
    expect(effectiveBacklog(65535, 4096)).toBe(4096);
    expect(effectiveBacklog(128, 4096)).toBe(128);
  });
  it("fd limit minus reserved descriptors", () => {
    expect(maxConnections(1024, 24)).toBe(1000);
    expect(maxConnections(10, 24)).toBe(0);
  });
  it("10,000 threads with 8 MiB stacks reserve 80,000 MiB; 1 MiB stacks 10,000 MiB (C10K)", () => {
    expect(threadStackMiB(10000, 8192)).toBe(80000);
    expect(threadStackMiB(10000, 1024)).toBe(10000);
  });
  it("a 100 µs request gives 10,000 req/s per loop", () => {
    expect(loopRequestsPerSec(100)).toBe(10000);
    expect(loopRequestsPerSec(125)).toBe(8000);
  });
});

describe("socket cards", () => {
  it("order questions grade the right sequence", () => {
    for (const q of SOCKET_BANK.filter((x): x is OrderQuestion => x.kind === "order")) {
      expect(grade(q, correctResponse(q))).toBe(true);
      expect(grade(q, { kind: "order", steps: [...q.steps].reverse() })).toBe(false);
    }
  });
});

describe("socket generators", () => {
  it("are registered", () => {
    for (const g of SOCKET_GENERATORS) expect(GENERATORS).toContain(g);
  });
  it("re-solve from the printed prompt", () => {
    for (const s of seeds) {
      const b = backlogGen.generate(s) as NumericQuestion;
      const [bl, sm] = [...b.prompt.matchAll(/(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, "")));
      expect(b.answer).toBe(Math.min(bl, sm));

      const f = fdLimitGen.generate(s) as NumericQuestion;
      const [lim, res] = [...f.prompt.matchAll(/(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, "")));
      expect(f.answer).toBe(lim - res);

      const t = threadMemGen.generate(s) as NumericQuestion;
      const [kib, n] = [...t.prompt.matchAll(/(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, "")));
      expect(Math.abs(t.answer - (kib * n) / 1024)).toBeLessThan(0.01);

      const l = loopRateGen.generate(s) as NumericQuestion;
      const us = Number(l.prompt.match(/spends (\d+)/)![1]);
      expect(l.answer).toBe(Math.floor(1e6 / us));
    }
  });
});
