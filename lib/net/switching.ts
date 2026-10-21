/**
 * Layer-2 switching solvers: the self-learning switch (learn, forward, flood,
 * filter), Spanning Tree root election and blocked-link counts, and VLAN
 * broadcast domains. `content/questions/switchGenerators.ts` is answered by
 * these; tests check them against Kurose & Ross §6.4 and IEEE 802.1D/802.1Q.
 */

export const BROADCAST = "FF:FF:FF:FF:FF:FF";

export interface Frame {
  /** Source host label (its MAC). */
  src: string;
  /** Destination host label, or `BROADCAST`. */
  dst: string;
  /** Port the frame arrives on (1-based). */
  inPort: number;
}

export type SwitchAction = "flood" | "forward" | "filter";

export interface SwitchStep {
  frame: Frame;
  action: SwitchAction;
  /** Ports the frame leaves on, ascending. */
  outPorts: number[];
  /** The MAC table after learning from this frame. */
  table: Record<string, number>;
}

/**
 * Run a transparent bridge over a frame sequence, starting from an empty table.
 * 1. Learn: table[src] = inPort (overwriting any older port).
 * 2. A broadcast or unknown destination is flooded to every port except inPort.
 * 3. A known destination on another port is forwarded to that port only.
 * 4. A known destination on the arrival port is filtered (dropped): both hosts
 *    are on the same segment and already heard it.
 */
export function simulateSwitch(ports: number, frames: readonly Frame[]): SwitchStep[] {
  const table: Record<string, number> = {};
  const steps: SwitchStep[] = [];
  const all = Array.from({ length: ports }, (_, i) => i + 1);
  for (const frame of frames) {
    table[frame.src] = frame.inPort;
    const known = frame.dst !== BROADCAST ? table[frame.dst] : undefined;
    let action: SwitchAction;
    let outPorts: number[];
    if (known === undefined) {
      action = "flood";
      outPorts = all.filter((p) => p !== frame.inPort);
    } else if (known === frame.inPort) {
      action = "filter";
      outPorts = [];
    } else {
      action = "forward";
      outPorts = [known];
    }
    steps.push({ frame, action, outPorts, table: { ...table } });
  }
  return steps;
}

export interface BridgeId {
  priority: number;
  /** MAC address as 12 hex digits, no separators. */
  mac: string;
}

/** Lower is better: priority first, then MAC as a number (compared as fixed-width hex). */
export function compareBridgeIds(a: BridgeId, b: BridgeId): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.mac.toLowerCase().localeCompare(b.mac.toLowerCase());
}

/** Index of the root bridge: the lowest bridge ID wins the election. */
export function electRoot(bridges: readonly BridgeId[]): number {
  let best = 0;
  for (let i = 1; i < bridges.length; i++) if (compareBridgeIds(bridges[i], bridges[best]) < 0) best = i;
  return best;
}

/**
 * Links STP blocks in a connected network of `switches` switches joined by
 * `links` links: the active tree keeps switches − 1, everything else blocks.
 */
export function blockedLinks(switches: number, links: number): number {
  return links - (switches - 1);
}

/** Broadcast domains: one per distinct VLAN in use (trunks carry them, they don't merge them). */
export function vlanDomains(accessPortVlans: readonly (readonly number[])[]): number {
  return new Set(accessPortVlans.flat()).size;
}

/** 802.1Q adds a 4-byte tag, so the largest tagged Ethernet frame is 1522 bytes. */
export const DOT1Q_TAG_BYTES = 4;
export const MAX_TAGGED_FRAME = 1518 + DOT1Q_TAG_BYTES;
