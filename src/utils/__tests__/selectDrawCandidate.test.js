import { describe, expect, it, vi } from "vitest";
import { selectDrawCandidate } from "../selectDrawCandidate";

const REMAINING = [
  { id: "m1", tmdb_id: 101, title: "Movie A" },
  { id: "m2", tmdb_id: 202, title: "Movie B" },
  { id: "m3", tmdb_id: 303, title: "Movie C" },
];

describe("selectDrawCandidate", () => {
  it("draws randomly from all titles when prioritize is off", async () => {
    const fetchProviders = vi.fn(async () => ({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    }));

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: false,
      userStreamingServices: ["Netflix"],
      fetchProviders,
      randomFn: () => 0.7,
    });

    expect(selected.movie.id).toBe("m3");
    expect(fetchProviders).toHaveBeenCalledTimes(1);
    expect(fetchProviders).toHaveBeenCalledWith(303);
  });

  it("draws from matching titles when prioritize is on and matches exist", async () => {
    const fetchProviders = vi.fn(async (tmdbId) => {
      if (tmdbId === 101) return { providers: ["Netflix"], region: "US", fetchedAt: null };
      if (tmdbId === 202) return { providers: ["Hulu"], region: "US", fetchedAt: null };
      return { providers: ["Max"], region: "US", fetchedAt: null };
    });

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: true,
      userStreamingServices: ["hulu", "disney+"],
      fetchProviders,
      randomFn: () => 0.2,
    });

    expect(selected.movie.id).toBe("m2");
    expect(selected.providers).toEqual(["Hulu"]);
    expect(fetchProviders).toHaveBeenCalledTimes(3);
  });

  it("prioritizes by service rank before randomizing", async () => {
    const fetchProviders = vi.fn(async (tmdbId) => {
      if (tmdbId === 101) return { providers: ["Netflix"], region: "US", fetchedAt: null };
      if (tmdbId === 202) return { providers: ["Hulu"], region: "US", fetchedAt: null };
      return { providers: ["Netflix", "Hulu"], region: "US", fetchedAt: null };
    });

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: true,
      userStreamingServices: ["Hulu", "Netflix"],
      fetchProviders,
      randomFn: () => 0.9,
    });

    expect(["m2", "m3"]).toContain(selected.movie.id);
  });

  it("uses highest-ranked matching service when movie has multiple providers", async () => {
    const fetchProviders = vi.fn(async (tmdbId) => {
      if (tmdbId === 101) return { providers: ["Netflix", "Hulu"], region: "US", fetchedAt: null };
      if (tmdbId === 202) return { providers: ["Netflix"], region: "US", fetchedAt: null };
      return { providers: ["Max"], region: "US", fetchedAt: null };
    });

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: true,
      userStreamingServices: ["Hulu", "Netflix"],
      fetchProviders,
      randomFn: () => 0,
    });

    expect(selected.movie.id).toBe("m1");
  });

  it("falls back to all titles when prioritize is on but no matches exist", async () => {
    const fetchProviders = vi.fn(async (tmdbId) => {
      if (tmdbId === 101) return { providers: ["Max"], region: "US", fetchedAt: null };
      if (tmdbId === 202) return { providers: ["Peacock"], region: "US", fetchedAt: null };
      return { providers: ["Paramount+"], region: "US", fetchedAt: null };
    });

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: true,
      userStreamingServices: ["Netflix"],
      fetchProviders,
      randomFn: () => 0.34,
    });

    expect(selected.movie.id).toBe("m2");
    expect(fetchProviders).toHaveBeenCalledTimes(3);
  });

  it("can ignore ranking and draw from any matched service when configured", async () => {
    const fetchProviders = vi.fn(async (tmdbId) => {
      if (tmdbId === 101) return { providers: ["Netflix"], region: "US", fetchedAt: null };
      if (tmdbId === 202) return { providers: ["Hulu"], region: "US", fetchedAt: null };
      return { providers: ["Max"], region: "US", fetchedAt: null };
    });

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: true,
      prioritizeByServiceRank: false,
      userStreamingServices: ["Hulu", "Netflix"],
      fetchProviders,
      randomFn: () => 0,
    });

    expect(["m1", "m2"]).toContain(selected.movie.id);
  });

  it("falls back to all titles when prioritize is on but user has no services", async () => {
    const fetchProviders = vi.fn(async () => ({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    }));

    const selected = await selectDrawCandidate(REMAINING, {
      prioritizeByServices: true,
      userStreamingServices: [],
      fetchProviders,
      randomFn: () => 0,
    });

    expect(selected.movie.id).toBe("m1");
    expect(fetchProviders).toHaveBeenCalledTimes(1);
    expect(fetchProviders).toHaveBeenCalledWith(101);
  });
});
