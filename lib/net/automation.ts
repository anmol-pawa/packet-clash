/**
 * CCNA 4.8 automation and programmability: HTTP verb semantics for REST APIs,
 * reading JSON, and which plane / tool does what.
 */

export interface VerbInfo {
  verb: string;
  crud: string;
  /** Safe: does not change server state. */
  safe: boolean;
  /** Idempotent: repeating the request leaves the same end state. */
  idempotent: boolean;
}

export const HTTP_VERBS: readonly VerbInfo[] = [
  { verb: "GET", crud: "Read", safe: true, idempotent: true },
  { verb: "POST", crud: "Create", safe: false, idempotent: false },
  { verb: "PUT", crud: "Update (replace)", safe: false, idempotent: true },
  { verb: "PATCH", crud: "Update (modify)", safe: false, idempotent: false },
  { verb: "DELETE", crud: "Delete", safe: false, idempotent: true },
];

export function verbFor(crud: "Create" | "Read" | "Update" | "Delete"): string {
  const v = HTTP_VERBS.find((x) => x.crud.startsWith(crud));
  if (!v) throw new Error(`no verb for ${crud}`);
  return v.verb;
}

export function verbInfo(verb: string): VerbInfo {
  const v = HTTP_VERBS.find((x) => x.verb === verb);
  if (!v) throw new Error(`unknown verb ${verb}`);
  return v;
}

/** Look up a path like `a.b[1].c` in parsed JSON. Throws if any step is missing. */
export function jsonPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.match(/[^.[\]]+/g) ?? []) {
    if (cur === null || typeof cur !== "object" || !(part in (cur as object))) throw new Error(`missing ${part} in ${path}`);
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** How many array elements have `key` equal to `value`. */
export function countWhere(items: readonly Record<string, unknown>[], key: string, value: unknown): number {
  return items.filter((i) => i[key] === value).length;
}

export type Plane = "Management plane" | "Control plane" | "Data plane";

export const PLANE_FUNCTIONS: readonly { fn: string; plane: Plane }[] = [
  { fn: "Forwarding a packet out an interface using the FIB", plane: "Data plane" },
  { fn: "Applying an ACL to a packet as it crosses the router", plane: "Data plane" },
  { fn: "Performing NAT translation on a packet", plane: "Data plane" },
  { fn: "Building the routing table with OSPF", plane: "Control plane" },
  { fn: "Learning MAC addresses and building the CAM table", plane: "Control plane" },
  { fn: "Running STP to choose a root bridge", plane: "Control plane" },
  { fn: "Answering ARP requests (building the ARP table)", plane: "Control plane" },
  { fn: "Logging in over SSH to configure the device", plane: "Management plane" },
  { fn: "Polling the device with SNMP", plane: "Management plane" },
  { fn: "Sending logs to a syslog server", plane: "Management plane" },
];

export function planeOf(fn: string): Plane {
  const p = PLANE_FUNCTIONS.find((x) => x.fn === fn);
  if (!p) throw new Error(`unknown function ${fn}`);
  return p.plane;
}

export interface ConfigTool {
  name: string;
  /** Needs an agent installed on the managed device. */
  agent: boolean;
  /** Devices pull their config from a server (otherwise the server pushes). */
  pull: boolean;
  language: string;
}

export const CONFIG_TOOLS: readonly ConfigTool[] = [
  { name: "Ansible", agent: false, pull: false, language: "YAML playbooks" },
  { name: "Puppet", agent: true, pull: true, language: "Puppet DSL manifests" },
  { name: "Chef", agent: true, pull: true, language: "Ruby recipes" },
  { name: "Terraform", agent: false, pull: false, language: "HCL (declarative provisioning)" },
];

export function toolsWhere(f: (t: ConfigTool) => boolean): string[] {
  return CONFIG_TOOLS.filter(f).map((t) => t.name);
}
