import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1" },
    memberRows: [{ user_id: "u1" }],
    bowlData: {
      remaining: [],
      watched: [],
    },
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
    preferencesLoading: false,
    preferencesLoadError: null,
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
  };

  return {
    state,
    supabase: {
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
    },
    getTmdbMovieDetails: vi.fn(async () => ({})),
    fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
    fetchProviderLinks: vi.fn(),
    saveStreamingServices: vi.fn(async () => ({ error: null })),
  };
});

const userBowlsMock = vi.hoisted(() => ({
  bowls: [{ id: "bowl-1", name: "Date Night Eats", ownerId: "u1", role: "Owner", memberCount: 2, remainingCount: 2, kind: "restaurants" }],
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
  default: (bowlId) => ({
    bowl: mocks.state.bowlData,
    isLoading: false,
    loadedBowlId: bowlId,
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
    saveStreamingServices: mocks.saveStreamingServices,
    defaultDrawSettings: mocks.state.defaultDrawSettings,
    loading: mocks.state.preferencesLoading,
    loadError: mocks.state.preferencesLoadError,
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/providerLinks", () => ({ fetchProviderLinks: mocks.fetchProviderLinks }));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
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

function renderDashboard() {
  return render(<BowlDashboard />);
}

const slips = () => [
  { id: "r1", added_by: "u1", tmdb_id: null, title: "La Rana Bistro", cuisine: "Mediterranean", place_id: "ChIJlarana", note: "Anniversary spot", profiles: { display_name: "Owner" } },
  { id: "r2", added_by: "u2", tmdb_id: null, title: "Great Dragon", cuisine: "Chinese", profiles: { display_name: "Friend" } },
];

describe("BowlDashboard in a restaurant bowl", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.bowlRow = { name: "Date Night Eats", owner_id: "u1" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.bowlData = { remaining: slips(), watched: [] };
    mocks.state.handleDraw.mockReset();
    mocks.fetchProviderLinks.mockReset().mockResolvedValue({ links: [] });
    mocks.getTmdbMovieDetails.mockReset().mockResolvedValue({});
    mocks.fetchStreamingProviders.mockReset().mockResolvedValue({ providers: [], region: "US", fetchedAt: null });
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("speaks of restaurants and leaves out what only movies have", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Add a restaurant to this bowl" })).toBeInTheDocument();
    expect(screen.getByText("My Restaurants")).toBeInTheDocument();
    expect(screen.getByText("Been there")).toBeInTheDocument();
    expect(screen.queryByText("My Movies")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /theater/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draw for myself/ })).not.toBeInTheDocument();
    // The count stands alone: there are no filters for it to open yet.
    expect(screen.getByText("Drawing from 2 restaurants.")).toBeInTheDocument();
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalled();
  });

  it("draws from every slip and opens the place with directions", async () => {
    mocks.state.handleDraw.mockResolvedValue({ ...slips()[0], drawn_at: "2026-11-08T19:00:00Z" });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    expect(screen.getByText("Reveal a restaurant?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));

    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.handleDraw.mock.calls[0][0]).toMatchObject({
      prioritizeByServices: false,
      ratingFilter: null,
      genreFilter: null,
      runtimeFilter: null,
    });

    const heading = await screen.findByRole("heading", { name: "La Rana Bistro", level: 2 }, { timeout: 4000 });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("Anniversary spot")).toBeInTheDocument();
    const directions = screen.getByRole("link", { name: "Directions" });
    expect(directions.getAttribute("href")).toContain("query_place_id=ChIJlarana");
    expect(screen.queryByText(/where to watch/i)).not.toBeInTheDocument();
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalled();
  });
});
