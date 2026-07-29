import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" },
    bowlError: null,
    membershipRow: { user_id: "u1" },
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: state.authUserId ? { user: { id: state.authUserId } } : null },
        error: null,
      })),
    },
    from: vi.fn((table) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: state.membershipRow,
          error: null,
        })),
        single: vi.fn(async () => {
          if (table === "bowls") {
            return { data: state.bowlError ? null : state.bowlRow, error: state.bowlError };
          }
          return { data: null, error: null };
        }),
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return query;
    }),
  };

  return { state, supabase };
});

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: { remaining: [], watched: [] },
    drawOdds: [],
    isLoading: false,
    errorMessage: null,
    handleDraw: vi.fn(),
    handleAddMovie: vi.fn(),
    handleDeleteMovie: vi.fn(),
    handleReaddMovie: vi.fn(),
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: [],
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      enablePreferredWebLaunch: false,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    },
    loading: false,
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
}));
vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: vi.fn(async () => ({})),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useParams: () => ({ bowlId: mocks.state.bowlId }),
  };
});

import BowlDashboard from "../BowlDashboard";
import { getLastOpenedBowlId, rememberLastOpenedBowl } from "../../utils/lastOpenedBowl";

describe("BowlDashboard last opened bowl", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.state.navigate.mockReset();
    mocks.state.bowlId = "bowl-1";
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" };
    mocks.state.bowlError = null;
    mocks.state.membershipRow = { user_id: "u1" };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("remembers a bowl once access is confirmed", async () => {
    render(<BowlDashboard />);

    await waitFor(() => expect(getLastOpenedBowlId("u1")).toBe("bowl-1"));
  });

  it("does not remember a bowl the user cannot open", async () => {
    mocks.state.bowlError = { message: "Not found" };

    render(<BowlDashboard />);

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true }));
    expect(getLastOpenedBowlId("u1")).toBe("");
  });

  it("clears a stale memory and sends the user to the list, never back to /", async () => {
    rememberLastOpenedBowl("u1", "bowl-1");
    mocks.state.bowlError = { message: "Not found" };

    render(<BowlDashboard />);

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true }));
    // Redirecting to "/" here would bounce straight back into this bowl.
    expect(mocks.state.navigate).not.toHaveBeenCalledWith("/", { replace: true });
    expect(getLastOpenedBowlId("u1")).toBe("");
  });

  it("drops the memory when membership no longer exists", async () => {
    rememberLastOpenedBowl("u1", "bowl-1");
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "someone-else", draw_access_mode: "all_members" };
    mocks.state.membershipRow = null;

    render(<BowlDashboard />);

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true }));
    expect(getLastOpenedBowlId("u1")).toBe("");
  });

  it("keeps a different remembered bowl when an unrelated bowl fails to open", async () => {
    rememberLastOpenedBowl("u1", "bowl-9");
    mocks.state.bowlId = "bowl-1";
    mocks.state.bowlError = { message: "Not found" };

    render(<BowlDashboard />);

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true }));
    expect(getLastOpenedBowlId("u1")).toBe("bowl-9");
  });
});
