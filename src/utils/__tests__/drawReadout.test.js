import { describe, expect, it } from "vitest";
import { getDrawReadout } from "../drawReadout";
import { STREAMING_MATCH_STATUS } from "../streamingMatchSummary";

const resolved = {
  streamingStatus: STREAMING_MATCH_STATUS.ready,
  isPrioritized: true,
};

describe("getDrawReadout", () => {
  it("counts the whole bowl when nothing has narrowed it", () => {
    expect(getDrawReadout({ poolTotalCount: 12 })).toEqual({
      count: 12,
      service: null,
      fellBack: false,
      tone: "idle",
    });
  });

  it("counts the filtered pool once the filters have resolved", () => {
    const readout = getDrawReadout({ isFiltered: true, poolCount: 4, poolTotalCount: 12 });

    expect(readout.count).toBe(4);
    expect(readout.tone).toBe("active");
  });

  it("lets the top-ranked service own the count, so the pool is not printed twice", () => {
    const readout = getDrawReadout({
      ...resolved,
      isFiltered: true,
      poolCount: 8,
      streamingMatchCount: 5,
      streamingTopService: "Max",
      streamingTopServiceCount: 3,
    });

    expect(readout).toMatchObject({ count: 3, service: "Max", tone: "active" });
  });

  it("counts every match when the services are not ranked", () => {
    const readout = getDrawReadout({
      ...resolved,
      isFiltered: true,
      poolCount: 8,
      useServiceRank: false,
      streamingMatchCount: 5,
      streamingTopService: "Max",
      streamingTopServiceCount: 3,
    });

    expect(readout).toMatchObject({ count: 5, service: null });
  });

  // A preference that is engaged and changing nothing should not look settled.
  it("warns when streaming priority matched nothing and the draw fell back", () => {
    const readout = getDrawReadout({
      ...resolved,
      isFiltered: true,
      poolCount: 8,
      poolTotalCount: 12,
      streamingMatchCount: 0,
    });

    expect(readout).toMatchObject({ count: 8, service: null, fellBack: true, tone: "warning" });
  });

  it("does not treat priority as engaged before the services have resolved", () => {
    const readout = getDrawReadout({
      isPrioritized: true,
      streamingStatus: STREAMING_MATCH_STATUS.unavailable,
      poolTotalCount: 12,
      streamingMatchCount: 0,
    });

    expect(readout).toMatchObject({ count: 12, fellBack: false, tone: "idle" });
  });

  it("warns whenever contributors are excluded, however settled the count looks", () => {
    const readout = getDrawReadout({
      ...resolved,
      isFiltered: true,
      poolCount: 8,
      streamingMatchCount: 5,
      streamingTopService: "Max",
      streamingTopServiceCount: 3,
      hasExcludedContributors: true,
    });

    expect(readout).toMatchObject({ count: 3, service: "Max", tone: "warning" });
  });
});
