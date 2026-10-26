/**
 * CCNA 4.8, automation and programmability: SDN planes and APIs, REST and data
 * formats, configuration management tools, NETCONF/RESTCONF and Cisco DNA Center.
 * Every answer is pinned in tests/automation.test.ts.
 */
import type { Difficulty, Question } from "@/game/engine/questions";

/** Build an MCQ; the right answer is slotted at position `slot` (0-3) among the three wrong ones. */
function card(id: string, difficulty: Difficulty, slot: number, prompt: string, right: string, wrong: [string, string, string], explain: string): Question {
  const choices = [...wrong];
  choices.splice(slot, 0, right);
  return { id, kind: "mcq", topic: "ccna", type: "APPLICATION", difficulty, prompt, choices, answer: slot, explain };
}

export const AUTOMATION_BANK: readonly Question[] = [
  card("auto-planes", 1, 0, "In a traditional network device, which plane makes forwarding decisions such as building the routing table?", "Control plane", ["Data plane", "Management plane", "Application plane"],
    "The control plane runs routing protocols, STP and ARP/MAC learning. The data plane forwards packets using what the control plane built; the management plane is for configuration and monitoring (SSH, SNMP, syslog)."),
  card("auto-sdn", 2, 1, "What is the key idea of software-defined networking (SDN)?", "The control plane is separated from the data plane and centralised in a controller", ["Every switch runs its own copy of the control plane for resilience", "The data plane moves into the cloud while devices keep the control plane", "Devices are managed only by SNMP polling"],
    "In SDN the devices keep the data plane (forwarding) and a controller holds the centralised control plane, giving one place to define policy for the whole network."),
  card("auto-northbound", 2, 2, "In an SDN architecture, what does the northbound API connect?", "The controller and the applications or orchestration above it", ["The controller and the switches below it", "Two controllers in a cluster", "A switch and its neighbouring switch"],
    "Northbound APIs (usually REST) face applications. Southbound APIs (OpenFlow, NETCONF, RESTCONF, CLI/SNMP) face the network devices."),
  card("auto-southbound", 2, 3, "Which of these is a southbound API protocol?", "NETCONF", ["REST over HTTPS to a business app", "SMTP", "GraphQL used by a dashboard"],
    "Southbound protocols carry the controller's decisions to devices: OpenFlow, NETCONF, RESTCONF, OpFlex, and even CLI/SNMP in some controllers. A REST call from an application to the controller is northbound."),
  card("auto-controller-vs-trad", 2, 0, "How does controller-based networking differ from traditional device-by-device management?", "Policy is defined once centrally and pushed to many devices, instead of configuring each device by hand", ["Each device decides its own policy independently", "The data plane runs on the controller", "It removes the need for any network devices"],
    "A controller has a global view and automates changes consistently, reducing configuration drift and human error."),
  card("auto-fabric", 3, 1, "In Cisco's campus SD-Access design, which term describes the physical devices that carry the traffic?", "Underlay", ["Overlay", "Northbound", "Orchestration plane"],
    "The underlay is the physical network (routed links between switches). The overlay is the virtual fabric (VXLAN tunnels) built on top, which carries the policy and segmentation."),
  card("auto-dnac", 2, 2, "Which Cisco controller provides intent-based networking, assurance and automation for campus networks?", "Cisco DNA Center", ["Cisco WLC", "Cisco ISE", "Cisco Prime Infrastructure SNMP only"],
    "DNA Center is the campus controller: design, policy, provisioning and assurance. It exposes a northbound REST API (Intent API) and uses CLI, SNMP, NETCONF and others southbound."),
  card("auto-rest-verbs", 1, 3, "Which HTTP method is normally used to create a new resource through a REST API?", "POST", ["GET", "PUT", "DELETE"],
    "POST creates, GET reads, PUT replaces or updates, PATCH partially modifies, DELETE removes (CRUD = Create, Read, Update, Delete)."),
  card("auto-idempotent", 3, 1, "Which HTTP method is NOT idempotent, so repeating it may create duplicates?", "POST", ["PUT", "DELETE", "GET"],
    "Repeating PUT, DELETE or GET leaves the same end state. Each POST can create another resource."),
  card("auto-status", 2, 0, "A REST call returns HTTP status 401. What does it mean?", "The request is not authenticated (missing or bad credentials)", ["The resource was not found", "The request succeeded and a new resource was created", "The server had an internal error"],
    "401 Unauthorized means no valid credentials. 403 is authenticated but forbidden, 404 not found, 201 created, 200 OK, and 5xx is a server-side error."),
  card("auto-404", 1, 2, "A GET to /api/v1/devices/99 returns 404. What does that tell you?", "No device with that identifier exists at that URL", ["The server is down", "The request body was malformed JSON", "You need to log in"],
    "4xx codes are client-side problems; 404 means the resource at that URI was not found. 5xx would mean a server fault."),
  card("auto-json", 2, 3, "Which describes JSON syntax correctly?", "Data is held as key/value pairs in { } objects and values in [ ] arrays, with keys in double quotes", ["Data is written between matching opening and closing tags", "Structure is shown only by indentation and colons", "Keys are separated from values with an equals sign"],
    "JSON uses objects {\"key\": value}, arrays [..], strings in double quotes, numbers, true/false and null. The tag form is XML and indentation-based is YAML."),
  card("auto-yaml", 2, 1, "Which data format uses indentation to show structure and is used for Ansible playbooks?", "YAML", ["JSON", "XML", "CSV"],
    "YAML is whitespace-structured and easy for humans to read. It is a superset of JSON, so any JSON is valid YAML."),
  card("auto-xml", 1, 2, "Which format uses opening and closing tags such as <interface><name>Gi0/0</name></interface>?", "XML", ["JSON", "YAML", "HCL"],
    "XML is tag-based. NETCONF always uses XML; RESTCONF can use XML or JSON."),
  card("auto-netconf", 3, 0, "How does NETCONF reach a device?", "Over SSH (TCP 830) with XML-encoded RPCs", ["Over UDP 161 with MIB objects", "Over HTTPS with a JSON body", "Over Telnet with CLI text"],
    "NETCONF (RFC 6241) sends XML RPCs such as <get-config> and <edit-config>, defaulting to TCP port 830 over SSH. SNMP is UDP 161."),
  card("auto-restconf", 3, 3, "What is RESTCONF?", "A REST-style HTTP interface to YANG-modelled device data, using JSON or XML", ["A CLI mode that restricts configuration", "A faster version of SNMP traps", "An XML-only protocol over SSH"],
    "RESTCONF (RFC 8040) maps NETCONF-style operations to HTTP methods (GET, POST, PUT, PATCH, DELETE) over HTTPS."),
  card("auto-yang", 3, 1, "What does YANG define?", "A data model for the configuration and state data of network devices", ["A wireless encryption algorithm", "A routing protocol", "An IOS command prompt mode"],
    "YANG models the structure of configuration and operational data so that NETCONF and RESTCONF can read and write it in a standard way."),
  card("auto-ansible", 2, 2, "Which statement about Ansible is true?", "It is agentless, pushes changes over SSH or APIs and uses YAML playbooks", ["It needs an agent on every device and pulls config from a master", "It uses Ruby recipes and a pull model", "It only provisions cloud infrastructure with HCL"],
    "Ansible is agentless and push-based, with YAML playbooks and an inventory of hosts."),
  card("auto-puppet-chef", 3, 0, "Which pair of tools uses an agent on the managed node and a pull model from a central server?", "Puppet and Chef", ["Ansible and Terraform", "Ansible and Puppet", "Chef and Terraform"],
    "Puppet (its own DSL manifests) and Chef (Ruby recipes) agents check in periodically and pull their configuration. Ansible and Terraform are agentless and push."),
  card("auto-terraform", 3, 3, "What is Terraform mainly used for?", "Declaring and provisioning infrastructure as code (typically cloud resources) with HCL", ["Polling interface counters with SNMP", "Running a RADIUS server", "Capturing packets"],
    "Terraform is declarative: you describe the desired end state in HCL, and it works out what to create, change or destroy. It is typically used to provision infrastructure."),
  card("auto-declarative", 3, 1, "What is the difference between a declarative and an imperative automation approach?", "Declarative describes the desired end state; imperative lists the steps to run", ["Declarative lists the steps; imperative describes the end state", "Declarative needs an agent; imperative never does", "They are different names for the same thing"],
    "Terraform and Puppet are declarative: the tool works out how to reach the state. A shell script or Ansible command list is more imperative."),
  card("auto-drift", 2, 2, "What problem does centralised automation and configuration management reduce?", "Configuration drift between devices that should be identical", ["Cable attenuation", "Radio interference", "Spanning tree loops"],
    "Manual per-device changes lead to inconsistent configs. A source-of-truth template applied by tools keeps devices consistent and auditable."),
  card("auto-json-read", 2, 0, "Given {\"vlans\": [{\"id\": 10}, {\"id\": 20}]}, what does vlans[1].id contain?", "20", ["10", "1", "vlans"],
    "JSON arrays are zero-indexed: vlans[0] is the first object (id 10) and vlans[1] is the second (id 20)."),
  card("auto-diff", 2, 3, "A config diff shows the line '- ip address 10.0.0.1 255.255.255.0' and the line '+ ip address 10.0.1.1 255.255.255.0'. What changed?", "The interface IP address was replaced by 10.0.1.1/24", ["The mask was removed", "The interface was shut down", "A new interface was added with both addresses"],
    "In a diff, '-' lines are removed and '+' lines are added, so the old address was replaced with the new one on the same interface."),
];
