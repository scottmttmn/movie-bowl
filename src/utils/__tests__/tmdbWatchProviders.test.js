import { describe, expect, it } from "vitest";
import {
  createEmptyStreamingProviderData,
  normalizeStoredProviderData,
  normalizeTmdbWatchProviders,
} from "../tmdbWatchProviders";

describe("tmdbWatchProviders", () => {
  it("keeps monetization groups while only making included providers eligible", () => {
    const result = normalizeTmdbWatchProviders(
      {
        results: {
          US: {
            link: "https://www.themoviedb.org/movie/77/watch",
            flatrate: [
              { provider_id: 8, provider_name: "netflix", logo_path: "/netflix.jpg", display_priority: 2 },
            ],
            free: [
              { provider_id: 9, provider_name: "Kanopy", logo_path: "/kanopy.jpg", display_priority: 4 },
            ],
            ads: [
              { provider_id: 10, provider_name: "Tubi", logo_path: "/tubi.jpg", display_priority: 5 },
            ],
            rent: [
              { provider_id: 2, provider_name: "Apple TV", logo_path: "/apple.jpg", display_priority: 1 },
            ],
            buy: [
              { provider_id: 3, provider_name: "Amazon Video", logo_path: "/amazon.jpg", display_priority: 3 },
            ],
          },
        },
      },
      { region: "us", fetchedAt: "2026-09-16T00:00:00.000Z" }
    );

    expect(result.providers).toEqual(["Netflix", "Kanopy", "Tubi"]);
    expect(result.availability.subscription[0]).toMatchObject({ id: 8, name: "netflix" });
    expect(result.availability.free[0]).toMatchObject({ id: 9, name: "Kanopy" });
    expect(result.availability.ads[0]).toMatchObject({ id: 10, name: "Tubi" });
    expect(result.availability.rent[0]).toMatchObject({ id: 2, name: "Apple TV" });
    expect(result.availability.buy[0]).toMatchObject({ id: 3, name: "Amazon Video" });
    expect(result.providers).not.toContain("Apple TV+");
    expect(result.watchUrl).toBe("https://www.themoviedb.org/movie/77/watch");
    expect(result.providerLogos).toEqual({
      Netflix: "/netflix.jpg",
      Kanopy: "/kanopy.jpg",
      Tubi: "/tubi.jpg",
    });
  });

  it("deduplicates providers within a group by TMDB id", () => {
    const result = normalizeTmdbWatchProviders({
      results: {
        US: {
          flatrate: [
            { provider_id: 8, provider_name: "Netflix" },
            { provider_id: 8, provider_name: "Netflix duplicate" },
          ],
        },
      },
    });

    expect(result.availability.subscription).toHaveLength(1);
    expect(result.providers).toEqual(["Netflix"]);
  });

  it("keeps legacy flattened cache rows usable", () => {
    const result = normalizeStoredProviderData({
      providers: ["netflix", "HBO Max"],
      region: "US",
      fetchedAt: "2026-08-27T00:00:00.000Z",
    });

    expect(result.providers).toEqual(["Netflix", "Max"]);
    expect(result.availability.subscription).toEqual([]);
  });

  it("creates a complete empty contract", () => {
    expect(createEmptyStreamingProviderData("ca", { status: "failed" })).toEqual({
      region: "CA",
      providers: [],
      providerLogos: {},
      availability: {
        subscription: [],
        free: [],
        ads: [],
        rent: [],
        buy: [],
      },
      watchUrl: null,
      fetchedAt: null,
      status: "failed",
    });
  });
});
