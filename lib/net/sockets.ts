/**
 * Sockets and OS networking (ROADMAP 5.6): the TCP socket call order, accept-queue sizing,
 * file-descriptor limits and the memory cost of thread-per-connection servers (the C10K problem).
 */

/** Calls a TCP server makes, in order, to start serving one client. */
export const SERVER_CALLS = ["socket()", "bind()", "listen()", "accept()", "read() / write()", "close()"] as const;

/** Calls a TCP client makes, in order. */
export const CLIENT_CALLS = ["socket()", "connect()", "write() / read()", "close()"] as const;

/** Linux clamps the listen() backlog to net.core.somaxconn, so the accept queue holds at most that many (the kernel allows one extra, ignored here). */
export function effectiveBacklog(backlog: number, somaxconn: number): number {
  return Math.min(backlog, somaxconn);
}

/** Connections a process can hold: the fd limit minus descriptors already used (stdin/out/err, listener, logs, ...). */
export function maxConnections(fdLimit: number, reservedFds: number): number {
  return Math.max(0, fdLimit - reservedFds);
}

/** Memory reserved for thread stacks when every connection gets its own thread (stack in KiB, result in MiB). */
export function threadStackMiB(connections: number, stackKiB: number): number {
  return (connections * stackKiB) / 1024;
}

/** Connections per second one event loop can serve if each request costs `microsPerRequest` of CPU time. */
export function loopRequestsPerSec(microsPerRequest: number): number {
  return Math.floor(1_000_000 / microsPerRequest);
}
