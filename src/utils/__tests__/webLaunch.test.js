import { describe, expect, it } from "vitest";
import { buildVoiceHandoffCommand, resolvePreferredLaunchTarget, resolvePreferredWebLaunchCandidate } from "../webLaunch";

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

describe("resolvePreferredLaunchTarget", () => {
  const options = { userServices: ["Netflix", "Hulu"], movieProviders: ["Hulu", "Netflix"], title: "Arrival" };
  const netflix = { service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123", androidUrl: "nflx://title/123" };
  it("prefers a title URL and carries optional native destinations", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [netflix] })).toEqual({
      serviceName: "Netflix", url: netflix.webUrl, linkType: "title", deepLinks: { ios: null, android: netflix.androidUrl },
    });
  });
  it.each(["rent", "buy", "tve"])("does not launch a %s source or switch service priority", (type) => {
    const result = resolvePreferredLaunchTarget({ ...options, providerLinks: [
      { ...netflix, type }, { service: "Hulu", type: "sub", webUrl: "https://www.hulu.com/movie/arrival" },
    ] });
    expect(result).toMatchObject({ serviceName: "Netflix", linkType: "search", url: "https://www.netflix.com/search?q=Arrival" });
  });
  it("does not choose a lower-ranked service just because it has a link", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, service: "Hulu" }] })).toMatchObject({ serviceName: "Netflix", linkType: "search" });
  });
  it("allows free sources and normalizes service names", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, service: "netflix", type: "free" }] }).linkType).toBe("title");
  });
  it("preserves the old empty and unknown-service behavior", () => {
    expect(resolvePreferredLaunchTarget(options)).toMatchObject(resolvePreferredWebLaunchCandidate(options));
    expect(resolvePreferredLaunchTarget({ ...options, title: "" })).toBeNull();
    expect(resolvePreferredLaunchTarget({ ...options, movieProviders: ["Unknown"] })).toBeNull();
  });
  it("rejects executable URLs and builds voice copy from the same chosen service", () => {
    const result = resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, webUrl: "javascript:alert(1)" }] });
    expect(result.linkType).toBe("search");
    expect(buildVoiceHandoffCommand(" Arrival ", result)).toBe("Play Arrival on Netflix");
    expect(buildVoiceHandoffCommand("Arrival", null)).toBe("");
  });
});
