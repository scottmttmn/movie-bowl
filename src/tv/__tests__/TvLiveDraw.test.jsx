import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bowlData: {
    remaining: [
      { id: "movie-1", tmdb_id: 101, title: "Arrival", added_by: "user-1" },
      { id: "movie-2", tmdb_id: 202, title: "Dune", added_by: "user-1" },
    ],
    watched: [],
  },
  handleDraw: vi.fn(),
  reload: vi.fn(),
  getTmdbMovieDetails: vi.fn(async () => ({})),
  live: { props: null, announceDraw: vi.fn() },
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
    reload: mocks.reload,
    handleDraw: mocks.handleDraw,
    handleReaddMovie: vi.fn(),
    filterMetadataFetchers: {
      fetchMovieDetails: (tmdbId) => mocks.getTmdbMovieDetails(tmdbId),
      fetchProviders: async () => ({ providers: [], region: "US", fetchedAt: null }),
      fetchFilterMetadata: async () => null,
    },
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: [],
    displayName: "Owner",
    defaultDrawSettings: {
      prioritizeStreaming: false,
      includeUnknownRatings: true,
      includeUnknownGenres: true,
      includeUnknownRuntime: true,
      theaterModeEnabled: false,
    },
    loading: false,
  }),
}));

vi.mock("../../hooks/useBowlLiveDraw", () => ({
  default: (props) => {
    mocks.live.props = props;
    return { televisionPresent: false, announceDraw: mocks.live.announceDraw };
  },
}));

vi.mock("../../lib/tmdbApi", () => ({ getTmdbMovieDetails: mocks.getTmdbMovieDetails }));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: async () => ({ providers: [], region: "US", fetchedAt: null }),
}));
vi.mock("../../lib/providerLinks", () => ({ fetchProviderLinks: async () => ({ links: [] }) }));

import { clearDrawSelectionCache } from "../../utils/drawSelection";
import TvTonightScreen from "../screens/TvTonightScreen";

function renderTonight() {
  return render(
    <MemoryRouter initialEntries={["/tv/bowl/family"]}>
      <Routes>
        <Route path="/tv/bowl/:bowlId" element={<TvTonightScreen userId="user-1" />} />
      </Routes>
    </MemoryRouter>
  );
}

const announced = (overrides = {}) => ({
  bowlMovieId: "movie-1",
  title: "Arrival",
  methodId: "person_first",
  preview: null,
  reveal: null,
  drawnBy: "Robin",
  ...overrides,
});

describe("TV live draw", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearDrawSelectionCache();
    mocks.handleDraw.mockReset();
    mocks.reload.mockReset();
    mocks.live = { props: null, announceDraw: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("listens on its bowl as a television while it sits on the draw screen", () => {
    renderTonight();
    expect(mocks.live.props).toMatchObject({ bowlId: "family", surface: "tv", available: true });

    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));
    expect(mocks.live.props.available).toBe(false);
  });

  it("plays a phone's draw with the drawer's name, then lands on the movie", async () => {
    mocks.reload.mockResolvedValue({
      watched: [{ id: "event-1", drawEventId: "event-1", bowlMovieId: "movie-1", tmdb_id: 101, title: "Arrival", added_by: "user-1", drawn_at: new Date().toISOString() }],
    });
    renderTonight();

    vi.useFakeTimers();
    await act(async () => {
      mocks.live.props.onDraw(announced());
      await Promise.resolve();
    });
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".tv-draw-reveal-stage [data-testid='draw-reveal-drawn-by']")).toHaveTextContent("Robin");
    expect(mocks.live.props.available).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    vi.useRealTimers();
    await waitFor(() => expect(document.querySelector(".draw-reveal-stage")).toBeNull());
    expect(screen.getAllByText("Arrival").length).toBeGreaterThan(0);
    expect(mocks.live.announceDraw).not.toHaveBeenCalled();
  });

  it("ignores an announcement the reloaded bowl does not show", async () => {
    mocks.reload.mockResolvedValue({ watched: [] });
    renderTonight();

    vi.useFakeTimers();
    await act(async () => {
      mocks.live.props.onDraw(announced({ bowlMovieId: "nope" }));
      await vi.advanceTimersByTimeAsync(3000);
    });
    vi.useRealTimers();
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    expect(mocks.live.props.available).toBe(true);
  });

  it("announces its own draw without naming anyone", async () => {
    mocks.handleDraw.mockResolvedValue({ id: "movie-1", tmdb_id: 101, title: "Arrival", streamingProviders: [] });
    renderTonight();

    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));
    fireEvent.click(screen.getByRole("button", { name: /^draw$/i }));
    await waitFor(() => expect(mocks.live.announceDraw).toHaveBeenCalledTimes(1));
    expect(mocks.live.announceDraw).toHaveBeenCalledWith(expect.objectContaining({
      bowlMovieId: "movie-1",
      title: "Arrival",
      drawnBy: "",
    }));
  });
});
