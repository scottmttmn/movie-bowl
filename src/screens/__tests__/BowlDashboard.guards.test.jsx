import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", max_contribution_lead: 1 },
    memberRows: [{ user_id: "u1" }, { user_id: "u2" }],
    bowlData: {
      remaining: [
        { id: "m1", added_by: "u1" },
        { id: "m2", added_by: "u1" },
        { id: "m3", added_by: "u1" },
        { id: "m4", added_by: "u1" },
      ],
      watched: [],
    },
    contributions: { "owner@example.com": 4 },
    handleDraw: vi.fn(async () => null),
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

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
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

describe("BowlDashboard guards", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", max_contribution_lead: 1 };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1" },
        { id: "m2", added_by: "u1" },
        { id: "m3", added_by: "u1" },
        { id: "m4", added_by: "u1" },
      ],
      watched: [],
    };
    mocks.state.contributions = { "owner@example.com": 4 };
    mocks.state.handleReaddMovie.mockClear();
    mocks.state.streamingServices = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("disables Add Movie when user is over the contribution lead limit", async () => {
    render(<BowlDashboard />);

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ add movie/i })).toBeDisabled();
    expect(
      screen.getByText(/you are at 4 contributions and the lowest active member is at 0/i)
    ).toBeInTheDocument();
  });

  it("keeps Add Movie enabled when only one active member exists", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = { remaining: [], watched: [] };
    mocks.state.contributions = {};

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ add movie/i })).toBeEnabled();
  });

  it("disables Add Movie when undrawn movie limit is reached", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: Array.from({ length: 100 }, (_, index) => ({
        id: `m-${index + 1}`,
        added_by: "u1",
      })),
      watched: [],
    };
    mocks.state.contributions = {};

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ add movie/i })).toBeDisabled();
    expect(screen.getByText(/undrawn movie limit \(100\)/i)).toBeInTheDocument();
  });

  it("shows re-add confirmation modal before moving watched item back to bowl", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "w1",
          tmdb_id: 101,
          title: "Movie A",
          drawn_at: "2026-02-23T00:00:00.000Z",
          added_by: "u1",
        },
      ],
    };
    mocks.state.contributions = {};

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /move to bowl/i }));

    expect(screen.getByText(/re-add to bowl\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/will be removed from the watched strip and placed back in your bowl/i)
    ).toBeInTheDocument();

    const readdButtons = screen.getAllByRole("button", { name: /^re-add$/i });
    fireEvent.click(readdButtons[readdButtons.length - 1]);

    await waitFor(() => expect(mocks.state.handleReaddMovie).toHaveBeenCalledWith("w1"));
  });
});
