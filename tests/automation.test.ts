import { describe, expect, it } from "vitest";
import { AUTOMATION_BANK } from "@/content/questions/automationBank";
import { AUTOMATION_GENERATORS, jsonCountGen, jsonIpGen, planeGen, verbGen } from "@/content/questions/automationGenerators";
import { GENERATORS } from "@/content/questions/generators";
import { answerText, correctResponse, grade, type McqQuestion, type NumericQuestion } from "@/game/engine/questions";
import { CONFIG_TOOLS, countWhere, HTTP_VERBS, jsonPath, planeOf, toolsWhere, verbFor, verbInfo } from "@/lib/net/automation";

const seeds = Array.from({ length: 80 }, (_, i) => i * 7919 + 11);

describe("automation solver", () => {
  it("reads JSON paths", () => {
    const doc = { vlans: [{ id: 10 }, { id: 20 }], a: { b: "x" } };
    expect(jsonPath(doc, "vlans[1].id")).toBe(20);
    expect(jsonPath(doc, "a.b")).toBe("x");
    expect(() => jsonPath(doc, "vlans[2].id")).toThrow();
  });
  it("counts matching items", () => {
    expect(countWhere([{ e: true }, { e: false }, { e: true }], "e", true)).toBe(2);
  });
  it("maps CRUD to HTTP verbs", () => {
    expect(verbFor("Create")).toBe("POST");
    expect(verbFor("Read")).toBe("GET");
    expect(verbFor("Update")).toBe("PUT");
    expect(verbFor("Delete")).toBe("DELETE");
  });
  it("knows safe and idempotent methods", () => {
    expect(HTTP_VERBS.filter((v) => !v.idempotent).map((v) => v.verb)).toEqual(["POST", "PATCH"]);
    expect(verbInfo("GET").safe).toBe(true);
    expect(verbInfo("PUT").safe).toBe(false);
  });
  it("classifies planes", () => {
    expect(planeOf("Building the routing table with OSPF")).toBe("Control plane");
    expect(planeOf("Performing NAT translation on a packet")).toBe("Data plane");
    expect(planeOf("Polling the device with SNMP")).toBe("Management plane");
  });
  it("groups the config tools", () => {
    expect(toolsWhere((t) => !t.agent)).toEqual(["Ansible", "Terraform"]);
    expect(toolsWhere((t) => t.pull)).toEqual(["Puppet", "Chef"]);
    expect(CONFIG_TOOLS.find((t) => t.name === "Ansible")?.language).toMatch(/YAML/);
  });
});

describe("automation cards and generators", () => {
  it("pin every card answer", () => {
    const expected: Record<string, string> = {
      "auto-planes": "Control plane",
      "auto-sdn": "The control plane is separated from the data plane and centralised in a controller",
      "auto-northbound": "The controller and the applications or orchestration above it",
      "auto-southbound": "NETCONF",
      "auto-controller-vs-trad": "Policy is defined once centrally and pushed to many devices, instead of configuring each device by hand",
      "auto-fabric": "Underlay",
      "auto-dnac": "Cisco DNA Center",
      "auto-rest-verbs": "POST",
      "auto-idempotent": "POST",
      "auto-status": "The request is not authenticated (missing or bad credentials)",
      "auto-404": "No device with that identifier exists at that URL",
      "auto-json": "Data is held as key/value pairs in { } objects and values in [ ] arrays, with keys in double quotes",
      "auto-yaml": "YAML",
      "auto-xml": "XML",
      "auto-netconf": "Over SSH (TCP 830) with XML-encoded RPCs",
      "auto-restconf": "A REST-style HTTP interface to YANG-modelled device data, using JSON or XML",
      "auto-yang": "A data model for the configuration and state data of network devices",
      "auto-ansible": "It is agentless, pushes changes over SSH or APIs and uses YAML playbooks",
      "auto-puppet-chef": "Puppet and Chef",
      "auto-terraform": "Declaring and provisioning infrastructure as code (typically cloud resources) with HCL",
      "auto-declarative": "Declarative describes the desired end state; imperative lists the steps to run",
      "auto-drift": "Configuration drift between devices that should be identical",
      "auto-json-read": "20",
      "auto-diff": "The interface IP address was replaced by 10.0.1.1/24",
    };
    expect(AUTOMATION_BANK.map((q) => q.id).sort()).toEqual(Object.keys(expected).sort());
    for (const q of AUTOMATION_BANK) expect(answerText(q), q.id).toBe(expected[q.id]);
    for (const q of AUTOMATION_BANK) {
      expect(grade(q, correctResponse(q)), q.id).toBe(true);
      expect(new Set((q as McqQuestion).choices).size, q.id).toBe(4);
    }
  });

  it("are registered", () => {
    for (const g of AUTOMATION_GENERATORS) expect(GENERATORS).toContain(g);
  });

  it("json ip answer is re-solved from the printed JSON", () => {
    for (const s of seeds) {
      const q = jsonIpGen.generate(s) as McqQuestion;
      const doc = JSON.parse(/GET returns this JSON:\n([\s\S]*?)\nWhat is/.exec(q.prompt)![1]);
      const idx = Number(/at index (\d+)/.exec(q.prompt)![1]);
      expect(q.choices[q.answer]).toBe(doc["ietf-interfaces:interfaces"].interface[idx].ip);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("json count answer is re-solved from the printed JSON", () => {
    for (const s of seeds) {
      const q = jsonCountGen.generate(s) as NumericQuestion;
      const doc = JSON.parse(/API:\n([\s\S]*?)\nHow many/.exec(q.prompt)![1]);
      const want = /"enabled" set to (true|false)/.exec(q.prompt)![1] === "true";
      expect(q.answer).toBe(doc.interfaces.filter((i: { enabled: boolean }) => i.enabled === want).length);
    }
  });

  it("verb answer matches the CRUD action", () => {
    for (const s of seeds) {
      const q = verbGen.generate(s) as McqQuestion;
      const crud = /as a CRUD (\w+)\)/.exec(q.prompt)![1];
      expect(q.choices[q.answer]).toBe(verbFor((crud[0].toUpperCase() + crud.slice(1)) as "Create"));
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("plane answer is re-solved from the function", () => {
    for (const s of seeds) {
      const q = planeGen.generate(s) as McqQuestion;
      expect(q.choices[q.answer]).toBe(planeOf(/belong to: "(.+)"\?/.exec(q.prompt)![1]));
      expect(new Set(q.choices).size).toBe(4);
    }
  });
});
