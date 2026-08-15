import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bowls: [
    {
      id: "family",
      name: "Family Night",
      remainingCount: 12,
      memberCount: 4,
      role: "Owner",
      lastActivityAt: "2026-07-27T20:00:00.000Z",
    },
    {
      id: "friends",
      name: "Friday Friends",
      remainingCount: 8,
      memberCount: 6,
      role: "Member",
      lastActivityAt: "2026-07-26T20:00:00.000Z",
    },
  ],
  reloadBowls: vi.fn(),
  bowlData: {
    remaining: [
      {
        id: "movie-1",
        tmdb_id: 101,
        title: "Arrival",
        genres: ["Science Fiction", "Drama"],
      },
    ],
    watched: [
      {
        id: "draw-1",
        drawEventId: "draw-1",
        bowlMovieId: "movie-1",
        title: "Arrival",
      },
    ],
  },
  bowlError: null,
  bowlLoading: false,
  handleDraw: vi.fn(),
  handleReaddMovie: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  streamingServices: ["Netflix", "Max"],
  prioritizeStreaming: true,
  providersByTmdbId: { 101: ["Netflix"] },
}));

vi.mock("../hooks/useTvBowls", () => ({
  useTvBowls: () => ({
    bowls: mocks.bowls,
    isLoading: false,
    errorMessage: null,
    reload: mocks.reloadBowls,
  }),
  useTvBowlAccess: () => ({
    bowlMeta: {
      name: "Family Night",
      ownerId: "user-1",
      canDraw: true,
    },
    isLoading: false,
    errorMessage: null,
  }),
}));

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.bowlData,
    isLoading: mocks.bowlLoading,
    errorMessage: mocks.bowlError,
    handleDraw: mocks.handleDraw,
    handleReaddMovie: mocks.handleReaddMovie,
  }),
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: async (tmdbId) => ({
    providers: mocks.providersByTmdbId[tmdbId] || [],
    region: "US",
    fetchedAt: null,
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.streamingServices,
    defaultDrawSettings: {
      prioritizeStreaming: mocks.prioritizeStreaming,
      useStreamingRank: true,
      selectedRatings: ["PG", "PG-13", "R"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 80,
      runtimeMaxMinutes: 180,
      includeUnknownRuntime: true,
    },
    loading: false,
  }),
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

import TvBowlPicker from "../screens/TvBowlPicker";
import TvTonightScreen from "../screens/TvTonightScreen";

function renderPicker({ autoOpenLastBowl = false, path = "/tv/bowls" } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <TvBowlPicker
              userId="user-1"
              userEmail="viewer@example.com"
              autoOpenLastBowl={autoOpenLastBowl}
            />
          }
        />
        <Route path="/tv/bowl/:bowlId" element={<div>Tonight route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderTonight() {
  return render(
    <MemoryRouter initialEntries={["/tv/bowl/family"]}>
      <Routes>
        <Route
          path="/tv/bowl/:bowlId"
          element={
            <TvTonightScreen
              userId="user-1"
              userEmail="viewer@example.com"
            />
          }
        />
        <Route path="/tv/bowls" element={<div>Bowl picker route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function setElementRect(element, { left, top, width, height }) {
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  });
}

describe("Movie Bowl TV experience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.handleDraw.mockReset();
    mocks.handleReaddMovie.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.bowlError = null;
    mocks.bowlLoading = false;
    mocks.streamingServices = ["Netflix", "Max"];
    mocks.prioritizeStreaming = true;
    mocks.providersByTmdbId = { 101: ["Netflix"] };
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens the last bowl directly from the TV launch route", async () => {
    window.localStorage.setItem("movie-bowl:tv:last-bowl:user-1", "friends");

    renderPicker({ autoOpenLastBowl: true, path: "/tv" });

    expect(await screen.findByText("Tonight route")).toBeInTheDocument();
  });

  it("remembers the last bowl as a focus preference on the bowl picker", async () => {
    window.localStorage.setItem("movie-bowl:tv:last-bowl:user-1", "friends");

    renderPicker();

    expect(screen.getByRole("heading", { name: "Choose a bowl" })).toBeInTheDocument();
    expect(screen.getByText("Last opened")).toBeInTheDocument();

    const familyButton = screen.getByRole("button", { name: /family night/i });
    const friendsButton = screen.getByRole("button", { name: /friday friends/i });
    const exitButton = screen.getByRole("button", { name: /exit tv mode/i });

    setElementRect(familyButton, { left: 40, top: 180, width: 360, height: 260 });
    setElementRect(friendsButton, { left: 430, top: 180, width: 360, height: 260 });
    setElementRect(exitButton, { left: 900, top: 20, width: 160, height: 60 });

    await waitFor(() => expect(friendsButton).toHaveFocus());

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(friendsButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(familyButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(friendsButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText("Tonight route")).toBeInTheDocument();
  });

  it("states how much of the bowl the draw is favoring", async () => {
    renderTonight();

    expect(await screen.findByText(/favoring 1 on netflix/i)).toBeInTheDocument();
  });

  it("counts matches without claiming the draw is filtered when prioritizing is off", async () => {
    mocks.prioritizeStreaming = false;

    renderTonight();

    expect(await screen.findByText(/1 on your services/i)).toBeInTheDocument();
    expect(screen.queryByText(/favoring/i)).not.toBeInTheDocument();
  });

  it("warns on TV when streaming priority matches nothing", async () => {
    mocks.providersByTmdbId = { 101: ["Paramount+"] };

    renderTonight();

    const line = await screen.findByText(/no matches — drawing from all/i);
    expect(line).toHaveAttribute("data-tone", "warning");
  });

  it("draws once with saved preferences and offers no immediate return path", async () => {
    mocks.handleDraw.mockResolvedValue({
      id: "movie-1",
      tmdb_id: 101,
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      overview: "A linguist works with the military to communicate with alien visitors.",
      streamingProviders: ["Netflix"],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      overview: "A linguist works with the military to communicate with alien visitors.",
      trailer: {
        embedUrl: "https://www.youtube.com/embed/arrival",
      },
    });
    const view = renderTonight();

    expect(screen.getByRole("heading", { name: /let the bowl decide/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    expect(screen.getByRole("dialog", { name: /reveal one movie/i })).toBeInTheDocument();

    vi.useFakeTimers();
    const revealButton = screen.getByRole("button", { name: /reveal a movie/i });
    act(() => {
      revealButton.click();
      revealButton.click();
    });

    expect(screen.getByText(/drawing tonight's movie/i)).toBeInTheDocument();

    mocks.bowlLoading = true;
    view.rerender(
      <MemoryRouter initialEntries={["/tv/bowl/family"]}>
        <Routes>
          <Route
            path="/tv/bowl/:bowlId"
            element={
              <TvTonightScreen
                userId="user-1"
                userEmail="viewer@example.com"
              />
            }
          />
          <Route path="/tv/bowls" element={<div>Bowl picker route</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.queryByText(/getting tonight's bowl ready/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/drawing tonight's movie/i)).toBeInTheDocument();

    mocks.bowlLoading = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /arrival/i })).toBeInTheDocument();
    });
    expect(mocks.handleDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        prioritizeByServices: true,
        prioritizeByServiceRank: true,
        userStreamingServices: ["Netflix", "Max"],
        runtimeFilter: {
          minMinutes: 80,
          maxMinutes: 180,
          includeUnknown: true,
        },
      })
    );
    expect(mocks.handleDraw).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: /open in netflix/i })
    ).toHaveAttribute(
      "href",
      "https://www.netflix.com/search?q=Arrival%202016"
    );
    let youtubePlayerOptions;
    window.YT = {
      Player: vi.fn((_playerId, options) => {
        youtubePlayerOptions = options;
        return { destroy: vi.fn() };
      }),
      PlayerState: { ENDED: 0 },
    };

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));

    const trailerDialog = screen.getByRole("dialog", {
      name: /arrival trailer/i,
    });
    expect(trailerDialog).toBeInTheDocument();
    expect(screen.getByTitle(/arrival trailer/i)).toHaveAttribute(
      "src",
      expect.stringContaining("autoplay=1")
    );
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    act(() => {
      youtubePlayerOptions.events.onStateChange({ data: 0 });
    });

    expect(
      screen.queryByRole("dialog", { name: /arrival trailer/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /arrival/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /we're not watching this/i })
    ).not.toBeInTheDocument();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.getByRole("heading", { name: /let the bowl decide/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Bowl picker route")).not.toBeInTheDocument();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Bowl picker route")).toBeInTheDocument();
  });

  it("navigates from the draw control into Watch History and returns a selected movie", async () => {
    mocks.handleReaddMovie.mockResolvedValue({ ok: true });

    renderTonight();

    const drawButton = screen.getByRole("button", { name: /draw a movie/i });
    const historyButton = screen.getByRole("button", {
      name: /move arrival from watch history back to the bowl/i,
    });
    const changeBowlButton = screen.getByRole("button", { name: /change bowl/i });

    setElementRect(drawButton, { left: 120, top: 180, width: 620, height: 90 });
    setElementRect(historyButton, { left: 140, top: 420, width: 220, height: 90 });
    setElementRect(changeBowlButton, { left: 900, top: 20, width: 160, height: 60 });

    await waitFor(() => expect(drawButton).toHaveFocus());

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(historyButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(
      screen.getByRole("dialog", { name: /move “arrival” back to the bowl/i })
    ).toBeInTheDocument();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^return to bowl$/i }));

    await waitFor(() => {
      expect(mocks.handleReaddMovie).toHaveBeenCalledWith("draw-1");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show a bowl-switch shortcut after accepting the selected movie", async () => {
    mocks.handleDraw.mockResolvedValue({
      id: "movie-1",
      tmdb_id: 101,
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      streamingProviders: ["Netflix"],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
    });

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /that's the one/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /that's the one/i }));

    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /choose another bowl/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /we're not watching this/i })
    ).not.toBeInTheDocument();
  });
});
