import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [
    {
      id: "solo-feature",
      bowl_id: "family",
      tmdb_id: 101,
      title: "Arrival",
      genres: ["Drama"],
      runtime: 116,
    },
    {
      id: "solo-feature-copy",
      bowl_id: "friends",
      tmdb_id: 101,
      title: "Arrival",
      genres: ["Drama"],
      runtime: 116,
    },
    {
      id: "solo-preview",
      bowl_id: "family",
      tmdb_id: 202,
      title: "The Vast of Night",
      genres: ["Science Fiction"],
      runtime: 91,
    },
    {
      id: "solo-preview-copy",
      bowl_id: "friends",
      tmdb_id: 202,
      title: "The Vast of Night",
      genres: ["Science Fiction"],
      runtime: 91,
    },
  ],
  bowls: [
    { id: "family", name: "Family Night", titleCount: 2 },
    { id: "friends", name: "Friday Friends", titleCount: 2 },
  ],
  poolLoading: false,
  poolError: "",
  reload: vi.fn(),
  theaterModeEnabled: false,
  isPersisted: true,
  setOverride: vi.fn(),
  setOverrides: vi.fn(),
  poolStatus: "unfiltered",
  eligibleMovieIds: null,
  draw: vi.fn(),
  retrySave: vi.fn(),
  dismissResult: vi.fn(),
  clearError: vi.fn(),
  drawError: "",
  canRetrySave: false,
  startProviderLookup: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
  resolveEligiblePreviewIds: vi.fn(),
  buildTrailerQueue: vi.fn(),
  rememberTrailerKeys: vi.fn(),
}));

vi.mock("../../hooks/useSoloDrawPool", () => ({
  default: () => ({
    rows: mocks.rows,
    bowls: mocks.bowls,
    isLoading: mocks.poolLoading,
    errorMessage: mocks.poolError,
    reload: mocks.reload,
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: ["Netflix"],
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      theaterModeEnabled: mocks.theaterModeEnabled,
      theaterTrailerCount: 2,
      selectedRatings: ["PG", "PG-13", "R"],
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

vi.mock("../../hooks/useDeviceDrawSettings", () => ({
  default: (_userId, settings) => ({
    settings,
    overriddenSettings: {},
    isPersisted: mocks.isPersisted,
    setOverride: mocks.setOverride,
    setOverrides: mocks.setOverrides,
  }),
}));

vi.mock("../../hooks/useSoloDraw", () => ({
  default: () => ({
    draw: mocks.draw,
    retrySave: mocks.retrySave,
    dismissResult: mocks.dismissResult,
    clearError: mocks.clearError,
    isDrawing: false,
    result: null,
    errorMessage: mocks.drawError,
    canRetrySave: mocks.canRetrySave,
  }),
}));

vi.mock("../../hooks/useDrawPoolCount", () => ({
  DRAW_POOL_STATUS: {
    unfiltered: "unfiltered",
    manual: "manual",
    counting: "counting",
    ready: "ready",
  },
  default: (rows) => ({
    status: mocks.poolStatus,
    poolCount: mocks.eligibleMovieIds ? mocks.eligibleMovieIds.length : (rows || []).length,
    eligibleMovieIds: mocks.eligibleMovieIds,
  }),
}));

vi.mock("../../hooks/useDrawProviderLinks", () => ({
  default: () => ({
    providerLinks: [],
    startLookup: mocks.startProviderLookup,
  }),
}));

vi.mock("../../lib/tmdbApi", async (importOriginal) => ({
  ...(await importOriginal()),
  getTmdbMovieDetails: (...args) => mocks.getTmdbMovieDetails(...args),
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: (...args) => mocks.fetchStreamingProviders(...args),
}));

vi.mock("../../lib/theaterPreviews", () => ({
  fetchMovieTrailer: vi.fn(),
  resolveEligiblePreviewIds: (...args) => mocks.resolveEligiblePreviewIds(...args),
}));

vi.mock("../../utils/theaterQueue", () => ({
  buildTrailerQueue: (...args) => mocks.buildTrailerQueue(...args),
  readRecentTrailerKeys: () => [],
  rememberTrailerKeys: (...args) => mocks.rememberTrailerKeys(...args),
}));

vi.mock("../components/TvTheaterPreroll", () => ({
  default: ({ featureTitle, onComplete }) => (
    <div role="dialog" aria-label="Previews before arrival">
      <span>{featureTitle}</span>
      <button type="button" onClick={onComplete}>Finish previews</button>
    </div>
  ),
}));

import TvSoloDrawScreen from "../screens/TvSoloDrawScreen";

function renderSolo() {
  return render(
    <MemoryRouter initialEntries={["/tv/solo"]}>
      <Routes>
        <Route path="/tv/solo" element={<TvSoloDrawScreen userId="user-1" />} />
        <Route path="/tv/bowls" element={<div>Bowl picker</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function revealMovie() {
  fireEvent.click(screen.getByRole("button", { name: /draw for myself/i }));
  fireEvent.click(screen.getByRole("button", { name: /reveal one/i }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1800);
  });
}

describe("TV solo draw", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.poolLoading = false;
    mocks.poolError = "";
    mocks.theaterModeEnabled = false;
    mocks.isPersisted = true;
    mocks.drawError = "";
    mocks.canRetrySave = false;
    mocks.draw.mockReset().mockResolvedValue({
      ...mocks.rows[0],
      streamingProviders: ["Netflix"],
      watchEventId: "watch-1",
      watchedOn: "2026-09-16",
    });
    mocks.retrySave.mockReset();
    mocks.dismissResult.mockReset();
    mocks.clearError.mockReset();
    mocks.reload.mockReset();
    mocks.setOverride.mockReset();
    mocks.setOverrides.mockReset();
    mocks.poolStatus = "unfiltered";
    mocks.eligibleMovieIds = null;
    mocks.startProviderLookup.mockReset();
    mocks.getTmdbMovieDetails.mockReset().mockResolvedValue({
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: [{ name: "Science Fiction" }],
      overview: "A linguist meets visitors from beyond Earth.",
    });
    mocks.fetchStreamingProviders.mockReset().mockResolvedValue({
      providers: ["Netflix"],
      providerLogos: {},
      region: "US",
      fetchedAt: null,
    });
    mocks.resolveEligiblePreviewIds.mockReset().mockResolvedValue(
      mocks.rows.map((movie) => movie.id)
    );
    mocks.buildTrailerQueue.mockReset().mockResolvedValue([
      {
        movie: mocks.rows[2],
        trailer: { key: "preview-202", embedUrl: "https://www.youtube.com/embed/preview-202" },
      },
    ]);
    mocks.rememberTrailerKeys.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the idle screen focused on the draw instead of reproducing the busy mockup", () => {
    renderSolo();

    expect(screen.getByRole("heading", { name: "Pick one of yours." })).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) =>
        Boolean(element?.classList?.contains("tv-solo-pool-summary"))
      )
    ).toHaveTextContent("2 titles across 2 bowls");
    expect(screen.getByRole("button", { name: /draw for myself/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /theater mode/i })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText(/watch history/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /family night/i })).not.toBeInTheDocument();
  });

  it("confirms, animates, and reveals a committed solo pick", async () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /draw for myself/i }));
    expect(screen.getByRole("dialog", { name: /pick one of your movies/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reveal one/i }));
    expect(screen.getByRole("heading", { name: /picking one of yours/i })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });

    expect(screen.getByRole("heading", { name: "Arrival (2016)" })).toBeInTheDocument();
    expect(screen.getByText("From Family Night • Saved to your Watch History")).toBeInTheDocument();
    expect(mocks.draw).toHaveBeenCalledWith(
      mocks.rows,
      expect.objectContaining({ prioritizeByServices: false })
    );
    expect(mocks.startProviderLookup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "solo-feature" })
    );
  });

  it("deduplicates previews and excludes every copy of the selected feature", async () => {
    mocks.theaterModeEnabled = true;
    renderSolo();

    await revealMovie();

    expect(screen.getByRole("dialog", { name: /previews before arrival/i })).toBeInTheDocument();
    const queueOptions = mocks.buildTrailerQueue.mock.calls[0][0];
    expect(queueOptions.movies.map((movie) => movie.id)).toEqual(["solo-preview"]);
    expect(queueOptions.eligibleMovieIds).toEqual(["solo-preview"]);
    expect(queueOptions.excludeMovieId).toBe("solo-feature");
  });

  it("keeps theater mode device-local", () => {
    renderSolo();

    fireEvent.click(screen.getByRole("switch", { name: /theater mode/i }));
    expect(mocks.setOverride).toHaveBeenCalledWith("theaterModeEnabled", true);
  });

  // What the draw is working from is a sentence at rest and a screen on demand:
  // the stage keeps one target, and the detail that shaped the rejected
  // exploration lives a press away.
  it("opens the scope sheet from the line that reports the pool", () => {
    renderSolo();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /change bowls and streaming/i }));

    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent("Your bowls");
    expect(screen.getByRole("button", { name: /family night/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // The streaming control belongs to the sheet, never to the idle stage.
    expect(screen.getByRole("radiogroup", { name: /streaming/i })).toBeInTheDocument();
  });

  it("counts slips per bowl and distinct titles on the stage", () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /change bowls and streaming/i }));

    // Two bowls hold two copies each of the same two movies: four slips, two
    // titles, and each title still gets one chance.
    expect(screen.getByRole("button", { name: /family night/i })).toHaveTextContent("2 titles");
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(
      screen.getByText((_content, element) =>
        Boolean(element?.classList?.contains("tv-solo-pool-summary"))
      )
    ).toHaveTextContent("2 titles across 2 bowls");
  });

  it("narrows the pool to the chosen bowls and draws from them", async () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /change bowls and streaming/i }));
    fireEvent.click(screen.getByRole("button", { name: /friday friends/i }));
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));

    expect(
      screen.getByText((_content, element) =>
        Boolean(element?.classList?.contains("tv-solo-pool-summary"))
      )
    ).toHaveTextContent("2 titles across 1 bowl");

    await revealMovie();

    const [drawPool] = mocks.draw.mock.calls[0];
    expect(drawPool.map((movie) => movie.id)).toEqual(["solo-feature", "solo-preview"]);
  });

  it("restores every bowl from the sheet", () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /change bowls and streaming/i }));
    fireEvent.click(screen.getByRole("button", { name: /friday friends/i }));
    expect(screen.getByRole("button", { name: /friday friends/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    fireEvent.click(screen.getByRole("button", { name: /all bowls/i }));
    expect(screen.getByRole("button", { name: /friday friends/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("says how many titles the filters leave, once it knows", () => {
    mocks.poolStatus = "ready";
    // One copy survives; its twin in the other bowl does not. They are one
    // title either way, so the line must not say two.
    mocks.eligibleMovieIds = ["solo-feature"];
    renderSolo();

    expect(
      screen.getByText((_content, element) =>
        Boolean(element?.classList?.contains("tv-solo-pool-summary"))
      )
    ).toHaveTextContent("1 of 2 titles across 2 bowls");
  });

  it("keeps the plain count while the filters are still being checked", () => {
    mocks.poolStatus = "counting";
    mocks.eligibleMovieIds = null;
    renderSolo();

    expect(
      screen.getByText((_content, element) =>
        Boolean(element?.classList?.contains("tv-solo-pool-summary"))
      )
    ).toHaveTextContent("2 titles across 2 bowls");
  });

  it("keeps a streaming change on this television", () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /change bowls and streaming/i }));
    fireEvent.click(screen.getByRole("radio", { name: /favor netflix/i }));

    // A television is shared: relaxing a filter tonight must not rewrite the
    // account somebody browses with tomorrow.
    expect(mocks.setOverrides).toHaveBeenCalledWith({
      prioritizeStreaming: true,
      useStreamingRank: false,
    });
  });

  it("closes the sheet on Back before it leaves the screen", () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /change bowls and streaming/i }));
    fireEvent.keyDown(window, { key: "Backspace" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pick one of yours." })).toBeInTheDocument();
  });

  it("returns to the picker with solo focus restored", () => {
    renderSolo();

    fireEvent.click(screen.getByRole("button", { name: /choose a bowl/i }));
    expect(screen.getByText("Bowl picker")).toBeInTheDocument();
  });
});
