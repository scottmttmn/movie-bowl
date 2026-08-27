import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
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
      selectedRatings: mocks.state.selectedRatings,
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
import { clearDrawSelectionCache } from "../../utils/drawSelection";

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
    mocks.state.selectedRatings = ["G", "PG", "PG-13", "R", "NC-17"];
    clearDrawSelectionCache();
    getTmdbMovieDetails.mockReset();
    getTmdbMovieDetails.mockResolvedValue({ release_dates: { results: [] } });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows only the bowl count while the filters take nothing out", async () => {
    await renderDashboard();

    expect(screen.getByRole("button", { name: /3 movies in the bowl/i })).toBeInTheDocument();
    expect(screen.queryByText(/eligible/i)).not.toBeInTheDocument();
    // The default rating filter allows everything, so it must cost no lookups.
    expect(getTmdbMovieDetails).not.toHaveBeenCalled();
  });

  it("reveals background lookup progress only when filter details are opened", async () => {
    mocks.state.selectedRatings = ["R"];
    const resolvers = new Map();
    getTmdbMovieDetails.mockImplementation(
      (tmdbId) => new Promise((resolve) => resolvers.set(tmdbId, resolve))
    );

    await renderDashboard();
    await waitFor(() => expect(getTmdbMovieDetails).toHaveBeenCalledTimes(3));

    expect(screen.getByRole("button", { name: /3 movies in the bowl/i })).toHaveTextContent(
      "3 in the bowl"
    );
    expect(screen.queryByRole("progressbar", { name: /filter lookup progress/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view filter lookup progress/i }));

    const progress = screen.getByRole("progressbar", { name: /filter lookup progress/i });
    expect(progress).toHaveAttribute("aria-valuenow", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "3");

    await act(async () => {
      resolvers.get(101)({
        release_dates: {
          results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }],
        },
      });
    });
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "1"));

    await act(async () => {
      [102, 103].forEach((tmdbId) => {
        resolvers.get(tmdbId)({
          release_dates: {
            results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }],
          },
        });
      });
    });
    await waitFor(() => expect(screen.getByText("All 3 titles eligible")).toBeInTheDocument());
  });

  it("reports the narrowed pool against the total", async () => {
    // Both contributors keep an Action title, so this narrowing excludes a
    // movie without excluding a person — the calm active tone.
    mocks.state.bowlData = {
      remaining: [
        ...TWO_CONTRIBUTORS,
        {
          id: "m4",
          added_by: "u2",
          tmdb_id: 104,
          title: "Action C",
          genres: ["Action"],
          profiles: { email: "sam@example.com" },
        },
      ],
      watched: [],
    };

    await renderDashboard();
    selectOnlyGenre("Action");

    const segment = await screen.findByRole("button", { name: /drawing from 3 of 4 titles/i });
    expect(segment).toHaveTextContent("3 of 4 eligible");
    expect(segment).toHaveAttribute("data-tone", "active");
  });

  it("warns on the line and behind the ⓘ when a person is filtered out", async () => {
    await renderDashboard();
    selectOnlyGenre("Comedy");

    const segment = await screen.findByRole("button", { name: /reaching 1 of 2 people/i });
    expect(segment).toHaveAttribute("data-tone", "warning");

    // The named exclusion lives in the method info dialog, whose trigger
    // carries the warning so it is findable before opening.
    fireEvent.click(
      screen.getByRole("button", { name: /how this bowl picks — some people are filtered out/i })
    );
    expect(screen.getByText(/No movies from alex are in the pool\./)).toBeInTheDocument();
  });

  it("shows the live eligible count in the filters overlay with reset and done", async () => {
    await renderDashboard();
    selectOnlyGenre("Comedy");

    expect(screen.getByRole("dialog", { name: /narrow the draw/i })).toBeInTheDocument();
    expect(await screen.findByText("1 of 3 titles eligible")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^reset$/i }));
    await waitFor(() =>
      expect(screen.getByText("All 3 titles eligible")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(screen.queryByRole("dialog", { name: /narrow the draw/i })).not.toBeInTheDocument();
  });

  it("marks the header filter icon while a narrowing selection is set", async () => {
    await renderDashboard();

    expect(screen.getByRole("button", { name: /^filters$/i })).not.toHaveAttribute(
      "data-filter-active"
    );

    selectOnlyGenre("Comedy");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /hide filters/i })).toHaveAttribute(
        "data-filter-active",
        "true"
      )
    );
  });

  it("drops the people count for a title-first bowl but still flags the exclusion", async () => {
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_method: "title_first" };

    await renderDashboard();
    selectOnlyGenre("Comedy");

    const segment = await screen.findByRole("button", { name: /drawing from 1 of 3 titles\./i });
    expect(segment).toHaveAttribute("data-tone", "active");
    expect(segment).not.toHaveTextContent("people");

    fireEvent.click(screen.getByRole("button", { name: /^how this bowl picks$/i }));
    expect(screen.getByText(/No movies from alex are in the pool\./)).toBeInTheDocument();
  });
});
