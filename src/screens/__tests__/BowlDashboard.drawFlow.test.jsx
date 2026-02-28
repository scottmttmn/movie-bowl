import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null },
    memberRows: [{ user_id: "u1" }],
    bowlData: {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 120 }],
      watched: [],
    },
    contributions: { "owner@example.com": 1 },
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: state.authUserId } } },
        error: null,
      })),
    },
    from: vi.fn((table) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { user_id: state.authUserId }, error: null })),
        single: vi.fn(async () => {
          if (table === "bowls") return { data: state.bowlRow, error: null };
          return { data: null, error: null };
        }),
        then: (resolve, reject) => {
          if (table === "bowl_members") {
            return Promise.resolve({ data: state.memberRows, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    }),
  };

  return { state, supabase };
});

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.state.bowlData,
    contributions: mocks.state.contributions,
    isLoading: false,
    errorMessage: null,
    handleDraw: mocks.state.handleDraw,
    handleDeleteMovie: mocks.state.handleDeleteMovie,
    handleReaddMovie: mocks.state.handleReaddMovie,
    handleAddMovie: vi.fn(),
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
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

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useParams: () => ({ bowlId: mocks.state.bowlId }),
  };
});

import BowlDashboard from "../BowlDashboard";

describe("BowlDashboard draw flow", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null };
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 120 }],
      watched: [],
    };
    mocks.state.contributions = { "owner@example.com": 1 };
    mocks.state.handleDeleteMovie.mockClear();
    mocks.state.handleReaddMovie.mockClear();
    mocks.state.handleDraw.mockReset();
    mocks.state.streamingServices = [];
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows draw animation immediately and detail modal after the minimum delay", async () => {
    mocks.state.handleDraw.mockResolvedValue({
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      runtime: 120,
      release_date: "2020-01-01",
      streamingProviders: [],
    });

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();
    expect(screen.queryByText("Movie A (2020)")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1199);
    });

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();
    expect(screen.queryByText("Movie A (2020)")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.queryByText(/drawing a title from the bowl/i)).not.toBeInTheDocument();
    expect(screen.getByText("Movie A (2020)")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not open a detail modal when draw returns no movie", async () => {
    mocks.state.handleDraw.mockResolvedValue(null);

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });

    expect(screen.queryByText(/drawing a title from the bowl/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
