import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    movieRows: [],
    movieError: null,
    bowlRows: [],
    bowlsError: null,
    movieQueries: [],
    bowlQueries: [],
  };

  return {
    state,
    supabase: {
      from: vi.fn((table) => {
        const filters = {};
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((column, value) => {
            filters[column] = value;
            return query;
          }),
          is: vi.fn((column, value) => {
            filters[column] = value;
            return query;
          }),
          in: vi.fn((column, values) => {
            filters[column] = values;
            return query;
          }),
          then: (resolve, reject) => {
            if (table === "bowl_movies") {
              state.movieQueries.push(filters);
              return Promise.resolve({
                data: state.movieError ? null : state.movieRows,
                error: state.movieError,
              }).then(resolve, reject);
            }
            state.bowlQueries.push(filters);
            return Promise.resolve({
              data: state.bowlsError ? null : state.bowlRows,
              error: state.bowlsError,
            }).then(resolve, reject);
          },
        };
        return query;
      }),
    },
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

import useSoloDrawPool from "../useSoloDrawPool";

function row(id, bowlId, overrides = {}) {
  return { id, bowl_id: bowlId, tmdb_id: 100, title: `Movie ${id}`, ...overrides };
}

beforeEach(() => {
  mocks.state.movieRows = [];
  mocks.state.movieError = null;
  mocks.state.bowlRows = [];
  mocks.state.bowlsError = null;
  mocks.state.movieQueries = [];
  mocks.state.bowlQueries = [];
  mocks.supabase.from.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useSoloDrawPool", () => {
  it("reads your own undrawn titles across every bowl, with names and counts", async () => {
    mocks.state.movieRows = [
      row("m1", "bowl-1"),
      row("m2", "bowl-1"),
      row("m3", "bowl-2"),
    ];
    mocks.state.bowlRows = [
      { id: "bowl-2", name: "Second Bowl" },
      { id: "bowl-1", name: "First Bowl" },
    ];

    const { result } = renderHook(() => useSoloDrawPool("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.bowls).toEqual([
      { id: "bowl-1", name: "First Bowl", titleCount: 2 },
      { id: "bowl-2", name: "Second Bowl", titleCount: 1 },
    ]);
    // Scoped to the caller's own undrawn rows, with no bowl filter: the pool is
    // everything they can still reach.
    expect(mocks.state.movieQueries[0]).toEqual({ added_by: "user-1", drawn_at: null });
    expect(mocks.state.movieQueries[0].bowl_id).toBeUndefined();
    expect(mocks.state.bowlQueries[0]).toEqual({ id: ["bowl-1", "bowl-2"] });
  });

  it("drops rows whose bowl no longer resolves", async () => {
    mocks.state.movieRows = [row("m1", "bowl-1"), row("m2", "bowl-gone")];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "First Bowl" }];

    const { result } = renderHook(() => useSoloDrawPool("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows.map((movie) => movie.id)).toEqual(["m1"]);
    expect(result.current.bowlIds).toEqual(["bowl-1"]);
  });

  it("skips the bowl lookup when there is nothing to name", async () => {
    const { result } = renderHook(() => useSoloDrawPool("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.bowls).toEqual([]);
    expect(mocks.state.bowlQueries).toHaveLength(0);
  });

  // An empty pool means "add a movie"; a failed read must not say that.
  it("reports a failed read as an error rather than an empty pool", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.movieError = { message: "network down" };

    const { result } = renderHook(() => useSoloDrawPool("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBe("Could not load your movies. Please try again.");
    expect(result.current.rows).toEqual([]);
  });

  it("reports a failed bowl-name read the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.movieRows = [row("m1", "bowl-1")];
    mocks.state.bowlsError = { message: "network down" };

    const { result } = renderHook(() => useSoloDrawPool("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBe("Could not load your movies. Please try again.");
    expect(result.current.rows).toEqual([]);
  });

  it("reloads on request", async () => {
    mocks.state.movieRows = [row("m1", "bowl-1")];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "First Bowl" }];

    const { result } = renderHook(() => useSoloDrawPool("user-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.state.movieRows = [row("m1", "bowl-1"), row("m2", "bowl-1")];
    await result.current.reload();

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(mocks.state.movieQueries).toHaveLength(2);
  });

  // A solo draw under "remove my copies" deletes these rows on the server, so
  // the pool it was drawn from has to lose them without a second read.
  it("drops removed copies and keeps the scope counts honest", async () => {
    mocks.state.movieRows = [row("m1", "bowl-1"), row("m2", "bowl-1"), row("m3", "bowl-2")];
    mocks.state.bowlRows = [
      { id: "bowl-1", name: "First Bowl" },
      { id: "bowl-2", name: "Second Bowl" },
    ];

    const { result } = renderHook(() => useSoloDrawPool("user-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.removeRows(["m1"]));

    expect(result.current.rows.map((entry) => entry.id)).toEqual(["m2", "m3"]);
    expect(result.current.bowls).toEqual([
      { id: "bowl-1", name: "First Bowl", titleCount: 1 },
      { id: "bowl-2", name: "Second Bowl", titleCount: 1 },
    ]);
    // Nothing was read again: the ids are the whole of what changed.
    expect(mocks.state.movieQueries).toHaveLength(1);
  });

  it("drops a bowl the removal emptied, as a reload would", async () => {
    mocks.state.movieRows = [row("m1", "bowl-1"), row("m2", "bowl-2")];
    mocks.state.bowlRows = [
      { id: "bowl-1", name: "First Bowl" },
      { id: "bowl-2", name: "Second Bowl" },
    ];

    const { result } = renderHook(() => useSoloDrawPool("user-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.removeRows(["m2"]));

    expect(result.current.bowls).toEqual([
      { id: "bowl-1", name: "First Bowl", titleCount: 1 },
    ]);
    expect(result.current.bowlIds).toEqual(["bowl-1"]);
  });

  it("leaves the pool alone when a draw removed nothing", async () => {
    mocks.state.movieRows = [row("m1", "bowl-1")];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "First Bowl" }];

    const { result } = renderHook(() => useSoloDrawPool("user-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = result.current.rows;

    act(() => result.current.removeRows([]));
    act(() => result.current.removeRows(["not-in-the-pool"]));

    expect(result.current.rows).toBe(before);
  });

  it("reads nothing until there is a signed-in user", async () => {
    const { result } = renderHook(() => useSoloDrawPool(null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.supabase.from).not.toHaveBeenCalled();
  });
});
