import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", draw_method: "person_first" },
    memberRows: [{ user_id: "u1" }],
    bowlData: { remaining: [], watched: [] },
    drawOdds: [],
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
    streamingServices: [],
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

const getTmdbMovieDetails = vi.fn(async () => ({ release_dates: { results: [] } }));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: (...args) => getTmdbMovieDetails(...args),
  getTmdbMovieVideos: vi.fn(async () => ({ results: [] })),
  searchTmdbMovies: vi.fn(async () => ({ results: [] })),
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
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

// Alex added the two action titles, Sam added the only comedy, so filtering
// down to Comedy is what shuts Alex out of a person-first draw.
const TWO_CONTRIBUTORS = [
  {
    id: "m1",
    added_by: "u1",
    tmdb_id: 101,
    title: "Action A",
    genres: ["Action"],
    profiles: { email: "alex@example.com" },
  },
  {
    id: "m2",
    added_by: "u1",
    tmdb_id: 102,
    title: "Action B",
    genres: ["Action"],
    profiles: { email: "alex@example.com" },
  },
  {
    id: "m3",
    added_by: "u2",
    tmdb_id: 103,
    title: "Comedy A",
    genres: ["Comedy"],
    profiles: { email: "sam@example.com" },
  },
];

async function renderDashboard() {
  render(<BowlDashboard />);
  await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
}

function selectOnlyGenre(genre) {
  fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
  fireEvent.click(screen.getByRole("button", { name: /edit genres/i }));
  const genreControls = screen.getByRole("region", { name: /draw genre controls/i });
  fireEvent.click(within(genreControls).getByRole("button", { name: new RegExp(`only ${genre}`, "i") }));
}

describe("BowlDashboard draw pool count", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_method: "person_first" };
    mocks.state.bowlData = { remaining: TWO_CONTRIBUTORS, watched: [] };
    getTmdbMovieDetails.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows only the remaining count while the filters take nothing out", async () => {
    await renderDashboard();

    expect(screen.getByText(/remaining:/i)).toBeInTheDocument();
    expect(screen.queryByText(/drawing from/i)).not.toBeInTheDocument();
    // The default rating filter allows everything, so it must cost no lookups.
    expect(getTmdbMovieDetails).not.toHaveBeenCalled();
  });

  it("reports the narrowed pool alongside the remaining count", async () => {
    await renderDashboard();
    selectOnlyGenre("Action");

    await waitFor(() => expect(screen.getByText(/drawing from/i)).toBeInTheDocument());
    const chip = screen.getByText(/drawing from/i).closest("[data-tone]");
    expect(chip).toHaveTextContent("Drawing from 2");
    expect(screen.getByText(/remaining:/i)).toBeInTheDocument();
  });

  it("warns on the chip and in the disclosure when a person is filtered out", async () => {
    await renderDashboard();
    selectOnlyGenre("Comedy");

    await waitFor(() => expect(screen.getByText(/drawing from/i)).toBeInTheDocument());

    const chip = screen.getByText(/drawing from/i).closest("[data-tone]");
    expect(chip).toHaveAttribute("data-tone", "warning");
    expect(chip).toHaveTextContent("1 of 2 people");

    expect(screen.getByText(/some people are filtered out/i)).toBeInTheDocument();
    expect(screen.getByText(/No movies from alex are in the pool\./)).toBeInTheDocument();
  });

  it("drops the people count for a title-first bowl but still flags the exclusion", async () => {
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_method: "title_first" };

    await renderDashboard();
    selectOnlyGenre("Comedy");

    await waitFor(() => expect(screen.getByText(/drawing from/i)).toBeInTheDocument());

    const chip = screen.getByText(/drawing from/i).closest("[data-tone]");
    expect(chip).toHaveAttribute("data-tone", "active");
    expect(chip).not.toHaveTextContent("people");
    expect(screen.getByText(/No movies from alex are in the pool\./)).toBeInTheDocument();
  });
});
