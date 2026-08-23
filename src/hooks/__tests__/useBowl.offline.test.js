import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Deliberately lighter than the main useBowl harness: these cases only need the
// load queries and the two mutations that refuse to run while offline.
const mocks = vi.hoisted(() => ({
  remainingResult: { data: [], error: null },
  watchedResult: { data: [], error: null },
  rpcCalls: [],
  insertPayloads: [],
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
    rpc: vi.fn(async (name, params) => {
      mocks.rpcCalls.push({ name, params });
      if (name === "get_bowl_profile_directory") return { data: [], error: null };
      return { data: null, error: null };
    }),
    from: vi.fn(() => {
      const state = { kind: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn((column) => {
          if (column === "drawn_at") state.kind = "remaining";
          if (column === "returned_at") state.kind = "watched";
          return query;
        }),
        order: vi.fn(async () =>
          state.kind === "remaining" ? mocks.remainingResult : mocks.watchedResult
        ),
        insert: vi.fn((payload) => {
          mocks.insertPayloads.push(payload);
          const response = {
            data: { ...payload[0], id: "ins-1", drawn_at: null },
            error: null,
          };
          return {
            select: vi.fn(() => ({ single: vi.fn(async () => response) })),
            then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
          };
        }),
        then: (resolve) => resolve({ data: null, error: null }),
      };
      return query;
    }),
  },
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US" })),
}));
vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: vi.fn(async () => ({})),
}));

import useBowl from "../useBowl";
import { OFFLINE_MESSAGE } from "../../utils/networkErrors";

function setOnLine(value) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

const MOVIE = {
  id: "m1",
  bowl_id: "bowl-1",
  tmdb_id: 550,
  title: "Fight Club",
  added_by: "user-1",
  added_at: "2026-01-01T00:00:00.000Z",
  drawn_at: null,
};

async function renderLoadedBowl() {
  const view = renderHook(() => useBowl("bowl-1"));
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  mocks.remainingResult = { data: [MOVIE], error: null };
  mocks.watchedResult = { data: [], error: null };
  mocks.rpcCalls = [];
  mocks.insertPayloads = [];
  setOnLine(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBowl while offline", () => {
  it("refuses a draw instead of letting it fail at the database", async () => {
    const { result } = await renderLoadedBowl();
    setOnLine(false);

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toBe(OFFLINE_MESSAGE);
    expect(mocks.rpcCalls.filter((call) => call.name.startsWith("draw_"))).toEqual([]);
  });

  it("refuses an add without leaving an optimistic row behind", async () => {
    const { result } = await renderLoadedBowl();
    setOnLine(false);

    let addResult;
    await act(async () => {
      addResult = await result.current.handleAddMovie({ id: 680, title: "Pulp Fiction" });
    });

    expect(addResult).toMatchObject({ ok: false, code: "offline", message: OFFLINE_MESSAGE });
    expect(mocks.insertPayloads).toEqual([]);
    expect(
      result.current.bowl.remaining.some((movie) => movie?.local_status === "syncing")
    ).toBe(false);
  });

  it("blames the connection, not the bowl, when a load fails offline", async () => {
    setOnLine(false);
    mocks.remainingResult = { data: null, error: new TypeError("Failed to fetch") };

    const { result } = await renderLoadedBowl();

    expect(result.current.errorMessage).toBe(OFFLINE_MESSAGE);
  });

  it("keeps its own copy when a load fails for a non-network reason", async () => {
    mocks.remainingResult = {
      data: null,
      error: { code: "42501", message: "permission denied" },
    };

    const { result } = await renderLoadedBowl();

    expect(result.current.errorMessage).toBe("Failed to load remaining movies.");
  });

  it("retries the failed load once the connection returns", async () => {
    setOnLine(false);
    mocks.remainingResult = { data: null, error: new TypeError("Failed to fetch") };

    const { result } = await renderLoadedBowl();
    expect(result.current.bowl.remaining).toEqual([]);

    setOnLine(true);
    mocks.remainingResult = { data: [MOVIE], error: null };
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.bowl.remaining).toHaveLength(1));
    expect(result.current.errorMessage).toBeNull();
  });

  it("does not retry a load that succeeded before the connection blipped", async () => {
    const { result } = await renderLoadedBowl();
    const loadsBefore = mocks.supabase.from.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(mocks.supabase.from.mock.calls.length).toBe(loadsBefore);
    expect(result.current.errorMessage).toBeNull();
  });
});
