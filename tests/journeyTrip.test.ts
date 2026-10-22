import { describe, expect, it } from "vitest";
import { TRIP_NODES, tripSteps, waypoints } from "@/game/engine/journeyTrip";
import { JOURNEY_IDS, journeyRtts } from "@/lib/net/journey";
import { lessonsFor } from "@/content/lessons";

describe("animated URL journey", () => {
  const steps = tripSteps();
  it("has one step per journey stage, in order", () => {
    expect(steps.map((s) => s.id)).toEqual(JOURNEY_IDS);
  });
  it("round trips add up to a cold load whose resolver already knows the name", () => {
    const total = steps.reduce((n, s) => n + s.rtts, 0);
    expect(total).toBe(journeyRtts("answer", "tcp-tls13").total);
    expect(total).toBe(4);
  });
  it("off-link traffic always goes through the router", () => {
    for (const s of steps) {
      if (s.path.includes("resolver") || s.path.includes("server")) expect(s.path).toContain("router");
    }
  });
  it("waypoints go there and back for replies, one way otherwise", () => {
    const dns = steps.find((s) => s.id === "dns")!;
    expect(waypoints(dns).map((i) => TRIP_NODES[i])).toEqual(["laptop", "router", "resolver", "router", "laptop"]);
    const resp = steps.find((s) => s.id === "response")!;
    expect(waypoints(resp).map((i) => TRIP_NODES[i])).toEqual(["server", "router", "laptop"]);
    expect(waypoints(steps[0])).toEqual([0]);
  });
  it("is linked from the gym 8 journey lesson", () => {
    expect(lessonsFor(8).find((l) => l.id === "url-journey")?.tool?.href).toBe("/url");
  });
});
