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
  providerLinks: [],
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
    filterMetadataFetchers: {
      fetchMovieDetails: (tmdbId) => mocks.getTmdbMovieDetails(tmdbId),
      fetchProviders: async () => ({ providers: [], region: "US", fetchedAt: null }),
      fetchFilterMetadata: async () => null,
    },
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
vi.mock("../../lib/providerLinks", () => ({
  fetchProviderLinks: async () => ({ links: mocks.providerLinks }),
}));

import { clearDrawSelectionCache } from "../../utils/drawSelection";
import { getDrawReveal } from "../../utils/drawReveal";
import { getContributorBucketKey } from "../../utils/drawBuckets";
import { MPAA_RATING_OPTIONS } from "../../utils/movieRatings";
import TvTonightScreen from "../screens/TvTonightScreen";
import { readExternalReturn } from "../utils/externalReturn";

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

function withUsRating(certification) {
  return {
    release_dates: {
      results: [{ iso_3166_1: "US", release_dates: [{ certification }] }],
    },
  };
}

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

async function drawWithTheaterMode() {
  renderTonight();

  fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /^draw$/i }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1800);
  });
  vi.useRealTimers();

  // The committed draw starts theater mode as soon as previews are ready.
  await waitFor(() =>
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledWith(202)
  );
}

describe("TV theater mode", () => {
  let playerOptions;
  let player;

  // The preview count is a device setting with no account layer, so these cases
  // put it where the television reads it from rather than on the profile.
  const setDeviceTrailerCount = (count) =>
    window.localStorage.setItem(
      "movie-bowl:tv:draw-settings:user-1",
      JSON.stringify({ theaterTrailerCount: count })
    );

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    // Ratings are cached in-module for an hour, so each case starts clean.
    clearDrawSelectionCache();
    // Pin the candidate shuffle so preview order is assertable; Fisher-Yates
    // leaves the list untouched when every draw picks the last slot.
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    mocks.handleDraw.mockReset();
    mocks.handleReaddMovie.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.providerLinks = [];
    mocks.drawSettings = {
      prioritizeStreaming: false,
      selectedRatings: ["PG", "PG-13", "R"],
      includeUnknownRatings: true,
      includeUnknownGenres: true,
      includeUnknownRuntime: true,
      theaterModeEnabled: true,
    };
    setDeviceTrailerCount(2);

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

  it("waits for the complete method reveal before starting theater previews", async () => {
    const pool = mocks.bowlData.remaining.map((movie, index) => ({ ...movie, added_by_name: index < 2 ? "Alex" : "Sam" }));
    const drawReveal = getDrawReveal({
      drawMethod: "person_first", pool, drawn: pool[0],
      turnBucketKey: getContributorBucketKey(pool[0]),
    });
    mocks.handleDraw.mockImplementation(async (options) => {
      options.onPoolResolved(pool);
      return { ...DRAWN_MOVIE, drawReveal };
    });
    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /^draw$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4949); });
    expect(document.querySelector(".tv-draw-reveal-stage")).toHaveAttribute("data-phase", "unfold");
    expect(window.YT.Player).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /previews before arrival/i })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    vi.useRealTimers();
    expect(await screen.findByRole("dialog", { name: /previews before arrival/i })).toBeInTheDocument();
    expect(document.querySelector(".tv-draw-reveal-stage")).toBeNull();
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));
  });

  it("plays queued previews on one player and hands off to the feature", async () => {
    await drawWithTheaterMode();

    const overlay = await screen.findByRole("dialog", {
      name: /previews before arrival/i,
    });
    expect(overlay).toBeInTheDocument();
    expect(screen.getByText(/2 previews/i)).toBeInTheDocument();

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
    // With nothing to hand off to, the lights come up on the pick first.
    const overlayAfterCard = screen.getByRole("dialog", { name: /previews before arrival/i });
    expect(overlayAfterCard).toHaveAttribute("data-lights", "raising");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    vi.useRealTimers();

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector(".tv-reveal.is-tonight")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^watch on netflix$/i })
    ).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem("movie-bowl:tv:recent-trailers"))
    ).toEqual(
      expect.arrayContaining([
        { key: "dune", tmdbId: 202 },
        { key: "tenet", tmdbId: 303 },
      ])
    );
  });

  it("previews a title the draw filters can still reach over one they exclude", async () => {
    mocks.drawSettings = {
      ...mocks.drawSettings,
      selectedRatings: ["PG-13"],
      includeUnknownRatings: false,
    };
    setDeviceTrailerCount(1);
    mocks.getTmdbMovieDetails.mockImplementation(async (tmdbId) => ({
      ...(DETAILS_BY_ID[tmdbId] || {}),
      ...withUsRating(tmdbId === 303 ? "PG-13" : "R"),
    }));

    await drawWithTheaterMode();

    await screen.findByRole("dialog", { name: /previews before arrival/i });
    // Dune is R and the bowl is drawing PG-13 only, so it cannot come up next.
    expect(screen.getByTitle(/movie bowl previews/i)).toHaveAttribute(
      "src",
      expect.stringContaining("/embed/tenet")
    );
    expect(screen.getByText(/one preview/i)).toBeInTheDocument();
  });

  it("advances past a preview that fails to play", async () => {
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    act(() => {
      playerOptions.events.onError({ data: 150 });
    });

    expect(player.loadVideoById).toHaveBeenCalledWith("tenet");
  });

  it("tries the same title's next trailer before moving to the next preview", async () => {
    mocks.getTmdbMovieDetails.mockImplementation(async (id) =>
      id === 202
        ? { title: "Dune", trailer: { key: "dune", fallbacks: [{ key: "dune-teaser" }] } }
        : DETAILS_BY_ID[id] || {}
    );

    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    act(() => {
      playerOptions.events.onError({ data: 150 });
    });
    expect(player.loadVideoById).toHaveBeenLastCalledWith("dune-teaser");

    act(() => {
      playerOptions.events.onError({ data: 150 });
    });
    expect(player.loadVideoById).toHaveBeenLastCalledWith("tenet");
  });

  // YouTube paints "unavailable" before the refusal reaches the page, and a
  // refused fallback reports buffering first, so only playing lifts the cover.
  it("covers each preview until it plays, including a refused one's fallback", async () => {
    mocks.getTmdbMovieDetails.mockImplementation(async (id) =>
      id === 202
        ? { title: "Dune", trailer: { key: "dune", fallbacks: [{ key: "dune-teaser" }] } }
        : DETAILS_BY_ID[id] || {}
    );
    const cover = () => document.querySelector(".tv-theater-cover");

    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));
    expect(cover()).toBeInTheDocument();

    act(() => {
      playerOptions.events.onError({ data: 150 });
      playerOptions.events.onStateChange({ data: 3 });
    });
    expect(cover()).toBeInTheDocument();

    act(() => {
      playerOptions.events.onStateChange({ data: 1 });
    });
    expect(cover()).toBeNull();

    act(() => {
      playerOptions.events.onStateChange({ data: 0 });
    });
    expect(cover()).toBeInTheDocument();
  });

  it("lays the previews out at the TV's page zoom so YouTube sizes the stream to the screen", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { scale: 0.5 } });
    try {
      await drawWithTheaterMode();
      await screen.findByRole("dialog", { name: /previews before arrival/i });

      expect(screen.getByTitle(/movie bowl previews/i).style.getPropertyValue("--player-zoom")).toBe("0.5");
    } finally {
      if (original) Object.defineProperty(window, "visualViewport", original);
      else delete window.visualViewport;
    }
  });

  it("pauses on Select and shows nothing else while playing", async () => {
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    // A cinema offers no controls, so the overlay draws none: the previews
    // cannot be skipped and the feature cannot be jumped to.
    expect(screen.queryByRole("button", { name: /next preview/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /skip to movie/i })).toBeNull();
    expect(screen.queryByText(/paused/i)).toBeNull();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(screen.getByText(/paused/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(player.playVideo).toHaveBeenCalled();
    expect(screen.queryByText(/paused/i)).toBeNull();
  });

  it("takes focus back when the player claims it, so Select still pauses", async () => {
    await drawWithTheaterMode();
    const overlay = await screen.findByRole("dialog", {
      name: /previews before arrival/i,
    });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    // The player takes focus when it starts. From inside the iframe our Select
    // handler never sees the key, which is exactly how pause failed on a real
    // television while Back — translated by the Android shell above the page —
    // kept working.
    const frame = screen.getByTitle(/movie bowl previews/i);
    frame.focus();
    fireEvent.blur(window);

    expect(overlay).toHaveFocus();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(player.pauseVideo).toHaveBeenCalled();
  });

  it("keeps the reveal beneath out of reach while previews play", async () => {
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    // Pressing right then OK on a real television moved focus to the reveal's
    // provider button behind the overlay and launched Max mid-preview. Our own
    // navigation already declined to go there, so the traversal was the
    // WebView's own — which aria-hidden does not constrain. inert does.
    const reveal = document.querySelector(".tv-reveal-page");
    expect(reveal).toHaveAttribute("inert");
    expect(reveal).toContainElement(
      screen.getByRole("link", { name: /watch on netflix/i, hidden: true })
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(document.activeElement).not.toHaveAttribute("data-tv-focusable");

    fireEvent.keyDown(window, { key: "Enter" });
    expect(player.pauseVideo).toHaveBeenCalled();
  });

  it("pauses on the synthetic event the Android shell dispatches", async () => {
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    // The shell consumes the remote's key and re-dispatches its own with
    // window.dispatchEvent, whose path is window alone. Listening on document
    // looks identical in a test that fires on document, and does nothing at
    // all on a television — which is how Select stayed dead while the arrows
    // and Back worked.
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 23,
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(player.pauseVideo).toHaveBeenCalled();
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });

  it("asks the embed for a player the remote cannot seek", async () => {
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });

    // Our own controls are gone, but YouTube ships its own, and its keyboard
    // shortcuts map onto the D-pad. Losing these turns the ritual back into a
    // seekable video.
    const src = screen.getByTitle(/movie bowl previews/i).getAttribute("src");
    expect(src).toContain("controls=0");
    expect(src).toContain("disablekb=1");
    expect(src).toContain("cc_load_policy=0");
  });

  it("asks for captions on the previews when the account wants them", async () => {
    mocks.drawSettings = { ...mocks.drawSettings, prerollCaptionsEnabled: true };
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });

    const src = screen.getByTitle(/movie bowl previews/i).getAttribute("src");
    expect(src).toContain("cc_load_policy=1");
  });

  it("exits the previews on the remote back button", async () => {
    await drawWithTheaterMode();
    const overlay = await screen.findByRole("dialog", { name: /previews before arrival/i });
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: "Escape" });

    // Back brings the lights up briefly rather than cutting to the reveal.
    expect(overlay).toHaveAttribute("data-lights", "raising");
    expect(player.pauseVideo).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(550);
    });
    vi.useRealTimers();

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector(".tv-reveal.is-tonight")).toBeInTheDocument();
  });

  // Fullscreen shows only the overlay, so fading it early fades to black.
  it("waits for fullscreen to let go before the lights come up", async () => {
    await drawWithTheaterMode();
    const overlay = await screen.findByRole("dialog", { name: /previews before arrival/i });

    let releaseFullscreen;
    const exitFullscreen = vi.fn(
      () => new Promise((resolve) => {
        releaseFullscreen = resolve;
      })
    );
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => overlay });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    try {
      fireEvent.keyDown(window, { key: "Escape" });

      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      expect(overlay).not.toHaveAttribute("data-lights", "raising");

      await act(async () => {
        releaseFullscreen();
      });
      expect(overlay).toHaveAttribute("data-lights", "raising");
    } finally {
      delete document.fullscreenElement;
      delete document.exitFullscreen;
    }
  });

  it("skips the lights on a second Back", async () => {
    await drawWithTheaterMode();
    await screen.findByRole("dialog", { name: /previews before arrival/i });

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /^draw$/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

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
    fireEvent.click(screen.getByRole("button", { name: /^draw$/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });

    expect(screen.getByText(/loading previews/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    vi.useRealTimers();

    expect(screen.queryByText(/loading previews/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector(".tv-reveal.is-tonight")).toBeInTheDocument();
  });

  it("keeps the plain reveal flow when theater mode is off", async () => {
    // An exhaustive rating filter resolves the pool without a single lookup,
    // so the only TMDB calls left to count are the ones previews would make.
    mocks.drawSettings = {
      ...mocks.drawSettings,
      theaterModeEnabled: false,
      selectedRatings: MPAA_RATING_OPTIONS,
    };

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /^draw$/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    expect(
      screen.queryByRole("dialog", { name: /previews before arrival/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector(".tv-reveal.is-tonight")).toBeInTheDocument();
    // Only the drawn movie is enriched; no preview lookups are made.
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledTimes(1);
  });
  describe("auto-start", () => {
    const TV_APP_USER_AGENT =
      "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 MovieBowlTV/0.1 AndroidTV";
    const NETFLIX_TITLE_URL = "https://www.netflix.com/title/80117401";
    let openSpy;

    function useUserAgent(userAgent) {
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
    }

    async function playToFeatureCard() {
      await drawWithTheaterMode();
      await screen.findByRole("dialog", { name: /previews before arrival/i });
      await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));
      act(() => {
        playerOptions.events.onStateChange({ data: 0 });
      });
      vi.useFakeTimers();
      act(() => {
        playerOptions.events.onStateChange({ data: 0 });
      });
      expect(screen.getByRole("heading", { name: /feature presentation/i })).toBeInTheDocument();
    }

    // The card, then a hand-off's hold in the dark, then the lights coming up.
    async function finishFeatureCard() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3600 + 1500 + 1600);
      });
      vi.useRealTimers();
    }

    beforeEach(() => {
      openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      mocks.providerLinks = [
        { service: "Netflix", type: "sub", webUrl: NETFLIX_TITLE_URL },
      ];
    });

    it("opens the provider app once the feature card runs its course", async () => {
      useUserAgent(TV_APP_USER_AGENT);
      await playToFeatureCard();

      expect(document.querySelector(".tv-theater-feature-logo")).not.toBeNull();
      expect(openSpy).not.toHaveBeenCalled();

      // The app opens while the room is still dark, so the lit reveal never
      // flashes up before it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3600);
      });
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("dialog", { name: /previews before arrival/i })).not.toHaveAttribute(
        "data-lights",
        "raising"
      );

      await finishFeatureCard();

      expect(screen.queryByRole("dialog", { name: /previews before arrival/i })).toBeNull();
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(NETFLIX_TITLE_URL, "_blank", "noopener,noreferrer");
      // The same bookkeeping as a press, so Back from the app finds the reveal.
      expect(readExternalReturn("family")).toEqual(expect.objectContaining({ id: "movie-1" }));
      expect(screen.getByRole("link", { name: /^watch on netflix$/i })).toBeInTheDocument();
    });

    it("does not open anything when Back ends the previews", async () => {
      useUserAgent(TV_APP_USER_AGENT);
      await playToFeatureCard();

      fireEvent.keyDown(window, { key: "Escape" });
      await finishFeatureCard();

      expect(screen.queryByRole("dialog", { name: /previews before arrival/i })).not.toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();
    });

    it("keeps the button when only a search link is known", async () => {
      useUserAgent(TV_APP_USER_AGENT);
      mocks.providerLinks = [];
      await playToFeatureCard();

      expect(document.querySelector(".tv-theater-feature-logo")).toBeNull();
      await finishFeatureCard();

      expect(openSpy).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: /^watch on netflix$/i })).toHaveAttribute(
        "href",
        expect.stringContaining("/search")
      );
    });

    it("keeps the button outside the Google TV app", async () => {
      useUserAgent("Mozilla/5.0 (Macintosh) Chrome/128.0");
      await playToFeatureCard();

      expect(document.querySelector(".tv-theater-feature-logo")).toBeNull();
      await finishFeatureCard();

      expect(openSpy).not.toHaveBeenCalled();
    });
  });
});
