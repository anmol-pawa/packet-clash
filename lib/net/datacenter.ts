/**
 * Datacenter and cloud networking (ROADMAP 5.5): oversubscription, leaf-spine and fat-tree
 * sizing, VXLAN overhead, cloud VPC address maths, Kubernetes pod CIDR splits and NAT port limits.
 */

/** Oversubscription ratio = downlink capacity / uplink capacity of a switch (1 means non-blocking). */
export function oversubscription(downPorts: number, downGbps: number, upPorts: number, upGbps: number): number {
  return (downPorts * downGbps) / (upPorts * upGbps);
}

/**
 * Two-tier leaf-spine: each leaf has `leafPorts` ports, `spines` of them going up (one per spine),
 * the rest down to servers. Each spine has `spinePorts` ports, one per leaf.
 */
export function leafSpine(leafPorts: number, spines: number, spinePorts: number) {
  const downPerLeaf = leafPorts - spines;
  const leaves = spinePorts;
  return { downPerLeaf, leaves, servers: downPerLeaf * leaves, pathsBetweenLeaves: spines };
}

/** k-ary fat tree (k even): k pods, (k/2)² core switches, k³/4 hosts, 5k²/4 switches, full bisection. */
export function fatTree(k: number) {
  return { hosts: (k * k * k) / 4, switches: (5 * k * k) / 4, core: (k * k) / 4, pods: k };
}

/**
 * Outer IP packet size needed to carry an inner IP packet of `innerMtu` over VXLAN:
 * inner Ethernet header (14) + VXLAN (8) + outer UDP (8) + outer IPv4 (20) = +50 bytes.
 */
export function vxlanUnderlayMtu(innerMtu: number): number {
  return innerMtu + 14 + 8 + 8 + 20;
}

/** Largest inner IP MTU that fits an underlay of `underlayMtu` after VXLAN encapsulation. */
export function vxlanInnerMtu(underlayMtu: number): number {
  return underlayMtu - 50;
}

/** VXLAN network identifier space: 24 bits. */
export const VXLAN_VNIS = 2 ** 24;

/** Usable IPv4 addresses in a cloud VPC subnet: the provider reserves 5 (network, router, DNS, future, broadcast). */
export function cloudUsableIps(prefix: number): number {
  return 2 ** (32 - prefix) - 5;
}

/** Nodes a cluster CIDR can serve when each node gets a pod CIDR of `nodePrefix`. */
export function podCidrNodes(clusterPrefix: number, nodePrefix: number): number {
  return 2 ** (nodePrefix - clusterPrefix);
}

/** Pod addresses per node block (network and broadcast excluded). */
export function podIpsPerNode(nodePrefix: number): number {
  return 2 ** (32 - nodePrefix) - 2;
}

/** Concurrent flows to one destination IP:port through a NAT: one source port per flow, per public IP. */
export function natFlows(publicIps: number, portLow = 1024, portHigh = 65535): number {
  return publicIps * (portHigh - portLow + 1);
}
