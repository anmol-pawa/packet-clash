/**
 * 5.6 socket and OS problems: accept-queue size, fd-limited connection counts, thread stack
 * memory and event-loop throughput. Answers come from `lib/net/sockets`.
 */
import type { Generator, Question } from "@/game/engine/questions";
import { effectiveBacklog, loopRequestsPerSec, maxConnections, threadStackMiB } from "@/lib/net/sockets";
import { randInt, rng } from "@/lib/rng";

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[randInt(r, 0, xs.length - 1)];
}

const base = { topic: "interview", type: "NETWORK" } as const;
const fmt = (n: number) => n.toLocaleString("en-US");

export const backlogGen: Generator = {
  id: "gen-sde-backlog",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const backlog = pick(r, [128, 511, 1024, 4096, 65535]);
    const somaxconn = pick(r, [128, 1024, 4096]);
    const n = effectiveBacklog(backlog, somaxconn);
    return {
      id: `gen-sde-backlog:${backlog}:${somaxconn}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A Linux server calls listen(fd, ${fmt(backlog)}) while net.core.somaxconn is ${fmt(somaxconn)}. What is the largest accept queue the kernel will use?`,
      answer: n,
      unit: "connections",
      explain: `The kernel silently clamps the backlog to somaxconn: min(${fmt(backlog)}, ${fmt(somaxconn)}) = ${fmt(n)}. Raising only the listen() argument changes nothing once it exceeds somaxconn.`,
    } satisfies Question;
  },
};

export const fdLimitGen: Generator = {
  id: "gen-sde-fdlimit",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const limit = pick(r, [1024, 4096, 65536, 100000]);
    const reserved = pick(r, [8, 16, 24, 40]);
    const n = maxConnections(limit, reserved);
    return {
      id: `gen-sde-fdlimit:${limit}:${reserved}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A proxy runs with ulimit -n ${fmt(limit)}. It already holds ${reserved} descriptors (stdio, the listener, logs, config). Each client connection uses one fd. How many client connections can it hold?`,
      answer: n,
      unit: "connections",
      explain: `${fmt(limit)} − ${reserved} = ${fmt(n)}. Every socket is a file descriptor; a reverse proxy also needs one more fd per upstream connection, so its real client capacity is about half this.`,
    } satisfies Question;
  },
};

export const threadMemGen: Generator = {
  id: "gen-sde-threadmem",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const conns = pick(r, [2000, 10000, 20000, 50000]);
    const stack = pick(r, [256, 512, 1024, 2048, 8192]);
    const mib = threadStackMiB(conns, stack);
    return {
      id: `gen-sde-threadmem:${conns}:${stack}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A thread-per-connection server reserves a ${fmt(stack)} KiB stack for each of ${fmt(conns)} connections. How much stack memory is reserved in total, in MiB?`,
      answer: mib,
      tolerance: 0.5,
      unit: "MiB",
      explain: `${fmt(conns)} × ${fmt(stack)} KiB = ${fmt(conns * stack)} KiB = ${fmt(Math.round(mib * 10) / 10)} MiB (÷ 1,024). An event loop shares a few stacks across all connections, which is the C10K fix.`,
    } satisfies Question;
  },
};

export const loopRateGen: Generator = {
  id: "gen-sde-looprate",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const micros = pick(r, [20, 40, 50, 100, 125, 250, 500]);
    const n = loopRequestsPerSec(micros);
    return {
      id: `gen-sde-looprate:${micros}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `A single-threaded event loop spends ${micros} µs of CPU on each request and never blocks on I/O. At most how many requests per second can it serve?`,
      answer: n,
      unit: "req/s",
      explain: `1,000,000 µs ÷ ${micros} µs = ${fmt(n)} requests per second on one core. Run one loop per core (SO_REUSEPORT) to scale further.`,
    } satisfies Question;
  },
};

export const SOCKET_GENERATORS: readonly Generator[] = [backlogGen, fdLimitGen, threadMemGen, loopRateGen];
