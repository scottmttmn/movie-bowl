import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MPAA_RATING_OPTIONS } from "../../utils/movieRatings";
import { AUTOSAVE_DELAY_MS } from "../../hooks/useAutosave";
import { DEFAULT_DRAW_SETTINGS } from "../../utils/drawSettings";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1" },
    memberRows: [{ user_id: "u1" }, { user_id: "u2" }],
    bowlData: {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 180 }],
      watched: [],
    },
    drawOdds: [{ bucketKey: "user:u1", member: "owner@example.com", movieCount: 1, drawOdds: 1 }],
    handleDraw: vi.fn(async () => null),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
    providerLinks: [],
    drawnProviders: [],
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
    locationHash: "",
    preferencesLoading: false,
    preferencesLoadError: null,
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
    reloadPreferences: vi.fn(),
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
  default: () => ({
    bowl: mocks.state.bowlData,
    drawOdds: mocks.state.drawOdds,
    isLoading: false,
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
    defaultDrawSettings: mocks.state.defaultDrawSettings,
    loading: mocks.state.preferencesLoading,
    loadError: mocks.state.preferencesLoadError,
    saveDefaultDrawSettings: mocks.state.saveDefaultDrawSettings,
    reloadStreamingServices: mocks.state.reloadPreferences,
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({
    providers: mocks.state.drawnProviders,
    region: "US",
    fetchedAt: null,
  })),
}));

vi.mock("../../hooks/useDrawProviderLinks", () => ({
  default: () => ({ providerLinks: mocks.state.providerLinks, startLookup: vi.fn() }),
}));

vi.mock("../../lib/theaterPreviews", () => ({
  resolveEligiblePreviewIds: vi.fn(async () => mocks.state.resolveEligiblePreviewIds?.() ?? null),
  fetchMovieTrailer: vi.fn(async (movie) => ({ key: `key-${movie.id}`, site: "YouTube" })),
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

function renderDashboard() {
  return render(<BowlDashboard />);
}

function confirmDraw() {
  fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
  expect(screen.getByText(/reveal a movie\?/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /reveal movie/i }));
}

describe("BowlDashboard draw preferences", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.preferencesLoading = false;
    mocks.state.preferencesLoadError = null;
    mocks.state.saveDefaultDrawSettings.mockReset();
    mocks.state.saveDefaultDrawSettings.mockImplementation(async (settings) => {
      mocks.state.defaultDrawSettings = { ...mocks.state.defaultDrawSettings, ...settings };
      return { error: null };
    });
    mocks.state.reloadPreferences.mockClear();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 180 }],
      watched: [],
    };
    mocks.state.drawOdds = [{ bucketKey: "user:u1", member: "owner@example.com", movieCount: 1, drawOdds: 1 }];
    mocks.state.handleDraw.mockClear();
    mocks.state.streamingServices = [];
    mocks.state.providerLinks = [];
    mocks.state.drawnProviders = [];
    mocks.state.defaultDrawSettings = {
      prioritizeStreaming: false,
      useStreamingRank: true,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    };
    mocks.state.locationHash = "";
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const settleAutosave = async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 50); });
  };

  it("owner draw uses the owner's streaming services in prioritize payload", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Netflix", "Max"],
          ratingFilter: {
            allowedRatings: MPAA_RATING_OPTIONS,
            includeUnknown: true,
          },
          genreFilter: {
            allowedGenres: ["Action"],
            includeUnknown: true,
          },
          runtimeFilter: {
            minMinutes: 0,
            maxMinutes: 500,
            includeUnknown: true,
          },
        })
      );
    });
  });

  it("member draw uses the member's streaming services in prioritize payload", async () => {
    mocks.state.streamingServices = ["Hulu"];
    mocks.state.authUserId = "u2";
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u2", tmdb_id: 101, title: "Movie A", genres: ["Action"] }],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Hulu"],
        })
      );
    });
  });

  it("can disable ranking while still prioritizing services", async () => {
    mocks.state.streamingServices = ["Hulu", "Netflix"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));
    const rankToggle = screen.getByRole("checkbox", { name: /use streaming service ranking/i });
    fireEvent.click(rankToggle);
    expect(rankToggle).not.toBeChecked();

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeByServices: true,
          prioritizeByServiceRank: false,
          userStreamingServices: ["Hulu", "Netflix"],
        })
      );
    });
  });

  it("resets ranking toggle to on whenever prioritize streaming is turned on", async () => {
    mocks.state.streamingServices = ["Hulu", "Netflix"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    const prioritizeToggle = screen.getByRole("checkbox", { name: /prioritize streaming services/i });
    fireEvent.click(prioritizeToggle);
    const rankToggle = screen.getByRole("checkbox", { name: /use streaming service ranking/i });
    fireEvent.click(rankToggle);
    expect(rankToggle).not.toBeChecked();

    fireEvent.click(prioritizeToggle);
    fireEvent.click(prioritizeToggle);

    expect(screen.getByRole("checkbox", { name: /use streaming service ranking/i })).toBeChecked();
  });

  it("includes selected genres in the draw payload", async () => {
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"] },
        { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B", genres: ["Comedy"] },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit genres/i }));
    fireEvent.click(screen.getByRole("button", { name: /draw genre Comedy/i }));

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          genreFilter: {
            allowedGenres: ["Action"],
            includeUnknown: true,
          },
        })
      );
    });
  });

  it("hydrates draw controls from saved default draw settings", async () => {
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.defaultDrawSettings = {
      prioritizeStreaming: true,
      useStreamingRank: false,
      selectedRatings: ["PG-13", "R"],
      includeUnknownRatings: false,
      selectedGenres: ["Action"],
      includeUnknownGenres: false,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 180,
      includeUnknownRuntime: false,
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit ratings/i }));

    expect(screen.getByRole("checkbox", { name: /prioritize streaming services/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /use streaming service ranking/i })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    expect(screen.getByRole("spinbutton", { name: /draw-runtime-max/i })).toHaveValue(180);
    expect(screen.getByRole("spinbutton", { name: /draw-runtime-min/i })).toHaveValue(0);
    const ratingControls = screen.getByRole("region", { name: /draw rating controls/i });
    expect(within(ratingControls).getByRole("button", { name: /only PG-13/i })).toBeInTheDocument();
    expect(within(ratingControls).queryByRole("button", { name: /only G/i })).not.toBeInTheDocument();
  });

  it("supports one-tap only action for genre chips", async () => {
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"] },
        { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B", genres: ["Comedy"] },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit genres/i }));
    fireEvent.click(screen.getByRole("button", { name: /only Comedy/i }));

    vi.useFakeTimers();
    confirmDraw();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          genreFilter: {
            allowedGenres: ["Comedy"],
            includeUnknown: true,
          },
        })
      );
    });
  });

  it("links to streaming service ranking from draw filters", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit streaming service ranking/i }));

    expect(mocks.state.navigate).toHaveBeenCalledWith("/settings#streaming-services");
  });

  it("waits for saved filters without writing hydration back, including zero runtime and absent genres", async () => {
    mocks.state.preferencesLoading = true;
    const { rerender } = renderDashboard();
    await screen.findByText("Bowl 1");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    mocks.state.defaultDrawSettings = { ...DEFAULT_DRAW_SETTINGS, runtimeMaxMinutes: 0, selectedGenres: ["Comedy"] };
    mocks.state.preferencesLoading = false;
    rerender(<BowlDashboard />);
    await settleAutosave();
    expect(mocks.state.saveDefaultDrawSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    expect(screen.getByLabelText("draw-runtime-max")).toHaveValue(0);
    fireEvent.click(screen.getByRole("button", { name: /edit genres/i }));
    expect(screen.getByRole("button", { name: "Only Comedy", exact: true })).toBeInTheDocument();
  });

  it("remembers filter edits after leaving the bowl and persists reset without playback keys", async () => {
    mocks.state.defaultDrawSettings = { ...DEFAULT_DRAW_SETTINGS, theaterModeEnabled: true, theaterTrailerCount: 2, enablePreferredWebLaunch: true };
    const { unmount } = renderDashboard();
    await screen.findByText("Bowl 1");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    fireEvent.change(screen.getByLabelText("draw-runtime-max"), { target: { value: "120" } });
    await settleAutosave();
    expect(mocks.state.saveDefaultDrawSettings).toHaveBeenCalledTimes(1);
    const savedFilters = mocks.state.saveDefaultDrawSettings.mock.calls[0][0];
    expect(savedFilters.runtimeMaxMinutes).toBe(120);
    expect(savedFilters).not.toHaveProperty("theaterModeEnabled");
    expect(savedFilters).not.toHaveProperty("theaterTrailerCount");
    expect(savedFilters).not.toHaveProperty("enablePreferredWebLaunch");
    unmount();
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    expect(screen.getByLabelText("draw-runtime-max")).toHaveValue(120);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await settleAutosave();
    expect(mocks.state.saveDefaultDrawSettings.mock.calls.at(-1)[0]).toEqual({ ...savedFilters, runtimeMaxMinutes: 500 });
    expect(mocks.state.defaultDrawSettings).toMatchObject({ theaterModeEnabled: true, theaterTrailerCount: 2, enablePreferredWebLaunch: true });
  });

  it("keeps failed edits usable and exposes retry even after closing the overlay", async () => {
    mocks.state.saveDefaultDrawSettings.mockResolvedValue({ error: new Error("Offline") });
    renderDashboard();
    await screen.findByText("Bowl 1");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    fireEvent.change(screen.getByLabelText("draw-runtime-max"), { target: { value: "120" } });
    await settleAutosave();
    expect(screen.getByRole("alert")).toHaveTextContent("These filters still work for this draw");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't be saved for next time");
    mocks.state.saveDefaultDrawSettings.mockResolvedValue({ error: null });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.state.saveDefaultDrawSettings).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    expect(screen.getByLabelText("draw-runtime-max")).toHaveValue(120);
  });

  it("flushes the final edit when navigating away before autosave runs", async () => {
    const { unmount } = renderDashboard();
    await screen.findByText("Bowl 1");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    fireEvent.change(screen.getByLabelText("draw-runtime-max"), { target: { value: "140" } });
    unmount();
    await act(async () => {});
    expect(mocks.state.saveDefaultDrawSettings).toHaveBeenCalledTimes(1);
    expect(mocks.state.saveDefaultDrawSettings.mock.calls[0][0]).toMatchObject({ runtimeMaxMinutes: 140 });
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps keyboard focus in the overlay and returns it on Escape without adding history", async () => {
    renderDashboard();
    await screen.findByText("Bowl 1");
    const trigger = screen.getByRole("button", { name: "Filters", exact: true });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Narrow the draw" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Reset" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(mocks.state.navigate).not.toHaveBeenCalled();
  });

  it("requires a successful preference load before enabling filter edits", async () => {
    mocks.state.preferencesLoadError = new Error("Network unavailable");
    renderDashboard();
    await screen.findByText("Bowl 1");
    fireEvent.click(screen.getByRole("button", { name: "Filters", exact: true }));
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /edit runtime/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.state.reloadPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.state.saveDefaultDrawSettings).not.toHaveBeenCalled();
  });

  // The dashboard reads theaterModeEnabled through the device layer, which is
  // the point: the account flag means "on the television," and a laptop that
  // inherited it would start playing previews at someone who never asked.
  describe("theater ticket", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    afterEach(() => {
      window.localStorage.clear();
    });

    it("starts off even when the account turned theater mode on for a television", async () => {
      mocks.state.defaultDrawSettings = {
        ...mocks.state.defaultDrawSettings,
        theaterModeEnabled: true,
      };
      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

      expect(screen.getByRole("switch", { name: /theater mode/i })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    it("arms on this device without touching the account setting", async () => {
      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("switch", { name: /theater mode/i }));

      await waitFor(() =>
        expect(screen.getByRole("switch", { name: /theater mode on/i })).toHaveAttribute(
          "aria-checked",
          "true"
        )
      );
      // Disarming here must never reach across and change a television, so the
      // ticket writes the device store and nothing else.
      expect(
        JSON.parse(window.localStorage.getItem("movie-bowl:tv:draw-settings:u1"))
      ).toEqual({ theaterModeEnabled: true });
      expect(mocks.state.saveDefaultDrawSettings).not.toHaveBeenCalledWith(
        expect.objectContaining({ theaterModeEnabled: expect.anything() })
      );
    });

    // Armed, the web behaves as the television does: the pick is revealed and
    // the previews play over it, with no prompt in between. The ticket beside
    // the draw button already answered that question.
    it("plays previews over the reveal once an armed draw lands", async () => {
      window.YT = {
        Player: vi.fn(() => ({ playVideo: vi.fn(), destroy: vi.fn() })),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      window.localStorage.setItem(
        "movie-bowl:tv:draw-settings:u1",
        JSON.stringify({ theaterModeEnabled: true })
      );
      mocks.state.bowlData = {
        remaining: [
          { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" },
          { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B" },
        ],
        watched: [],
      };
      mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A" });

      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
      confirmDraw();

      await waitFor(() =>
        expect(screen.getByRole("dialog", { name: /previews before movie a/i })).toBeInTheDocument()
      );

      // The reveal stays mounted underneath, so backing out lands on the drawn
      // movie -- but it must not be reachable while the previews play, or a
      // stray Enter opens a provider mid-preview.
      const reveal = document.querySelector(".modal-overlay");
      expect(reveal).toHaveAttribute("aria-hidden", "true");
      expect(reveal).toHaveAttribute("inert");
      delete window.YT;
    });

    // A refused autoplay swaps in "Tap to start", which re-attaches the
    // pre-roll's key listener after the reveal's. Escape must still leave the
    // previews and land on the pick rather than dismissing both.
    it("exits previews on Escape after autoplay was refused, keeping the reveal", async () => {
      let playerOptions;
      window.YT = {
        Player: vi.fn((_id, options) => {
          playerOptions = options;
          return { playVideo: vi.fn(), destroy: vi.fn() };
        }),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      window.localStorage.setItem(
        "movie-bowl:tv:draw-settings:u1",
        JSON.stringify({ theaterModeEnabled: true })
      );
      mocks.state.bowlData = {
        remaining: [
          { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" },
          { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B" },
        ],
        watched: [],
      };
      mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A" });

      try {
        renderDashboard();
        await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
        confirmDraw();

        await waitFor(() => expect(playerOptions).toBeDefined());
        act(() => playerOptions.events.onReady({ target: { playVideo: vi.fn() } }));
        await waitFor(
          () => expect(screen.getByRole("button", { name: /start previews/i })).toBeInTheDocument(),
          { timeout: 3000 }
        );

        fireEvent.keyDown(window, { key: "Escape" });

        await waitFor(() =>
          expect(screen.queryByRole("dialog", { name: /previews before/i })).not.toBeInTheDocument()
        );
        expect(document.querySelector(".modal-overlay")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /movie a/i })).toBeInTheDocument();
      } finally {
        delete window.YT;
      }
    });

    // The queue resolves after the reveal is up. Dismissing the reveal before
    // it lands must drop it, or the next draw opens on a stale pre-roll --
    // even with the ticket switched off in between.
    it("drops previews that resolve after the reveal was closed", async () => {
      window.YT = {
        Player: vi.fn(() => ({ playVideo: vi.fn(), destroy: vi.fn() })),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      window.localStorage.setItem(
        "movie-bowl:tv:draw-settings:u1",
        JSON.stringify({ theaterModeEnabled: true })
      );
      let releaseLookup;
      mocks.state.resolveEligiblePreviewIds = () =>
        new Promise((resolve) => {
          releaseLookup = () => resolve(null);
        });
      mocks.state.bowlData = {
        remaining: [
          { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" },
          { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B" },
        ],
        watched: [],
      };
      mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A" });

      try {
        renderDashboard();
        await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
        confirmDraw();

        await waitFor(() => expect(releaseLookup).toBeDefined());
        const reveal = document.querySelector(".modal-overlay");
        fireEvent.click(within(reveal).getAllByRole("button", { name: /close/i })[0]);
        await waitFor(() => expect(document.querySelector(".modal-overlay")).not.toBeInTheDocument());

        await act(async () => releaseLookup());
        fireEvent.click(screen.getByRole("switch", { name: /theater mode on/i }));
        mocks.state.resolveEligiblePreviewIds = null;
        confirmDraw();

        await waitFor(() => expect(screen.getByRole("heading", { name: /movie a/i })).toBeInTheDocument());
        expect(screen.queryByRole("dialog", { name: /previews before/i })).not.toBeInTheDocument();
      } finally {
        mocks.state.resolveEligiblePreviewIds = null;
        delete window.YT;
      }
    });

    it("shows no previews when this device never armed the ticket", async () => {
      mocks.state.bowlData = {
        remaining: [
          { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" },
          { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B" },
        ],
        watched: [],
      };
      mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A" });

      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
      confirmDraw();

      await waitFor(() => expect(screen.getByRole("heading", { name: /movie a/i })).toBeInTheDocument());
      expect(screen.queryByRole("dialog", { name: /previews before/i })).not.toBeInTheDocument();
    });

    it("remembers this device's answer across a reload", async () => {
      window.localStorage.setItem(
        "movie-bowl:tv:draw-settings:u1",
        JSON.stringify({ theaterModeEnabled: true })
      );
      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

      expect(screen.getByRole("switch", { name: /theater mode on/i })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });
  });
  // The desktop half of theater auto-start. The television's half is covered in
  // src/tv/__tests__/TvTheaterMode.test.jsx.
  describe("theater auto-start", () => {
    const NETFLIX_TITLE_URL = "https://www.netflix.com/title/80117401";
    let assign;
    let playerOptions;

    function useFinePointer(matches) {
      vi.stubGlobal("matchMedia", vi.fn((query) => ({ matches: query === "(pointer: fine)" && matches })));
    }

    async function playToFeatureCard() {
      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
      confirmDraw();

      await waitFor(() => expect(playerOptions).toBeDefined());
      act(() => playerOptions.events.onStateChange({ data: 1 }));
      vi.useFakeTimers();
      act(() => playerOptions.events.onStateChange({ data: 0 }));
      expect(screen.getByRole("heading", { name: /feature presentation/i })).toBeInTheDocument();
    }

    async function finishFeatureCard() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3600);
      });
      vi.useRealTimers();
    }

    beforeEach(() => {
      window.localStorage.clear();
      window.localStorage.setItem(
        "movie-bowl:tv:draw-settings:u1",
        JSON.stringify({ theaterModeEnabled: true })
      );
      playerOptions = undefined;
      window.YT = {
        Player: vi.fn((_id, options) => {
          playerOptions = options;
          return { playVideo: vi.fn(), stopVideo: vi.fn(), destroy: vi.fn() };
        }),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      assign = vi.fn();
      vi.stubGlobal("location", { ...window.location, assign });
      useFinePointer(true);
      mocks.state.streamingServices = ["Netflix"];
      mocks.state.providerLinks = [{ service: "Netflix", type: "sub", webUrl: NETFLIX_TITLE_URL }];
      mocks.state.drawnProviders = ["Netflix"];
      mocks.state.defaultDrawSettings = {
        ...mocks.state.defaultDrawSettings,
        enablePreferredWebLaunch: true,
      };
      mocks.state.bowlData = {
        remaining: [
          { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" },
          { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B" },
        ],
        watched: [],
      };
      mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A" });
    });

    afterEach(() => {
      delete window.YT;
      vi.unstubAllGlobals();
      window.localStorage.clear();
    });

    it("sends the tab to the provider's title page once the feature card runs its course", async () => {
      await playToFeatureCard();

      expect(document.querySelector(".theater-preroll-logo")).not.toBeNull();
      expect(assign).not.toHaveBeenCalled();

      await finishFeatureCard();

      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith(NETFLIX_TITLE_URL);
    });

    it("does not leave when Escape ends the previews", async () => {
      await playToFeatureCard();

      fireEvent.keyDown(window, { key: "Escape" });
      await finishFeatureCard();

      expect(screen.queryByRole("dialog", { name: /previews before/i })).not.toBeInTheDocument();
      expect(assign).not.toHaveBeenCalled();
    });

    it("does not leave when Exit ends the previews", async () => {
      await playToFeatureCard();

      fireEvent.click(screen.getByRole("button", { name: /exit previews/i }));
      await finishFeatureCard();

      expect(assign).not.toHaveBeenCalled();
    });

    it("keeps the button on a phone", async () => {
      useFinePointer(false);
      await playToFeatureCard();

      expect(document.querySelector(".theater-preroll-logo")).toBeNull();
      await finishFeatureCard();

      expect(assign).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: /open on web in netflix/i })).toHaveAttribute(
        "href",
        NETFLIX_TITLE_URL
      );
    });

    it("never launches what the reveal would not offer", async () => {
      mocks.state.defaultDrawSettings = {
        ...mocks.state.defaultDrawSettings,
        enablePreferredWebLaunch: false,
      };
      await playToFeatureCard();
      await finishFeatureCard();

      expect(assign).not.toHaveBeenCalled();
    });

    it("keeps the button when only a search link is known", async () => {
      mocks.state.providerLinks = [];
      await playToFeatureCard();
      await finishFeatureCard();

      expect(assign).not.toHaveBeenCalled();
    });

    it("does not navigate a tab nobody is looking at", async () => {
      await playToFeatureCard();
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await finishFeatureCard();

      expect(assign).not.toHaveBeenCalled();
    });
  });
});
