import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TITLE_SNAPSHOT_REFRESH_AGE_MS,
  applyTitleSnapshot,
  mapTmdbDetailsToSnapshot,
  runTitleSnapshotRefresh,
} from "../_lib/titleSnapshotRefresh.js";

const NOW = Date.parse("2026-09-23T09:00:00.000Z");

function notFound() {
  return Object.assign(new Error("The resource you requested could not be found."), {
    statusCode: 404,
  });
}

describe("title snapshot refresh", () => {
  let rpc;
  let supabaseAdmin;
  let selected;

  beforeEach(() => {
    selected = [];
    rpc = vi.fn(async (name) => {
      if (name === "select_tmdb_title_snapshot_refreshes") {
        return { data: selected.map((tmdbId) => ({ tmdb_id: tmdbId })), error: null };
      }
      if (name === "apply_tmdb_title_snapshot") return { data: 2, error: null };
      return { data: null, error: null };
    });
    supabaseAdmin = { rpc };
  });

  const applied = () => rpc.mock.calls.filter(([name]) => name === "apply_tmdb_title_snapshot");

  it("keeps only the fields a saved row stores, in the shape it stores them", () => {
    expect(
      mapTmdbDetailsToSnapshot({
        title: "  Jaws ",
        poster_path: "/jaws.jpg",
        release_date: "1975-06-20",
        runtime: 124,
        genres: [{ id: 27, name: "Horror" }, "Thriller", { id: 1 }],
        overview: "Shark.",
        tagline: "not stored",
      })
    ).toEqual({
      title: "Jaws",
      posterPath: "/jaws.jpg",
      releaseDate: "1975-06-20",
      runtime: 124,
      genres: ["Horror", "Thriller"],
      overview: "Shark.",
    });
    // TMDB sends 0 and "" for what it does not know; neither is a value.
    expect(mapTmdbDetailsToSnapshot({ runtime: 0, release_date: "" })).toMatchObject({
      runtime: null,
      releaseDate: null,
      overview: null,
    });
  });

  it("records a title TMDB no longer has as found false with no details", async () => {
    await applyTitleSnapshot(supabaseAdmin, 7, null);

    expect(rpc).toHaveBeenCalledWith("apply_tmdb_title_snapshot", {
      p_tmdb_id: 7,
      p_found: false,
      p_title: null,
      p_poster_path: null,
      p_release_date: null,
      p_runtime: null,
      p_genres: [],
      p_overview: null,
    });
  });

  it("refreshes each selected title once and meters the requests it made", async () => {
    selected = [11, 12];
    const fetchDetails = vi.fn(async (tmdbId) => ({ title: `Movie ${tmdbId}`, runtime: 90 }));

    const stats = await runTitleSnapshotRefresh(supabaseAdmin, {
      nowFn: () => NOW,
      fetchDetails,
    });

    expect(rpc).toHaveBeenCalledWith("select_tmdb_title_snapshot_refreshes", {
      p_limit: 100,
      p_stale_before: new Date(NOW - TITLE_SNAPSHOT_REFRESH_AGE_MS).toISOString(),
    });
    expect(fetchDetails.mock.calls.map(([tmdbId]) => tmdbId)).toEqual([11, 12]);
    expect(applied().map(([, params]) => [params.p_tmdb_id, params.p_title])).toEqual([
      [11, "Movie 11"],
      [12, "Movie 12"],
    ]);
    expect(rpc).toHaveBeenCalledWith("record_service_usage", {
      p_metric: "tmdb_request",
      p_count: 2,
    });
    expect(stats).toMatchObject({ selected: 2, refreshed: 2, missing: 0, failed: 0, exhausted: true });
  });

  it("clears a title TMDB has deleted, and leaves one it merely failed on for tomorrow", async () => {
    selected = [21, 22];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchDetails = vi.fn(async (tmdbId) => {
      if (tmdbId === 21) throw notFound();
      throw Object.assign(new Error("TMDB unavailable"), { statusCode: 503 });
    });

    const stats = await runTitleSnapshotRefresh(supabaseAdmin, {
      nowFn: () => NOW,
      fetchDetails,
      concurrency: 1,
    });

    expect(applied().map(([, params]) => [params.p_tmdb_id, params.p_found])).toEqual([[21, false]]);
    expect(stats).toMatchObject({ selected: 2, refreshed: 0, missing: 1, failed: 1 });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("stops when its budget runs out, and says the queue is not empty", async () => {
    selected = [31, 32, 33];
    let now = NOW;
    const fetchDetails = vi.fn(async () => {
      now += 6_000;
      return { title: "Slow" };
    });

    const stats = await runTitleSnapshotRefresh(supabaseAdmin, {
      nowFn: () => now,
      fetchDetails,
      budgetMs: 10_000,
      concurrency: 1,
    });

    expect(fetchDetails).toHaveBeenCalledTimes(2);
    expect(stats).toMatchObject({ selected: 2, refreshed: 2, exhausted: false });
  });

  it("still clears expired copies when there is no time to fetch anything", async () => {
    selected = [41];
    const fetchDetails = vi.fn();

    const stats = await runTitleSnapshotRefresh(supabaseAdmin, {
      nowFn: () => NOW,
      fetchDetails,
      budgetMs: 0,
    });

    expect(rpc).toHaveBeenCalledWith("select_tmdb_title_snapshot_refreshes", expect.any(Object));
    expect(fetchDetails).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ selected: 0, exhausted: false });
  });

  it("surfaces a failed selection to the caller", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: new Error("function does not exist") }));

    await expect(runTitleSnapshotRefresh(supabaseAdmin, { nowFn: () => NOW })).rejects.toThrow(
      "function does not exist"
    );
  });
});
