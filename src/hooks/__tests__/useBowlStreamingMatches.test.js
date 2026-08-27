import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useBowlStreamingMatches, {
  AUTO_SCAN_TITLE_LIMIT,
  STREAMING_MATCH_STATUS,
} from "../useBowlStreamingMatches";

function createFetchProviders(providersByTmdbId) {
  return vi.fn(async (tmdbId) => ({
    providers: providersByTmdbId[tmdbId] || [],
    region: "US",
    fetchedAt: null,
  }));
}

function buildMovies(count, startId = 1000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    tmdb_id: startId + index,
  }));
}

describe("useBowlStreamingMatches", () => {
  it("stays unavailable and issues no lookups without saved services", async () => {
    const fetchProviders = createFetchProviders({ 101: ["Netflix"] });

    const { result } = renderHook(() =>
      useBowlStreamingMatches([{ id: "m1", tmdb_id: 101 }], [], { fetchProviders })
    );

    expect(result.current.status).toBe(STREAMING_MATCH_STATUS.unavailable);
    expect(fetchProviders).not.toHaveBeenCalled();
  });

  it("counts titles available on the user's services", async () => {
    const fetchProviders = createFetchProviders({
      101: ["Netflix", "Peacock"],
      102: ["Paramount+"],
      103: ["hbo max"],
    });

    const { result } = renderHook(() =>
      useBowlStreamingMatches(
        [
          { id: "m1", tmdb_id: 101 },
          { id: "m2", tmdb_id: 102 },
          { id: "m3", tmdb_id: 103 },
        ],
        ["Netflix", "Max"],
        { fetchProviders }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(result.current.matchCount).toBe(2);
  });

  it("waits for a tap on a small bowl when automatic scanning is disabled", async () => {
    const fetchProviders = createFetchProviders({ 101: ["Netflix"] });
    const { result } = renderHook(() =>
      useBowlStreamingMatches(
        [{ id: "m1", tmdb_id: 101 }],
        ["Netflix"],
        { fetchProviders, autoScan: false }
      )
    );

    expect(result.current.status).toBe(STREAMING_MATCH_STATUS.manual);
    expect(fetchProviders).not.toHaveBeenCalled();

    act(() => result.current.scan());

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(fetchProviders).toHaveBeenCalledTimes(1);
  });

  it("does not scan while another resolver owns the streaming result", () => {
    const fetchProviders = createFetchProviders({ 101: ["Netflix"] });
    const { result } = renderHook(() =>
      useBowlStreamingMatches(
        [{ id: "m1", tmdb_id: 101 }],
        ["Netflix"],
        { fetchProviders, enabled: false }
      )
    );

    expect(result.current.status).toBe(STREAMING_MATCH_STATUS.unavailable);
    expect(fetchProviders).not.toHaveBeenCalled();
  });

  it("reports the highest-ranked matching service as the ranked draw pool", async () => {
    const fetchProviders = createFetchProviders({
      101: ["Netflix"],
      102: ["Netflix", "Max"],
      103: ["Max"],
      104: ["Paramount+"],
    });

    const { result } = renderHook(() =>
      useBowlStreamingMatches(
        [
          { id: "m1", tmdb_id: 101 },
          { id: "m2", tmdb_id: 102 },
          { id: "m3", tmdb_id: 103 },
          { id: "m4", tmdb_id: 104 },
        ],
        ["Netflix", "Max"],
        { fetchProviders }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(result.current.matchCount).toBe(3);
    expect(result.current.topService).toBe("Netflix");
    expect(result.current.topServiceCount).toBe(2);
  });

  it("falls back to the next ranked service when the top one matches nothing", async () => {
    const fetchProviders = createFetchProviders({ 101: ["Max"] });

    const { result } = renderHook(() =>
      useBowlStreamingMatches([{ id: "m1", tmdb_id: 101 }], ["Netflix", "Max"], { fetchProviders })
    );

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(result.current.topService).toBe("Max");
    expect(result.current.topServiceCount).toBe(1);
  });

  it("reports no top service when nothing matches", async () => {
    const fetchProviders = createFetchProviders({ 101: ["Paramount+"] });

    const { result } = renderHook(() =>
      useBowlStreamingMatches([{ id: "m1", tmdb_id: 101 }], ["Netflix"], { fetchProviders })
    );

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(result.current.matchCount).toBe(0);
    expect(result.current.topService).toBeNull();
    expect(result.current.topServiceCount).toBe(0);
  });

  it("skips custom movies carrying a negative tmdb id", async () => {
    const fetchProviders = createFetchProviders({ 101: ["Netflix"] });

    const { result } = renderHook(() =>
      useBowlStreamingMatches(
        [
          { id: "m1", tmdb_id: 101 },
          { id: "m2", tmdb_id: -55123 },
        ],
        ["Netflix"],
        { fetchProviders }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(result.current.eligibleCount).toBe(1);
    expect(fetchProviders).toHaveBeenCalledTimes(1);
    expect(fetchProviders).toHaveBeenCalledWith(101, { region: "US" });
  });

  it("is unavailable when no title can be looked up", async () => {
    const fetchProviders = createFetchProviders({});

    const { result } = renderHook(() =>
      useBowlStreamingMatches([{ id: "m1", tmdb_id: -12 }], ["Netflix"], { fetchProviders })
    );

    expect(result.current.status).toBe(STREAMING_MATCH_STATUS.unavailable);
    expect(fetchProviders).not.toHaveBeenCalled();
  });

  it("waits for an explicit scan on bowls past the auto-scan limit", async () => {
    const movies = buildMovies(AUTO_SCAN_TITLE_LIMIT + 1);
    const fetchProviders = createFetchProviders({ 1000: ["Netflix"] });

    const { result } = renderHook(() =>
      useBowlStreamingMatches(movies, ["Netflix"], { fetchProviders })
    );

    expect(result.current.status).toBe(STREAMING_MATCH_STATUS.manual);
    expect(fetchProviders).not.toHaveBeenCalled();

    act(() => {
      result.current.scan();
    });

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));
    expect(result.current.matchCount).toBe(1);
    expect(fetchProviders).toHaveBeenCalledTimes(movies.length);
  });

  it("returns to a manual scan when the service list changes on a large bowl", async () => {
    const movies = buildMovies(AUTO_SCAN_TITLE_LIMIT + 1);
    const fetchProviders = createFetchProviders({ 1000: ["Netflix"] });

    const { result, rerender } = renderHook(
      ({ services }) => useBowlStreamingMatches(movies, services, { fetchProviders }),
      { initialProps: { services: ["Netflix"] } }
    );

    act(() => {
      result.current.scan();
    });
    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.ready));

    rerender({ services: ["Netflix", "Hulu"] });

    await waitFor(() => expect(result.current.status).toBe(STREAMING_MATCH_STATUS.manual));
  });

  it("recounts when the bowl contents change", async () => {
    const fetchProviders = createFetchProviders({
      101: ["Netflix"],
      102: ["Netflix"],
    });

    const { result, rerender } = renderHook(
      ({ movies }) => useBowlStreamingMatches(movies, ["Netflix"], { fetchProviders }),
      { initialProps: { movies: [{ id: "m1", tmdb_id: 101 }] } }
    );

    await waitFor(() => expect(result.current.matchCount).toBe(1));

    rerender({
      movies: [
        { id: "m1", tmdb_id: 101 },
        { id: "m2", tmdb_id: 102 },
      ],
    });

    await waitFor(() => expect(result.current.matchCount).toBe(2));
  });
});
