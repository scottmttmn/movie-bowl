import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("../../hooks/useBowlAdd", () => ({ default: () => ({ openBowlAdd: vi.fn() }) }));
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
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
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

describe("BowlDashboard explicit access and retry", () => {
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

  it("opening a deep link does not write a last-opened preference", async () => {
    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Bowl 1" })).toBeInTheDocument());
    expect(localStorage.getItem("movie-bowl:last-bowl:u1")).toBeNull();
    expect(mocks.state.navigate).not.toHaveBeenCalled();
  });

  it("sends a confirmed missing bowl to My Bowls, never back to Home", async () => {
    mocks.state.bowlRow = null;
    mocks.state.bowlError = { code: "PGRST116", message: "No rows" };
    render(<BowlDashboard />);
    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true }));
    expect(mocks.state.navigate).not.toHaveBeenCalledWith("/", { replace: true });
  });

  it("sends revoked membership to My Bowls", async () => {
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "other", draw_access_mode: "all_members" };
    mocks.state.membershipRow = null;
    render(<BowlDashboard />);
    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true }));
  });

  it("keeps transport errors separate from access loss and allows retry", async () => {
    mocks.state.bowlError = { message: "Network unavailable" };
    render(<BowlDashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this bowl");
    expect(mocks.state.navigate).not.toHaveBeenCalled();
    mocks.state.bowlError = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Bowl 1" })).toBeInTheDocument();
  });
});
