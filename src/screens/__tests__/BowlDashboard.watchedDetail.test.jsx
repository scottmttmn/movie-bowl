import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1" },
    memberRows: [{ user_id: "u1" }],
    bowlData: { remaining: [], watched: [] },
    drawOdds: [],
    streamingServices: [],
    locationHash: "",
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

const userBowlsMock = vi.hoisted(() => ({
  bowls: [],
  defaultBowlId: null,
  loading: false,
  error: null,
  refresh: vi.fn(async () => null),
  setDefaultBowl: vi.fn(async () => null),
  savingDefault: false,
}));
vi.mock("../../hooks/useUserBowls", () => ({ default: () => userBowlsMock }));

vi.mock("../../hooks/useBowlAdd", () => ({ default: () => ({ openBowlAdd: vi.fn() }) }));
vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.state.bowlData,
    drawOdds: mocks.state.drawOdds,
    isLoading: false,
    errorMessage: null,
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(),
    handleReaddMovie: vi.fn(),
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
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

const fetchStreamingProviders = vi.fn(async () => ({
  providers: ["Netflix"],
  region: "US",
  fetchedAt: null,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: (...args) => fetchStreamingProviders(...args),
}));

const getTmdbMovieDetails = vi.fn(async () => ({ runtime: 120 }));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: (...args) => getTmdbMovieDetails(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useParams: () => ({ bowlId: mocks.state.bowlId }),
    useLocation: () => ({ hash: mocks.state.locationHash }),
  };
});

import BowlDashboard from "../BowlDashboard";

async function openWatchedDetail() {
  render(<BowlDashboard />);
  await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  fireEvent.click(screen.getByRole("button", { name: "Movie A" }));

  return screen.findByRole("dialog", { name: "Movie A" });
}

describe("BowlDashboard watched detail", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "d1",
          added_by: "u1",
          tmdb_id: 101,
          title: "Movie A",
          poster_path: "/a.jpg",
          drawn_at: "2026-04-10T00:00:00.000Z",
        },
      ],
    };
    fetchStreamingProviders.mockClear();
    getTmdbMovieDetails.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // A movie in the watched list has already been seen, so where it streams is
  // no longer the question the detail answers.
  it("leaves where to watch off the detail for a movie already watched", async () => {
    await openWatchedDetail();

    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Where to watch" })).not.toBeInTheDocument();
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
    expect(screen.queryByText("No US streaming providers found right now.")).not.toBeInTheDocument();
  });

  it("skips the streaming lookup the watched detail no longer displays", async () => {
    await openWatchedDetail();

    expect(getTmdbMovieDetails).toHaveBeenCalledWith(101);
    expect(fetchStreamingProviders).not.toHaveBeenCalled();
  });
});
