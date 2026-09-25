import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const state = {
    pool: {
      rows: [],
      bowls: [],
      bowlIds: [],
      isLoading: false,
      errorMessage: "",
    },
    draw: {
      isDrawing: false,
      result: null,
      errorMessage: "",
      canRetrySave: false,
    },
    streamingServices: [],
    defaultDrawSettings: {},
    removeFromBowlsOnSoloDraw: false,
    providerLinks: [],
  };

  return {
    state,
    reload: vi.fn(),
    removeRows: vi.fn(),
    draw: vi.fn(),
    retrySave: vi.fn(),
    dismissResult: vi.fn(),
    clearError: vi.fn(),
    runLookups: vi.fn(),
    poolStatus: { current: "unfiltered", poolCount: 0 },
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
    startProviderLookup: vi.fn(),
    useDrawProviderLinks: vi.fn(),
    getTmdbMovieDetails: vi.fn(async () => ({})),
    fetchStreamingProviders: vi.fn(async () => ({
      providers: [],
      providerLogos: {},
      region: "US",
      fetchedAt: null,
    })),
    fetchMovieFilterMetadata: vi.fn(async () => ({})),
    resolveEligiblePreviewIds: vi.fn(),
    fetchMovieTrailer: vi.fn(),
  };
});

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ session: { user: { id: "user-1" } } }),
}));
vi.mock("../../hooks/useSoloDrawPool", () => ({
  default: () => ({ ...mocks.state.pool, reload: mocks.reload, removeRows: mocks.removeRows }),
}));
vi.mock("../../hooks/useSoloDraw", () => ({
  default: () => ({
    ...mocks.state.draw,
    draw: mocks.draw,
    retrySave: mocks.retrySave,
    dismissResult: mocks.dismissResult,
    clearError: mocks.clearError,
  }),
}));
vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
    defaultDrawSettings: mocks.state.defaultDrawSettings,
    setDefaultDrawSettings: vi.fn(),
    saveDefaultDrawSettings: mocks.saveDefaultDrawSettings,
    removeFromBowlsOnSoloDraw: mocks.state.removeFromBowlsOnSoloDraw,
  }),
}));
vi.mock("../../hooks/useDrawProviderLinks", () => ({
  default: (...args) => mocks.useDrawProviderLinks(...args),
}));
vi.mock("../../hooks/useDrawPoolCount", () => ({
  default: () => ({
    status: mocks.poolStatus.current,
    poolCount: mocks.poolStatus.poolCount,
    eligibleMovieIds: mocks.poolStatus.eligibleMovieIds,
    runLookups: mocks.runLookups,
  }),
  DRAW_POOL_STATUS: {
    unfiltered: "unfiltered",
    manual: "manual",
    counting: "counting",
    ready: "ready",
  },
}));
vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));
vi.mock("../../lib/movieFilterMetadata", () => ({
  fetchMovieFilterMetadata: mocks.fetchMovieFilterMetadata,
}));
vi.mock("../../lib/theaterPreviews", () => ({
  resolveEligiblePreviewIds: mocks.resolveEligiblePreviewIds,
  fetchMovieTrailer: mocks.fetchMovieTrailer,
}));

import SoloDrawPage from "../SoloDrawPage";

function movie(id, bowlId) {
  return { id, bowl_id: bowlId, tmdb_id: 100, title: `Movie ${id}`, genres: [], runtime: 100 };
}

function renderPage(initialPath = "/solo-draw") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SoloDrawPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.state.pool = {
    rows: [movie("m1", "bowl-1"), movie("m2", "bowl-2")],
    bowls: [
      { id: "bowl-1", name: "First Bowl", titleCount: 1 },
      { id: "bowl-2", name: "Second Bowl", titleCount: 1 },
    ],
    bowlIds: ["bowl-1", "bowl-2"],
    isLoading: false,
    errorMessage: "",
  };
  mocks.state.draw = { isDrawing: false, result: null, errorMessage: "", canRetrySave: false };
  mocks.state.streamingServices = [];
  mocks.state.defaultDrawSettings = {};
  mocks.state.removeFromBowlsOnSoloDraw = false;
  mocks.state.providerLinks = [];
  mocks.poolStatus.current = "unfiltered";
  mocks.poolStatus.poolCount = 0;
  mocks.poolStatus.eligibleMovieIds = undefined;
  mocks.draw.mockReset();
  mocks.retrySave.mockReset();
  mocks.reload.mockReset();
  mocks.runLookups.mockReset();
  mocks.saveDefaultDrawSettings.mockClear();
  mocks.startProviderLookup.mockClear();
  mocks.useDrawProviderLinks.mockReset().mockImplementation(() => ({
    providerLinks: mocks.state.providerLinks,
    startLookup: mocks.startProviderLookup,
  }));
  mocks.getTmdbMovieDetails.mockReset().mockResolvedValue({});
  mocks.fetchStreamingProviders.mockReset().mockResolvedValue({
    providers: [],
    providerLogos: {},
    region: "US",
    fetchedAt: null,
  });
  mocks.fetchMovieFilterMetadata.mockReset().mockResolvedValue({});
  mocks.resolveEligiblePreviewIds.mockReset().mockImplementation(async ({ movies }) =>
    movies.map((entry) => entry.id)
  );
  mocks.fetchMovieTrailer.mockReset().mockImplementation(async (entry) => ({
    key: `trailer-${entry.id}`,
    site: "YouTube",
  }));
  window.localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
  delete window.YT;
  vi.unstubAllGlobals();
});

describe("SoloDrawPage", () => {
  it("starts with every bowl from the personal surface", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "First Bowl, 1 title" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "Second Bowl, 1 title" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("starts with one bowl when it came from that bowl's dashboard", async () => {
    renderPage("/solo-draw?bowl=bowl-2");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Second Bowl, 1 title" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "First Bowl, 1 title" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  // A bowl you have left cannot narrow the scope to nothing.
  it("falls back to every bowl when the entry bowl is not yours", async () => {
    renderPage("/solo-draw?bowl=bowl-gone");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "First Bowl, 1 title" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "Second Bowl, 1 title" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // A refresh walked the header through "no bowls selected" and "Checking
  // which titles match…" before settling. It now opens on last visit's answer.
  it("opens on the remembered readout and scope while the pool is still loading", () => {
    renderPage();
    const settledReadout = "Drawing from 1 of 1 of your titles";
    expect(screen.getByText(settledReadout)).toBeInTheDocument();
    cleanup();

    mocks.state.pool = { ...mocks.state.pool, rows: [], bowls: [], bowlIds: [], isLoading: true };
    renderPage();

    expect(screen.getByText(settledReadout)).toBeInTheDocument();
    expect(screen.getByText("across all your bowls")).toBeInTheDocument();
    expect(screen.queryByText("no bowls selected")).not.toBeInTheDocument();
  });

  it("holds its place without an interim answer on a first visit", () => {
    mocks.state.pool = { rows: [], bowls: [], bowlIds: [], isLoading: true, errorMessage: "" };
    mocks.poolStatus.current = "counting";
    renderPage();

    expect(screen.queryByText(/drawing from \d/i)).not.toBeInTheDocument();
    expect(screen.queryByText("no bowls selected")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Loading your movies…");
  });

  it("draws from the selected scope only", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Second Bowl, 1 title" }));
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));

    // The hold gesture is pointer-only; a click arrives as keyboard activation
    // and opens the confirm dialog instead of drawing.
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));

    expect(mocks.draw).toHaveBeenCalledTimes(1);
    expect(mocks.draw.mock.calls[0][0].map((row) => row.id)).toEqual(["m1"]);
  });

  it("asks for a bowl when the scope is empty", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "First Bowl, 1 title" }));
    fireEvent.click(screen.getByRole("button", { name: "Second Bowl, 1 title" }));

    expect(screen.getByText("Choose at least one bowl.")).toBeInTheDocument();
  });

  it("points at adding a movie when there is nothing anywhere", () => {
    mocks.state.pool = { rows: [], bowls: [], bowlIds: [], isLoading: false, errorMessage: "" };
    renderPage();

    expect(
      screen.getByText("You have no movies to draw. Add a movie to a bowl to get started.")
    ).toBeInTheDocument();
  });

  it("offers Retry for a failed read rather than an empty pool", async () => {
    mocks.state.pool = {
      rows: [],
      bowls: [],
      bowlIds: [],
      isLoading: false,
      errorMessage: "Could not load your movies. Please try again.",
    };
    renderPage();

    expect(screen.queryByText(/no movies to draw/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("waits for a tap before paying for lookups on a large pool", async () => {
    mocks.poolStatus.current = "manual";
    renderPage();

    expect(screen.getByText(/^1 title in scope\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check filter matches" }));
    expect(mocks.runLookups).toHaveBeenCalled();
  });

  it("retries a failed save instead of starting a new draw", async () => {
    mocks.state.draw = {
      isDrawing: false,
      result: null,
      errorMessage: "Could not save this draw. Please try again.",
      canRetrySave: true,
    };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retrySave).toHaveBeenCalled();
    expect(mocks.draw).not.toHaveBeenCalled();
  });

  // The draw is committed by the time it is on screen, so the reveal offers
  // nothing that would imply otherwise.
  it("reveals a committed pick with no acceptance or redraw controls", () => {
    mocks.state.draw = {
      isDrawing: false,
      result: { id: "m1", title: "Movie m1", tmdb_id: 100, watchEventId: "event-1" },
      errorMessage: "",
      canRetrySave: false,
    };
    renderPage();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Movie m1");
    expect(dialog).toHaveTextContent("Saved to your watch history.");
    expect(screen.queryByRole("button", { name: /keep|accept|draw again|redraw|remove/i })).toBeNull();
  });

  // With automatic removal on, the copies are gone by the time the pick is on
  // screen. Saying nothing would leave bowls quietly short a title.
  it("says what the draw took out of the bowls, and where to put it back", () => {
    mocks.state.draw = {
      isDrawing: false,
      result: {
        id: "m1",
        title: "Movie m1",
        tmdb_id: 100,
        watchEventId: "event-1",
        removedCopies: [
          { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Movie m1" },
          { id: "copy-2", bowlId: "bowl-2", bowlName: "Second Bowl", title: "Movie m1" },
        ],
      },
      errorMessage: "",
      canRetrySave: false,
    };
    renderPage();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Saved to your watch history, and your 2 copies were removed from your bowls. Undo there within two hours to put them back."
    );
    expect(screen.queryByRole("button", { name: /keep|accept|draw again|redraw|remove/i })).toBeNull();
  });

  // The promise the screen makes before the draw has to match what the draw
  // does. Under automatic removal the old copy told people their bowls were
  // safe, and then took the title out of every one of them.
  it("promises the bowls keep their copies only while they do", async () => {
    renderPage();
    expect(
      screen.getByText(/your bowls keep their copies/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Your bowls keep their copies.");

    cleanup();
    mocks.state.removeFromBowlsOnSoloDraw = true;
    renderPage();
    expect(screen.queryByText(/keep their copies/i)).toBeNull();
    expect(
      screen.getByText(/your copies leave your bowls/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("your copies leave your bowls");
  });

  // The pool is read once on mount, so a draw that empties bowls has to say so
  // to the hook holding it -- otherwise a title the server has already taken is
  // still offered as a candidate until the screen is mounted again.
  it("drops the copies a draw removed from the pool it holds", async () => {
    mocks.draw.mockResolvedValue({
      id: "m1",
      bowl_id: "bowl-1",
      tmdb_id: 100,
      title: "Movie m1",
      removedCopies: [
        { id: "m1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Movie m1" },
        { id: "m9", bowlId: "bowl-2", bowlName: "Second Bowl", title: "Movie m1" },
      ],
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));

    await waitFor(() => expect(mocks.removeRows).toHaveBeenCalledWith(["m1", "m9"]));
  });

  it("holds the bowl animation before opening the normal movie detail", async () => {
    mocks.draw.mockResolvedValue({
      id: "m1",
      bowl_id: "bowl-1",
      tmdb_id: 100,
      title: "Movie m1",
      watchedOn: "2026-09-16",
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      trailer: { key: "feature-trailer", site: "YouTube" },
    });

    renderPage();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));

    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector(".bowl-draw-pop-title")).toHaveTextContent("Movie m1");
    expect(screen.queryByRole("heading", { name: "Movie m1", level: 2 })).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(screen.queryByRole("heading", { name: "Movie m1", level: 2 })).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByRole("heading", { name: "Movie m1", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Saved to your watch history.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch trailer/i })).toBeInTheDocument();
    expect(mocks.startProviderLookup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1", bowl_id: "bowl-1" })
    );
  });

  it("stores the theater ticket on this device without changing account settings", async () => {
    mocks.state.defaultDrawSettings = { theaterModeEnabled: true };
    renderPage();

    const ticket = screen.getByRole("switch", { name: /theater mode/i });
    expect(ticket).toHaveAttribute("aria-checked", "false");
    fireEvent.click(ticket);

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /theater mode on/i })).toHaveAttribute(
        "aria-checked",
        "true"
      )
    );
    expect(
      JSON.parse(window.localStorage.getItem("movie-bowl:tv:draw-settings:user-1"))
    ).toEqual({ theaterModeEnabled: true });
    expect(mocks.saveDefaultDrawSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ theaterModeEnabled: expect.anything() })
    );
  });

  it("plays solo previews over the detail and never previews a duplicate feature copy", async () => {
    window.localStorage.setItem(
      "movie-bowl:tv:draw-settings:user-1",
      JSON.stringify({ theaterModeEnabled: true })
    );
    window.YT = {
      Player: vi.fn(() => ({ playVideo: vi.fn(), destroy: vi.fn() })),
      PlayerState: { ENDED: 0, PLAYING: 1 },
    };
    mocks.state.pool = {
      rows: [
        { ...movie("m1", "bowl-1"), tmdb_id: 101 },
        { ...movie("m1-copy", "bowl-2"), tmdb_id: 101 },
        { ...movie("m2", "bowl-2"), tmdb_id: 202 },
      ],
      bowls: [
        { id: "bowl-1", name: "First Bowl", titleCount: 1 },
        { id: "bowl-2", name: "Second Bowl", titleCount: 2 },
      ],
      bowlIds: ["bowl-1", "bowl-2"],
      isLoading: false,
      errorMessage: "",
    };
    mocks.draw.mockResolvedValue({
      ...mocks.state.pool.rows[0],
      title: "Feature Movie",
      watchedOn: "2026-09-16",
    });

    renderPage();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: /previews before feature movie/i })
      ).toBeInTheDocument()
    );
    expect(mocks.fetchMovieTrailer).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMovieTrailer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m2", tmdb_id: 202 })
    );
    const detail = document.querySelector(".modal-overlay");
    expect(detail).toHaveAttribute("aria-hidden", "true");
    expect(detail).toHaveAttribute("inert");
  });

  it("opens an exact provider title after the desktop pre-roll completes", async () => {
    const providerUrl = "https://www.netflix.com/title/80117401";
    const assign = vi.fn();
    let playerOptions;
    vi.stubGlobal("location", { ...window.location, assign });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query) => ({ matches: query === "(pointer: fine)" }))
    );
    window.localStorage.setItem(
      "movie-bowl:tv:draw-settings:user-1",
      JSON.stringify({ theaterModeEnabled: true })
    );
    window.YT = {
      Player: vi.fn((_id, options) => {
        playerOptions = options;
        return {
          playVideo: vi.fn(),
          stopVideo: vi.fn(),
          destroy: vi.fn(),
        };
      }),
      PlayerState: { ENDED: 0, PLAYING: 1 },
    };
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.defaultDrawSettings = { enablePreferredWebLaunch: true };
    mocks.state.providerLinks = [
      { service: "Netflix", type: "sub", webUrl: providerUrl },
    ];
    mocks.state.pool.rows = [
      { ...movie("m1", "bowl-1"), tmdb_id: 101 },
      { ...movie("m2", "bowl-2"), tmdb_id: 202 },
    ];
    mocks.draw.mockResolvedValue({
      ...mocks.state.pool.rows[0],
      title: "Feature Movie",
      watchedOn: "2026-09-16",
    });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      providerLogos: {},
      region: "US",
      fetchedAt: null,
    });

    renderPage();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => expect(playerOptions).toBeDefined());

    act(() => playerOptions.events.onStateChange({ data: 1 }));
    act(() => playerOptions.events.onStateChange({ data: 0 }));
    expect(screen.getByRole("heading", { name: /feature presentation/i })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600);
    });
    expect(assign).toHaveBeenCalledWith(providerUrl);
  });
});


describe("Solo draw redesign readouts", () => {
  it("counts distinct eligible pinned titles after filters, not duplicate slips", () => {
    mocks.state.pool.rows = [
      { ...movie("m1", "bowl-1"), is_pinned: true },
      movie("m2", "bowl-2"),
      { ...movie("m3", "bowl-2"), tmdb_id: 200 },
    ];
    mocks.poolStatus.eligibleMovieIds = ["m1", "m2", "m3"];
    renderPage();
    expect(screen.getByText("Drawing from 1 of 2 of your titles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All bowls 3" })).toBeInTheDocument();
  });

  it("disables the draw and offers filters when every title is excluded", () => {
    mocks.poolStatus.current = "ready";
    mocks.poolStatus.poolCount = 0;
    mocks.poolStatus.eligibleMovieIds = [];
    renderPage();
    expect(screen.getByRole("button", { name: /hold to draw/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Adjust filters" }));
    expect(screen.getByRole("dialog", { name: "Narrow the draw" })).toBeInTheDocument();
  });

  it("prevents another draw while the previous pick is waiting for a save retry", () => {
    mocks.state.draw.canRetrySave = true;
    renderPage();
    expect(screen.getByRole("button", { name: /hold to draw/i })).toBeDisabled();
  });
});
