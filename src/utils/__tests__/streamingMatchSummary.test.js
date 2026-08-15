import { describe, expect, it } from "vitest";
import { describeStreamingMatch } from "../streamingMatchSummary";

describe("describeStreamingMatch", () => {
  it("states the count without claiming a filter when prioritizing is off", () => {
    const summary = describeStreamingMatch({ matchCount: 8, isPrioritized: false });

    expect(summary.tone).toBe("idle");
    expect(summary.text).toBe("8 on your services");
    expect(summary.label).toMatch(/not filtered by them/i);
  });

  it("reports the ranked pool rather than every match", () => {
    const summary = describeStreamingMatch({
      matchCount: 8,
      topService: "Netflix",
      topServiceCount: 5,
      isPrioritized: true,
      useServiceRank: true,
    });

    expect(summary.tone).toBe("active");
    expect(summary.text).toBe("Favoring 5 on Netflix");
  });

  it("reports every match when ranking is off", () => {
    const summary = describeStreamingMatch({
      matchCount: 8,
      topService: "Netflix",
      topServiceCount: 5,
      isPrioritized: true,
      useServiceRank: false,
    });

    expect(summary.text).toBe("Favoring 8 on your services");
  });

  it("warns that the draw falls back when nothing matches", () => {
    const summary = describeStreamingMatch({ matchCount: 0, isPrioritized: true });

    expect(summary.tone).toBe("warning");
    expect(summary.text).toBe("No matches — drawing from all");
    expect(summary.count).toBeNull();
  });
});
