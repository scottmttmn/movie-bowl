import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimFilterMetadataRefreshes,
  refreshFilterMetadataClaim,
  runDailyFilterMetadataRefresh,
} from "../_lib/filterMetadataRefresh.js";

function claim(tmdbId) {
  return {
    tmdb_id: tmdbId,
    region: "US",
    refresh_token: `token-${tmdbId}`,
  };
}

describe("filter metadata refresh worker", () => {
  let rpc;
  let supabaseAdmin;

  beforeEach(() => {
    rpc = vi.fn();
    supabaseAdmin = { rpc };
  });

  it("claims due titles with the requested membership scope", async () => {
    rpc.mockResolvedValue({ data: [claim(10)], error: null });

    await expect(claimFilterMetadataRefreshes(supabaseAdmin, {
      limit: 1,
      region: "US",
      staleBefore: "2026-08-27T00:00:00.000Z",
      tmdbId: 10,
      bowlId: "10000000-0000-4000-8000-000000000001",
      userId: "20000000-0000-4000-8000-000000000001",
    })).resolves.toEqual([claim(10)]);

    expect(rpc).toHaveBeenCalledWith("claim_tmdb_filter_metadata_refreshes", {
      p_limit: 1,
      p_region: "US",
      p_stale_before: "2026-08-27T00:00:00.000Z",
      p_tmdb_id: 10,
      p_bowl_id: "10000000-0000-4000-8000-000000000001",
      p_user_id: "20000000-0000-4000-8000-000000000001",
    });
  });

  it("stores one combined metadata result", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const fetchMetadata = vi.fn(async () => ({
      certification: "R",
      providers: ["Netflix", "Tubi"],
      fetchedAt: "2026-08-28T12:00:00.000Z",
    }));

    await expect(refreshFilterMetadataClaim(supabaseAdmin, claim(10), {
      fetchMetadata,
    })).resolves.toEqual({ ok: true, tmdbId: 10 });

    expect(fetchMetadata).toHaveBeenCalledWith(10, {
      region: "US",
      signal: undefined,
    });
    expect(rpc).toHaveBeenCalledWith("complete_tmdb_filter_metadata_refresh", {
      p_tmdb_id: 10,
      p_region: "US",
      p_refresh_token: "token-10",
      p_certification: "R",
      p_providers: ["Netflix", "Tubi"],
      p_fetched_at: "2026-08-28T12:00:00.000Z",
    });
  });

  it("records a retry without discarding the last good snapshot", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: true, error: null });
    const fetchMetadata = vi.fn(async () => {
      throw new Error("TMDB unavailable");
    });

    await expect(refreshFilterMetadataClaim(supabaseAdmin, claim(10), {
      fetchMetadata,
    })).resolves.toEqual({ ok: false, tmdbId: 10 });

    expect(rpc).toHaveBeenCalledWith("fail_tmdb_filter_metadata_refresh", {
      p_tmdb_id: 10,
      p_region: "US",
      p_refresh_token: "token-10",
      p_error: "TMDB unavailable",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("uses bounded batches and stops when the due queue is empty", async () => {
    let claimCallCount = 0;
    rpc.mockImplementation(async (name) => {
      if (name === "claim_tmdb_filter_metadata_refreshes") {
        claimCallCount += 1;
        return claimCallCount === 1
          ? { data: [claim(10), claim(20), claim(30)], error: null }
          : { data: [], error: null };
      }
      return { data: true, error: null };
    });
    let active = 0;
    let maxActive = 0;
    const fetchMetadata = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { certification: null, providers: [], fetchedAt: "2026-08-28T12:00:00.000Z" };
    });

    const stats = await runDailyFilterMetadataRefresh(supabaseAdmin, {
      fetchMetadata,
      maxTitles: 10,
      batchSize: 3,
      concurrency: 2,
    });

    expect(stats).toMatchObject({
      claimed: 3,
      succeeded: 3,
      failed: 0,
      exhausted: true,
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(claimCallCount).toBe(2);
  });
});
