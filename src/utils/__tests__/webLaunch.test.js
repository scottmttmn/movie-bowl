import { describe, expect, it } from "vitest";
import { resolvePreferredWebLaunchCandidate } from "../webLaunch";

describe("resolvePreferredWebLaunchCandidate", () => {
  it("picks the highest-ranked matching provider with a known web mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix", "Hulu"],
      movieProviders: ["Hulu", "Netflix"],
      title: "Dune",
    });

    expect(result).toEqual({
      serviceName: "Netflix",
      url: "https://www.netflix.com/search?q=Dune",
    });
  });

  it("falls back to the next ranked matching service when top one has no mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI", "Hulu"],
      movieProviders: ["MUBI", "Hulu"],
      title: "Parasite",
    });

    expect(result).toEqual({
      serviceName: "Hulu",
      url: "https://www.hulu.com/search?q=Parasite",
    });
  });

  it("sends Max a title-only search query", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Max"],
      movieProviders: ["Max"],
      title: "The Batman",
    });

    expect(result).toEqual({
      serviceName: "Max",
      url: "https://play.max.com/search?q=The%20Batman",
    });
  });

  it("returns null when no mapped provider match exists", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI"],
      movieProviders: ["MUBI"],
      title: "The Fall",
    });

    expect(result).toBeNull();
  });

  it("returns null when title is missing", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix"],
      movieProviders: ["Netflix"],
      title: "",
    });

    expect(result).toBeNull();
  });
});
