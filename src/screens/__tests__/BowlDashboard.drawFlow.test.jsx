import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RokuDeviceProvider } from "../../context/RokuDeviceContext";

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
    queueData: { pending: [], promoted: [] },
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    handleQueueMovie: vi.fn(async () => true),
    handleRemoveQueuedMovie: vi.fn(async () => true),
    streamingServices: [],
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      enablePreferredRokuAppLaunch: false,
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
  };
});

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.state.bowlData,
    contributions: mocks.state.contributions,
    isLoading: false,
    errorMessage: null,
    queueMessage: null,
    queue: mocks.state.queueData,
    handleDraw: mocks.state.handleDraw,
    handleDeleteMovie: mocks.state.handleDeleteMovie,
    handleReaddMovie: mocks.state.handleReaddMovie,
    handleQueueMovie: mocks.state.handleQueueMovie,
    handleRemoveQueuedMovie: mocks.state.handleRemoveQueuedMovie,
    handleAddMovie: vi.fn(),
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
    defaultDrawSettings: mocks.state.defaultDrawSettings,
    loading: false,
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

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
import { getTmdbMovieDetails } from "../../lib/tmdbApi";
import { fetchStreamingProviders } from "../../lib/streamingProviders";

function renderDashboard() {
  return render(
    <RokuDeviceProvider>
      <BowlDashboard />
    </RokuDeviceProvider>
  );
}

function confirmDraw() {
  fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
  expect(screen.getByText(/reveal a movie\?/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /reveal movie/i }));
}

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
    mocks.state.queueData = { pending: [], promoted: [] };
    mocks.state.handleDeleteMovie.mockClear();
    mocks.state.handleReaddMovie.mockClear();
    mocks.state.handleQueueMovie.mockClear();
    mocks.state.handleRemoveQueuedMovie.mockClear();
    mocks.state.handleDraw.mockReset();
    mocks.state.streamingServices = [];
    mocks.state.defaultDrawSettings = {
      prioritizeStreaming: false,
      useStreamingRank: true,
      enablePreferredRokuAppLaunch: false,
      enablePreferredWebLaunch: false,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    };
    mocks.getTmdbMovieDetails.mockReset();
    mocks.getTmdbMovieDetails.mockResolvedValue({});
    mocks.fetchStreamingProviders.mockReset();
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], region: "US", fetchedAt: null });
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
      profiles: { email: "owner@example.com" },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();

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
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("enriches a drawn TMDB movie with trailer data before opening the modal", async () => {
    mocks.state.handleDraw.mockResolvedValue({
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      runtime: 120,
      release_date: "2020-01-01",
      streamingProviders: [],
    });
    getTmdbMovieDetails.mockResolvedValue({
      runtime: 123,
      trailer: {
        site: "YouTube",
        key: "movie-a-trailer",
        embedUrl: "https://www.youtube.com/embed/movie-a-trailer",
      },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText("Movie A (2020)")).toBeInTheDocument());
    expect(getTmdbMovieDetails).toHaveBeenCalledWith(101);
    expect(screen.getByRole("button", { name: /show trailer/i })).toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show trailer/i }));
    expect(screen.getByTitle("Movie A trailer")).toBeInTheDocument();
  });

  it("does not open a detail modal when draw returns no movie", async () => {
    mocks.state.handleDraw.mockResolvedValue(null);

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });

    expect(screen.queryByText(/drawing a title from the bowl/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows web launch only in drawn modal and opens provider site in a new tab", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({});
    mocks.state.streamingServices = ["Netflix", "Hulu"];
    mocks.state.defaultDrawSettings.enablePreferredWebLaunch = true;
    mocks.state.handleDraw.mockResolvedValue({
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      runtime: 120,
      release_date: "2020-01-01",
      streamingProviders: [],
    });
    getTmdbMovieDetails.mockResolvedValue({ runtime: 120 });
    fetchStreamingProviders.mockResolvedValue({
      providers: ["Hulu", "Netflix"],
      region: "US",
      fetchedAt: null,
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    vi.useRealTimers();

    const webButton = await screen.findByRole("button", { name: /open on web in netflix/i });
    fireEvent.click(webButton);

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.netflix.com/search?q=Movie%20A%202020",
      "_blank",
      "noopener,noreferrer"
    );
    expect(screen.getByText(/opened netflix in a new tab/i)).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it("shows a web launch error when popup is blocked", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.defaultDrawSettings.enablePreferredWebLaunch = true;
    mocks.state.handleDraw.mockResolvedValue({
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      runtime: 120,
      release_date: "2020-01-01",
      streamingProviders: [],
    });
    getTmdbMovieDetails.mockResolvedValue({ runtime: 120 });
    fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.click(await screen.findByRole("button", { name: /open on web in netflix/i }));
    expect(screen.getByText(/your browser blocked opening the streaming site/i)).toBeInTheDocument();
    openSpy.mockRestore();
  });
});
