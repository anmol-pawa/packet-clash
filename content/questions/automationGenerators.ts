/**
 * CCNA 4.8 problems: reading JSON from a REST/RESTCONF reply, picking the HTTP
 * verb for a CRUD action and naming the plane for a device function. Answers
 * come from `lib/net/automation`.
 */
import { mcqChoices, type Generator, type Question } from "@/game/engine/questions";
import { PLANE_FUNCTIONS, countWhere, HTTP_VERBS, jsonPath, planeOf, verbFor } from "@/lib/net/automation";
import { randInt, rng } from "@/lib/rng";

const base = { topic: "ccna", type: "APPLICATION" } as const;

const NAMES = ["GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2", "Loopback0", "Vlan10", "Vlan20"];

function makeIfaces(r: () => number) {
  const n = randInt(r, 3, 5);
  return NAMES.slice(0, n).map((name, i) => ({
    name,
    enabled: r() < 0.5,
    ip: `10.${randInt(r, 0, 9)}.${i}.1`,
    mtu: [1500, 1500, 9000, 1400][randInt(r, 0, 3)],
  }));
}

export const jsonIpGen: Generator = {
  id: "gen-ccna-jsonip",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const interfaces = makeIfaces(r);
    const doc = { "ietf-interfaces:interfaces": { interface: interfaces } };
    const idx = randInt(r, 0, interfaces.length - 1);
    const path = `ietf-interfaces:interfaces.interface[${idx}].ip`;
    const answerValue = String(jsonPath(doc, path));
    const wrong = [...new Set(interfaces.filter((_, i) => i !== idx).map((i) => i.ip))].filter((ip) => ip !== answerValue);
    while (wrong.length < 3) wrong.push(`192.168.${wrong.length}.1`);
    const { choices, answer } = mcqChoices(r, answerValue, wrong);
    return {
      id: `gen-ccna-jsonip:${seed}:${choices.join("|")}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `A RESTCONF GET returns this JSON:\n${JSON.stringify(doc, null, 1)}\nWhat is the IP address of the interface at index ${idx} of the \`interface\` list (counting from 0)?`,
      choices,
      answer,
      explain: `JSON arrays are zero-indexed, so interface[${idx}] is ${interfaces[idx].name}, whose "ip" value is ${answerValue}.`,
    } satisfies Question;
  },
};

export const jsonCountGen: Generator = {
  id: "gen-ccna-jsoncount",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const interfaces = makeIfaces(r);
    const doc = { interfaces };
    const enabled = r() < 0.5;
    const count = countWhere(jsonPath(doc, "interfaces") as Record<string, unknown>[], "enabled", enabled);
    return {
      id: `gen-ccna-jsoncount:${seed}`,
      kind: "numeric",
      ...base,
      difficulty: 2,
      prompt: `This JSON came back from a device API:\n${JSON.stringify(doc, null, 1)}\nHow many interfaces have "enabled" set to ${enabled}?`,
      answer: count,
      explain: `Count the objects in the "interfaces" array whose "enabled" key is ${enabled}: ${count}. (JSON booleans are written without quotes.)`,
    } satisfies Question;
  },
};

const ACTIONS: readonly { text: string; crud: "Create" | "Read" | "Update" | "Delete" }[] = [
  { text: "add a new VLAN to the controller's inventory", crud: "Create" },
  { text: "list the devices the controller knows about", crud: "Read" },
  { text: "fetch the details of one interface", crud: "Read" },
  { text: "replace an interface's whole configuration with a new document", crud: "Update" },
  { text: "remove a static route", crud: "Delete" },
  { text: "register a new site with the controller", crud: "Create" },
];

export const verbGen: Generator = {
  id: "gen-ccna-restverb",
  ...base,
  difficulty: 1,
  generate(seed) {
    const r = rng(seed);
    const a = ACTIONS[randInt(r, 0, ACTIONS.length - 1)];
    const right = verbFor(a.crud);
    const wrong = HTTP_VERBS.map((v) => v.verb).filter((v) => v !== right && v !== "PATCH").slice(0, 3);
    const { choices, answer } = mcqChoices(r, right, wrong);
    return {
      id: `gen-ccna-restverb:${a.text}:${choices.join("|")}`,
      kind: "mcq",
      ...base,
      difficulty: 1,
      prompt: `A REST client needs to ${a.text}. Which HTTP method fits (as a CRUD ${a.crud.toLowerCase()})?`,
      choices,
      answer,
      explain: `${a.crud} maps to ${right}. (Create = POST, Read = GET, Update = PUT/PATCH, Delete = DELETE.)`,
    } satisfies Question;
  },
};

export const planeGen: Generator = {
  id: "gen-ccna-plane",
  ...base,
  difficulty: 2,
  generate(seed) {
    const r = rng(seed);
    const pick = PLANE_FUNCTIONS[randInt(r, 0, PLANE_FUNCTIONS.length - 1)];
    const right = planeOf(pick.fn);
    const wrong = ["Management plane", "Control plane", "Data plane"].filter((p) => p !== right);
    const { choices, answer } = mcqChoices(r, right, [...wrong, "Application plane"]);
    return {
      id: `gen-ccna-plane:${pick.fn}`,
      kind: "mcq",
      ...base,
      difficulty: 2,
      prompt: `Which plane does this belong to: "${pick.fn}"?`,
      choices,
      answer,
      explain: `${right}: the data plane forwards traffic, the control plane decides how (routing, STP, MAC and ARP learning), and the management plane is how humans and tools configure and monitor the device.`,
    } satisfies Question;
  },
};

export const AUTOMATION_GENERATORS: readonly Generator[] = [jsonIpGen, jsonCountGen, verbGen, planeGen];
