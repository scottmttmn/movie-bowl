import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTmdbMovieProviders: vi.fn(),
}));

vi.mock("../tmdbApi", () => ({
  getTmdbMovieProviders: mocks.getTmdbMovieProviders,
}));

import {
  clearStreamingProvidersCache,
  fetchStreamingProviders,
} from "../streamingProviders";

describe("streamingProviders", () => {
  beforeEach(() => {
    clearStreamingProvidersCache();
    mocks.getTmdbMovieProviders.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearStreamingProvidersCache();
  });

  it("returns an empty payload when no tmdb id is provided", async () => {
    await expect(fetchStreamingProviders(null)).resolves.toEqual({
      region: "US",
      providers: [],
      fetchedAt: null,
    });
    expect(mocks.getTmdbMovieProviders).not.toHaveBeenCalled();
  });

  it("normalizes providers and caches successful responses", async () => {
    mocks.getTmdbMovieProviders.mockResolvedValue({
      results: {
        US: {
          flatrate: [
            { provider_name: "netflix" },
            { provider_name: "HBO Max" },
          ],
          ads: [
            { provider_name: "hbo max" },
            { provider_name: "Tubi" },
          ],
        },
      },
    });

    const first = await fetchStreamingProviders(101);
    const second = await fetchStreamingProviders(101);

    expect(first.region).toBe("US");
    expect(first.providers).toEqual(["Netflix", "Max", "Tubi"]);
    expect(typeof first.fetchedAt).toBe("string");
    expect(second).toEqual(first);
    expect(mocks.getTmdbMovieProviders).toHaveBeenCalledTimes(1);
  });

  it("scopes cache keys by region", async () => {
    mocks.getTmdbMovieProviders.mockResolvedValue({
      results: {
        US: { flatrate: [{ provider_name: "Netflix" }] },
        CA: { flatrate: [{ provider_name: "Crave" }] },
      },
    });

    const us = await fetchStreamingProviders(101, { region: "US" });
    const ca = await fetchStreamingProviders(101, { region: "CA" });

    expect(us.providers).toEqual(["Netflix"]);
    expect(ca.providers).toEqual(["Crave"]);
    expect(mocks.getTmdbMovieProviders).toHaveBeenCalledTimes(2);
  });

  it("deduplicates inflight requests for the same key", async () => {
    let resolveRequest;
    mocks.getTmdbMovieProviders.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    const firstPromise = fetchStreamingProviders(101);
    const secondPromise = fetchStreamingProviders(101);

    expect(mocks.getTmdbMovieProviders).toHaveBeenCalledTimes(1);

    resolveRequest({
      results: {
        US: { flatrate: [{ provider_name: "Netflix" }] },
      },
    });

    await expect(Promise.all([firstPromise, secondPromise])).resolves.toEqual([
      expect.objectContaining({ providers: ["Netflix"] }),
      expect.objectContaining({ providers: ["Netflix"] }),
    ]);
  });

  it("bypasses cache when requested", async () => {
    mocks.getTmdbMovieProviders
      .mockResolvedValueOnce({
        results: {
          US: { flatrate: [{ provider_name: "Netflix" }] },
        },
      })
      .mockResolvedValueOnce({
        results: {
          US: { flatrate: [{ provider_name: "Hulu" }] },
        },
      });

    const first = await fetchStreamingProviders(101);
    const second = await fetchStreamingProviders(101, { bypassCache: true });

    expect(first.providers).toEqual(["Netflix"]);
    expect(second.providers).toEqual(["Hulu"]);
    expect(mocks.getTmdbMovieProviders).toHaveBeenCalledTimes(2);
  });

  it("returns a safe fallback and logs when the provider request fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getTmdbMovieProviders.mockRejectedValue(new Error("network"));

    await expect(fetchStreamingProviders(101, { region: "CA" })).resolves.toEqual({
      region: "CA",
      providers: [],
      fetchedAt: null,
    });

    expect(errorSpy).toHaveBeenCalled();
  });
});
