import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bowlData: {
    remaining: [
      { id: "movie-1", tmdb_id: 101, title: "Arrival" },
      { id: "movie-2", tmdb_id: 202, title: "Dune" },
      { id: "movie-3", tmdb_id: 303, title: "Tenet" },
    ],
    watched: [],
  },
  handleDraw: vi.fn(),
  handleReaddMovie: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  drawSettings: {},
}));

vi.mock("../hooks/useTvBowls", () => ({
  useTvBowlAccess: () => ({
    bowlMeta: { name: "Family Night", ownerId: "user-1", canDraw: true },
    isLoading: false,
    errorMessage: null,
  }),
}));

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.bowlData,
    isLoading: false,
    errorMessage: null,
    handleDraw: mocks.handleDraw,
    handleReaddMovie: mocks.handleReaddMovie,
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: ["Netflix"],
    defaultDrawSettings: mocks.drawSettings,
    loading: false,
  }),
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: async () => ({ providers: [], region: "US", fetchedAt: null }),
}));

import TvTonightScreen from "../screens/TvTonightScreen";

const DRAWN_MOVIE = {
  id: "movie-1",
  tmdb_id: 101,
  title: "Arrival",
  release_date: "2016-11-11",
  streamingProviders: ["Netflix"],
};

const DETAILS_BY_ID = {
  101: { title: "Arrival", trailer: { key: "arrival" } },
  202: { title: "Dune", trailer: { key: "dune" } },
  303: { title: "Tenet", trailer: { key: "tenet" } },
};

function renderTonight() {
  return render(
    <MemoryRouter initialEntries={["/tv/bowl/family"]}>
      <Routes>
        <Route
          path="/tv/bowl/:bowlId"
          element={<TvTonightScreen userId="user-1" userEmail="viewer@example.com" />}
        />
        <Route path="/tv/bowls" element={<div>Bowl picker route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function drawAndKeep() {
  renderTonight();

  fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1800);
  });
  vi.useRealTimers();

  const keepButton = await screen.findByRole("button", { name: /that's the one/i });
  // Let the background preview lookups settle before the pick is accepted.
  await waitFor(() =>
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledWith(202)
  );
  fireEvent.click(keepButton);
}

describe("TV theater mode", () => {
  let playerOptions;
  let player;

  beforeEach(() => {
    window.localStorage.clear();
    // Pin the candidate shuffle so preview order is assertable; Fisher-Yates
    // leaves the list untouched when every draw picks the last slot.
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    mocks.handleDraw.mockReset();
    mocks.handleReaddMovie.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.drawSettings = {
      prioritizeStreaming: false,
      selectedRatings: ["PG", "PG-13", "R"],
      theaterModeEnabled: true,
      theaterTrailerCount: 2,
    };

    mocks.handleDraw.mockResolvedValue(DRAWN_MOVIE);
    mocks.getTmdbMovieDetails.mockImplementation(async (id) => DETAILS_BY_ID[id] || {});

    playerOptions = undefined;
    player = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      stopVideo: vi.fn(),
      loadVideoById: vi.fn(),
      destroy: vi.fn(),
    };
    window.YT = {
      Player: vi.fn((_playerId, options) => {
        playerOptions = options;
        return player;
      }),
      PlayerState: { ENDED: 0 },
    };
  });

  afterEach(() => {
    cleanup();
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("plays queued previews on one player and hands off to the feature", async () => {
    await drawAndKeep();

    const overlay = await screen.findByRole("dialog", {
      name: /previews before arrival/i,
    });
    expect(overlay).toBeInTheDocument();
    expect(screen.getByText(/2 previews/i)).toBeInTheDocument();
    expect(screen.getByText(/preview 1 of 2/i)).toBeInTheDocument();

    // The first preview autoplays through the iframe's own src.
    expect(screen.getByTitle(/movie bowl previews/i)).toHaveAttribute(
      "src",
      expect.stringContaining("/embed/dune")
    );
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    // Second preview reuses the same player rather than remounting an iframe.
    act(() => {
      playerOptions.events.onStateChange({ data: 0 });
    });
    expect(player.loadVideoById).toHaveBeenCalledWith("tenet");
    expect(window.YT.Player).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/preview 2 of 2/i)).toBeInTheDocument();

    // The final preview ends on the Feature Presentation transition.
    vi.useFakeTimers();
    act(() => {
      playerOptions.events.onStateChange({ data: 0 });
    });
    expect(screen.getByRole("heading", { name: /feature presentation/i })).toBeInTheDocument();
    expect(player.stopVideo).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600);
    });
    vi.useRealTimers();

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open in netflix/i })
    ).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem("movie-bowl:tv:recent-trailers"))
    ).toEqual(expect.arrayContaining(["dune", "tenet"]));
  });

  it("advances past a preview that fails to play", async () => {
    await drawAndKeep();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    act(() => {
      playerOptions.events.onError({ data: 150 });
    });

    expect(player.loadVideoById).toHaveBeenCalledWith("tenet");
    expect(screen.getByText(/preview 2 of 2/i)).toBeInTheDocument();
  });

  it("lets the remote pause and skip straight to the movie", async () => {
    await drawAndKeep();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    expect(player.pauseVideo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(player.playVideo).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /skip to movie/i }));

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
  });

  it("exits the previews on the remote back button", async () => {
    await drawAndKeep();
    await screen.findByRole("dialog", { name: /previews before arrival/i });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
  });

  it("waits for a slow preview lookup instead of dropping the previews", async () => {
    let releasePreviewLookups;
    const previewGate = new Promise((resolve) => {
      releasePreviewLookups = resolve;
    });
    mocks.getTmdbMovieDetails.mockImplementation(async (id) => {
      // Only the drawn movie's own enrichment resolves right away.
      if (id !== 101) await previewGate;
      return DETAILS_BY_ID[id] || {};
    });

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    // Accept the pick while the queue is still resolving.
    fireEvent.click(await screen.findByRole("button", { name: /that's the one/i }));

    expect(screen.getByText(/loading previews/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();

    await act(async () => {
      releasePreviewLookups();
      await previewGate;
    });

    expect(
      await screen.findByRole("dialog", { name: /previews before arrival/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/loading previews/i)).not.toBeInTheDocument();
  });

  it("gives up on the previews when the lookup outlasts the autoplay window", async () => {
    mocks.getTmdbMovieDetails.mockImplementation(async (id) => {
      if (id !== 101) await new Promise(() => {});
      return DETAILS_BY_ID[id] || {};
    });

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });

    fireEvent.click(screen.getByRole("button", { name: /that's the one/i }));
    expect(screen.getByText(/loading previews/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    vi.useRealTimers();

    expect(screen.queryByText(/loading previews/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
  });

  it("keeps the plain reveal flow when theater mode is off", async () => {
    mocks.drawSettings = { ...mocks.drawSettings, theaterModeEnabled: false };

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    fireEvent.click(await screen.findByRole("button", { name: /that's the one/i }));

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
    // Only the drawn movie is enriched; no preview lookups are made.
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledTimes(1);
  });
});
