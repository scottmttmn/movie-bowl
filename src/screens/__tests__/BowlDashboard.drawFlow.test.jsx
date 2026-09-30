import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1" },
    memberRows: [{ user_id: "u1" }],
    bowlData: {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 120 }],
      watched: [],
    },
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
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
    loading: false,
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
import { HOLD_TO_DRAW_MS } from "../../components/HoldToDrawButton";
import { getTmdbMovieDetails } from "../../lib/tmdbApi";
import { fetchStreamingProviders } from "../../lib/streamingProviders";

function renderDashboard() {
  return render(<BowlDashboard />);
}

// fireEvent.click dispatches with detail 0, which the hold button treats as
// keyboard activation — so this exercises the confirm-dialog fallback path.
function confirmDraw() {
  fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
  expect(screen.getByText(/reveal a movie\?/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /reveal movie/i }));
}

describe("BowlDashboard draw flow", () => {
  beforeEach(() => {
    mocks.fetchProviderLinks.mockReset().mockResolvedValue({ links: [] });
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1" };
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 120 }],
      watched: [],
    };
    mocks.state.handleDeleteMovie.mockClear();
    mocks.state.handleReaddMovie.mockClear();
    mocks.state.handleDraw.mockReset();
    mocks.state.streamingServices = [];
    mocks.saveStreamingServices.mockClear();
    mocks.state.defaultDrawSettings = {
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
      added_by: "u1",
      profiles: { display_name: "Owner" },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();
    expect(screen.queryByText("Movie A (2020)")).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    // A result with nothing to replay takes the screen and opens at the
    // usual minimum.
    expect(document.querySelector(".draw-reveal-stage")).toBeInTheDocument();
    expect(screen.queryByText("Movie A (2020)")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1499);
    });

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();
    expect(screen.queryByText("Movie A (2020)")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.queryByText(/drawing a title from the bowl/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("replays the draw in a takeover: the person lands first, then the title, then the movie opens", async () => {
    mocks.state.handleDraw.mockResolvedValue({
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      release_date: "2020-01-01",
      streamingProviders: [],
      drawReveal: {
        methodId: "person_first",
        person: {
          mode: "random",
          people: [
            { key: "user:u1", label: "Owner", count: 2 },
            { key: "user:u2", label: "Friend", count: 1 },
          ],
          chosenKey: "user:u1",
          chosenLabel: "Owner",
        },
        title: { mode: "random", scope: "person", personLabel: "Owner", count: 2 },
      },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      await Promise.resolve();
    });

    const stage = document.querySelector(".draw-reveal-stage");
    // Portaled out of the page, so no header's containing block can trap it.
    expect(stage.parentElement).toBe(document.body);
    expect(stage).toHaveAttribute("aria-hidden", "true");
    expect(stage).toHaveTextContent("Picking a person at random…");

    // The piles sort and the light sweeps, but nothing lands before its time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2899);
    });
    expect(stage).toHaveAttribute("data-phase", "sweep");
    expect(document.querySelector(".draw-reveal-card.is-chosen")).toBeNull();
    expect(screen.getByRole("status")).not.toHaveTextContent("Owner, at random");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector(".draw-reveal-card.is-chosen")).toHaveTextContent("Owner");
    expect(stage).toHaveTextContent("Owner, at random");
    expect(screen.getByRole("status")).toHaveTextContent("Owner, at random.");
    expect(screen.getByRole("status")).not.toHaveTextContent("1 of Owner's 2 movies");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    expect(stage).toHaveAttribute("data-phase", "pick");
    expect(screen.getByRole("status")).toHaveTextContent("Owner, at random. 1 of Owner's 2 movies.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(document.querySelector(".draw-reveal-hero-title")).toHaveTextContent("Movie A");
    expect(screen.queryByRole("heading", { name: "Movie A", level: 2 })).not.toBeInTheDocument();

    // The movie opens when the replay is over, just under five seconds in.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(699);
    });
    expect(screen.queryByRole("heading", { name: "Movie A", level: 2 })).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    vi.useRealTimers();
  });

  it("draws from a completed press-and-hold without a confirm dialog", async () => {
    mocks.state.handleDraw.mockResolvedValue({
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      runtime: 120,
      release_date: "2020-01-01",
      streamingProviders: [],
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(HOLD_TO_DRAW_MS);
    });

    expect(screen.queryByText(/reveal a movie\?/i)).not.toBeInTheDocument();
    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("releasing the hold early does not draw", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    const button = screen.getByRole("button", { name: /draw movie/i });
    const bowl = document.querySelector(".bowl-illustration-stage");
    fireEvent.pointerDown(button);
    // The bowl shakes with the hold, and settles when it is let go.
    expect(bowl).toHaveClass("is-holding");
    await act(async () => {
      vi.advanceTimersByTime(HOLD_TO_DRAW_MS - 1);
    });
    fireEvent.pointerUp(button);
    expect(bowl).not.toHaveClass("is-holding");
    await act(async () => {
      vi.advanceTimersByTime(HOLD_TO_DRAW_MS);
    });

    expect(mocks.state.handleDraw).not.toHaveBeenCalled();
    expect(screen.queryByText(/drawing a title from the bowl/i)).not.toBeInTheDocument();
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
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument());
    expect(getTmdbMovieDetails).toHaveBeenCalledWith(101);
    expect(screen.getByRole("button", { name: /watch trailer/i })).toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));
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
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(screen.queryByText(/drawing a title from the bowl/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("saves a service chosen on the drawn movie through the profile hook", async () => {
    mocks.state.streamingServices = ["Hulu"];
    mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A" });
    fetchStreamingProviders.mockResolvedValue({ providers: ["Max"], availability: {
      subscription: [{ id: 1899, name: "HBO Max", logoPath: null }],
    } });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    vi.useFakeTimers();
    confirmDraw();
    await act(async () => { vi.advanceTimersByTime(1500); await Promise.resolve(); });
    vi.useRealTimers();
    fireEvent.click(await screen.findByRole("button", { name: /where else to watch/i }));
    fireEvent.click(screen.getByRole("button", { name: "Streaming on Max" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Max to your services" }));
    await waitFor(() => expect(mocks.saveStreamingServices).toHaveBeenCalledExactlyOnceWith(["Hulu", "Max"]));
  });

  it("shows a secure provider link in the drawn modal", async () => {
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
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    vi.useRealTimers();

    const webLink = await screen.findByRole("link", { name: /watch on netflix/i });
    expect(webLink).toHaveAttribute("href", "https://www.netflix.com/search?q=Movie%20A");
    expect(webLink).toHaveAttribute("target", "_blank");
    expect(webLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("reveals before the lookup resolves, then upgrades the same service without reopening the card", async () => {
    let finishLookup;
    mocks.fetchProviderLinks.mockReturnValue(new Promise((resolve) => { finishLookup = resolve; }));
    mocks.state.streamingServices = ["Netflix", "Hulu"];
    mocks.state.defaultDrawSettings.enablePreferredWebLaunch = true;
    mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Arrival" });
    fetchStreamingProviders.mockResolvedValue({ providers: ["Netflix", "Hulu"] });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    vi.useFakeTimers();
    confirmDraw();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    vi.useRealTimers();
    const link = await screen.findByRole("link", { name: /watch on netflix/i });
    expect(mocks.fetchProviderLinks).toHaveBeenCalledExactlyOnceWith(101, "bowl-1");
    expect(link).toHaveAttribute("href", "https://www.netflix.com/search?q=Arrival");
    await act(async () => { finishLookup({ links: [{ service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123" }] }); });
    expect(screen.getByRole("link", { name: /watch on netflix/i })).toBe(link);
    expect(link).toHaveAttribute("href", "https://www.netflix.com/title/123");
    expect(screen.getByRole("link", { name: "Watchmode" })).toBeInTheDocument();
  });

  it("offers the preferred rental store when none of your services carry the drawn movie", async () => {
    mocks.fetchProviderLinks.mockResolvedValue({
      links: [
        { service: "Max", type: "sub", webUrl: "https://play.max.com/movie/1" },
        { service: "Apple TV+", type: "rent", webUrl: "https://tv.apple.com/movie/1" },
        { service: "Google Play", type: "rent", webUrl: "https://play.google.com/store/movies/1" },
      ],
    });
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.defaultDrawSettings.enablePreferredWebLaunch = true;
    mocks.state.defaultDrawSettings.rentFrom = "Google Play";
    mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Arrival" });
    fetchStreamingProviders.mockResolvedValue({ providers: ["Max"] });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    vi.useFakeTimers();
    confirmDraw();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    vi.useRealTimers();

    const link = await screen.findByRole("link", { name: /rent on google play/i });
    expect(link).toHaveAttribute("href", "https://play.google.com/store/movies/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: /open on web/i })).not.toBeInTheDocument();
  });

  it("offers no rental when one of your services carries the drawn movie", async () => {
    mocks.fetchProviderLinks.mockResolvedValue({
      links: [{ service: "Apple TV", type: "rent", webUrl: "https://tv.apple.com/movie/1" }],
    });
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Arrival" });
    fetchStreamingProviders.mockResolvedValue({ providers: ["Netflix"] });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    vi.useFakeTimers();
    confirmDraw();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    vi.useRealTimers();

    await waitFor(() => expect(mocks.fetchProviderLinks).toHaveBeenCalled());
    await screen.findByRole("heading", { name: "Arrival", level: 2 });
    expect(screen.queryByRole("link", { name: /rent on/i })).not.toBeInTheDocument();
  });

  it("does not infer a blocked popup from an unavailable window handle", async () => {
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
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.click(await screen.findByRole("link", { name: /watch on netflix/i }));
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/blocked opening the streaming site|allow pop-ups/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/opened netflix in a new tab/i)).not.toBeInTheDocument();
    openSpy.mockRestore();
  });
});
