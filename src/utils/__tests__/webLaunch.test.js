import { describe, expect, it } from "vitest";
import { resolvePreferredWebLaunchCandidate } from "../webLaunch";

describe("resolvePreferredWebLaunchCandidate", () => {
  it("picks the highest-ranked matching provider with a known web mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix", "Hulu"],
      movieProviders: ["Hulu", "Netflix"],
      title: "Dune",
      year: "2021",
    });

    expect(result).toEqual({
      serviceName: "Netflix",
      url: "https://www.netflix.com/search?q=Dune%202021",
    });
  });

  it("falls back to the next ranked matching service when top one has no mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI", "Hulu"],
      movieProviders: ["MUBI", "Hulu"],
      title: "Parasite",
      year: "2019",
    });

    expect(result).toEqual({
      serviceName: "Hulu",
      url: "https://www.hulu.com/search?q=Parasite%202019",
    });
  });

  it("returns null when no mapped provider match exists", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI"],
      movieProviders: ["MUBI"],
      title: "The Fall",
      year: "2006",
    });

    expect(result).toBeNull();
  });

  it("returns null when title is missing", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix"],
      movieProviders: ["Netflix"],
      title: "",
      year: "2021",
    });

    expect(result).toBeNull();
  });
});
