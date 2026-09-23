import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FILTER_METADATA_DAILY_MAX_TITLES,
  claimFilterMetadataRefreshes,
  recordFilterMetadataRefreshRun,
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

  it("allows up to 300 due titles per daily run by default", () => {
    expect(FILTER_METADATA_DAILY_MAX_TITLES).toBe(300);
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

  it("records a private run report and returns the remaining backlog", async () => {
    rpc.mockResolvedValue({
      data: [{
        run_id: "30000000-0000-4000-8000-000000000001",
        remaining_stale: 14,
      }],
      error: null,
    });

    await expect(recordFilterMetadataRefreshRun(supabaseAdmin, {
      status: "completed",
      startedAt: new Date("2026-08-29T08:00:00.000Z"),
      completedAt: new Date("2026-08-29T08:00:10.000Z"),
      stats: {
        claimed: 12,
        succeeded: 11,
        failed: 1,
        exhausted: false,
        elapsedMs: 10000,
      },
    })).resolves.toEqual({
      runId: "30000000-0000-4000-8000-000000000001",
      remainingStale: 14,
    });

    expect(rpc).toHaveBeenCalledWith(
      "record_tmdb_filter_metadata_refresh_run",
      {
        p_region: "US",
        p_status: "completed",
        p_started_at: "2026-08-29T08:00:00.000Z",
        p_completed_at: "2026-08-29T08:00:10.000Z",
        p_claimed: 12,
        p_succeeded: 11,
        p_failed: 1,
        p_exhausted: false,
        p_elapsed_ms: 10000,
        p_error: null,
      }
    );
  });

  it("stores one combined metadata result", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const fetchMetadata = vi.fn(async () => ({
      certification: "R",
      providers: ["Netflix", "Tubi"],
      availability: {
        subscription: [{ id: 8, name: "Netflix" }],
        free: [],
        ads: [{ id: 10, name: "Tubi" }],
        rent: [],
        buy: [],
      },
      watchUrl: "https://www.themoviedb.org/movie/10/watch",
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
      p_provider_availability: {
        subscription: [{ id: 8, name: "Netflix" }],
        free: [],
        ads: [{ id: 10, name: "Tubi" }],
        rent: [],
        buy: [],
      },
      p_provider_watch_url: "https://www.themoviedb.org/movie/10/watch",
    });
  });

  it("refreshes the title's saved copies from the same TMDB response", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const fetchMetadata = vi.fn(async () => ({
      details: { title: "Heat", poster_path: "/heat.jpg", runtime: 170, genres: [{ name: "Crime" }] },
      certification: "R",
      providers: [],
      fetchedAt: "2026-09-23T12:00:00.000Z",
    }));

    await expect(refreshFilterMetadataClaim(supabaseAdmin, claim(10), {
      fetchMetadata,
    })).resolves.toEqual({ ok: true, tmdbId: 10 });

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_tmdb_title_snapshot", expect.objectContaining({
      p_tmdb_id: 10,
      p_found: true,
      p_title: "Heat",
      p_poster_path: "/heat.jpg",
      p_runtime: 170,
      p_genres: ["Crime"],
    }));
  });

  it("keeps a good filter refresh when saving the title's copies fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockImplementation(async (name) => (
      name === "apply_tmdb_title_snapshot"
        ? { data: null, error: new Error("function does not exist") }
        : { data: true, error: null }
    ));
    const fetchMetadata = vi.fn(async () => ({ details: { title: "Heat" }, providers: [] }));

    await expect(refreshFilterMetadataClaim(supabaseAdmin, claim(10), {
      fetchMetadata,
    })).resolves.toEqual({ ok: true, tmdbId: 10 });
    expect(rpc).not.toHaveBeenCalledWith("fail_tmdb_filter_metadata_refresh", expect.anything());
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not touch saved copies when the refresh claim was superseded", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const fetchMetadata = vi.fn(async () => ({ details: { title: "Heat" }, providers: [] }));

    await expect(refreshFilterMetadataClaim(supabaseAdmin, claim(10), {
      fetchMetadata,
    })).resolves.toEqual({ ok: false, tmdbId: 10 });
    expect(rpc).not.toHaveBeenCalledWith("apply_tmdb_title_snapshot", expect.anything());
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

  it("refreshes yesterday's batch on consecutive days while leaving recent metadata alone", async () => {
    let now = Date.parse("2026-09-09T08:59:46.620Z");
    const fetchedAtById = new Map([
      // Yesterday's batch finished seconds after today's scheduled start time.
      [10, "2026-09-08T08:59:54.995Z"],
      // Allow for an invocation nearly an hour earlier than yesterday's.
      [20, "2026-09-08T09:59:54.995Z"],
      [30, "2026-09-09T08:00:00.000Z"],
      [40, null],
    ]);
    rpc.mockImplementation(async (name, params) => {
      if (name === "claim_tmdb_filter_metadata_refreshes") {
        const due = [...fetchedAtById]
          .filter(([, fetchedAt]) => fetchedAt === null || fetchedAt < params.p_stale_before)
          .slice(0, params.p_limit)
          .map(([id]) => claim(id));
        return { data: due, error: null };
      }
      if (name === "complete_tmdb_filter_metadata_refresh") {
        fetchedAtById.set(params.p_tmdb_id, params.p_fetched_at);
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const fetchMetadata = vi.fn(async () => ({
      certification: null,
      providers: [],
      fetchedAt: new Date(now + 5_000).toISOString(),
    }));
    const options = { nowFn: () => now, fetchMetadata };

    const firstRun = await runDailyFilterMetadataRefresh(supabaseAdmin, options);
    expect(firstRun).toMatchObject({ succeeded: 3, failed: 0, exhausted: true });
    expect(fetchMetadata.mock.calls.map(([id]) => id)).toEqual([10, 20, 40]);
    expect(fetchedAtById.get(30)).toBe("2026-09-09T08:00:00.000Z");

    // A second invocation that day must not refresh the same batch again.
    expect(await runDailyFilterMetadataRefresh(supabaseAdmin, options))
      .toMatchObject({ claimed: 0, exhausted: true });

    now += 24 * 60 * 60 * 1000;
    fetchMetadata.mockClear();
    const nextRun = await runDailyFilterMetadataRefresh(supabaseAdmin, options);
    expect(nextRun).toMatchObject({ succeeded: 4, failed: 0, exhausted: true });
    expect(fetchMetadata.mock.calls.map(([id]) => id)).toEqual([10, 20, 30, 40]);
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

  it("meters the run once rather than once per title", async () => {
    rpc.mockImplementation(async (name) => {
      if (name === "claim_tmdb_filter_metadata_refreshes") {
        return { data: [claim(10), claim(20)], error: null };
      }
      return { data: true, error: null };
    });

    await runDailyFilterMetadataRefresh(supabaseAdmin, {
      fetchMetadata: vi.fn(async () => ({
        certification: null,
        providers: [],
        fetchedAt: "2026-08-28T12:00:00.000Z",
      })),
      maxTitles: 2,
      batchSize: 2,
    });

    const usageCalls = rpc.mock.calls.filter(([name]) => name === "record_service_usage");
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0][1]).toEqual({ p_metric: "tmdb_request", p_count: 2 });
  });

  it("still meters the batches already fetched when a later claim fails", async () => {
    let claimCalls = 0;
    rpc.mockImplementation(async (name) => {
      if (name === "claim_tmdb_filter_metadata_refreshes") {
        claimCalls += 1;
        if (claimCalls === 1) return { data: [claim(10), claim(20)], error: null };
        return { data: null, error: { message: "claim failed" } };
      }
      return { data: true, error: null };
    });

    await expect(runDailyFilterMetadataRefresh(supabaseAdmin, {
      fetchMetadata: vi.fn(async () => ({
        certification: null,
        providers: [],
        fetchedAt: "2026-08-28T12:00:00.000Z",
      })),
      maxTitles: 4,
      batchSize: 2,
    })).rejects.toEqual({ message: "claim failed" });

    const usageCalls = rpc.mock.calls.filter(([name]) => name === "record_service_usage");
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0][1]).toEqual({ p_metric: "tmdb_request", p_count: 2 });
  });

  it("completes the run even when the meter is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockImplementation(async (name) => {
      if (name === "claim_tmdb_filter_metadata_refreshes") {
        return { data: [claim(10)], error: null };
      }
      if (name === "record_service_usage") {
        throw new Error("counters unavailable");
      }
      return { data: true, error: null };
    });

    const stats = await runDailyFilterMetadataRefresh(supabaseAdmin, {
      fetchMetadata: vi.fn(async () => ({
        certification: null,
        providers: [],
        fetchedAt: "2026-08-28T12:00:00.000Z",
      })),
      maxTitles: 1,
      batchSize: 1,
    });

    expect(stats).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
  });
});
