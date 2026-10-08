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
    reload: vi.fn(),
    live: { televisionPresent: false, announceDraw: vi.fn(), props: null },
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
    preferencesLoading: false,
    preferencesLoadError: null,
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
          if (table === "bowls") return state.bowlError ? { data: null, error: state.bowlError } : { data: state.bowlRow, error: null };
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

vi.mock("../../hooks/useBowlAdd", () => ({ default: () => mocks.state.bowlAdd }));
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
    reload: mocks.state.reload,
  }),
}));

vi.mock("../../hooks/useBowlLiveDraw", () => ({
  default: (props) => {
    mocks.state.live.props = props;
    return { televisionPresent: mocks.state.live.televisionPresent, announceDraw: mocks.state.live.announceDraw };
  },
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
    displayName: mocks.state.displayName,
    saveStreamingServices: mocks.saveStreamingServices,
    defaultDrawSettings: mocks.state.defaultDrawSettings,
    loading: mocks.state.preferencesLoading,
    loadError: mocks.state.preferencesLoadError,
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

import { MemoryRouter } from "react-router-dom";
import BowlDashboard from "../BowlDashboard";
import { getProfileDisplayName } from "../../utils/profileIdentity";

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

describe("BowlDashboard live draw", () => {
  beforeEach(() => {
    mocks.fetchProviderLinks.mockReset().mockResolvedValue({ links: [] });
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.displayName = "Scott";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1" };
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 120 }],
      watched: [],
    };
    mocks.state.handleDeleteMovie.mockClear();
    mocks.state.handleReaddMovie.mockClear();
    mocks.state.handleDraw.mockReset();
    mocks.state.reload.mockReset();
    mocks.state.live = { televisionPresent: false, announceDraw: vi.fn(), props: null };
    mocks.state.bowlId = "bowl-1";
    mocks.state.bowlError = null;
    mocks.state.bowlAdd = { open: false, openBowlAdd: vi.fn() };
    mocks.state.streamingServices = [];
    mocks.state.preferencesLoading = false;
    mocks.state.preferencesLoadError = null;
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

  it("shows the television on the draw button while one is listening", async () => {
    mocks.state.live.televisionPresent = true;
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const button = screen.getByRole("button", { name: /it will play on the tv too/i });
    expect(button.querySelector("svg")).not.toBeNull();
    expect(mocks.state.live.props).toMatchObject({ bowlId: "bowl-1", surface: "web" });
  });

  it("leaves the draw button as it was with no television listening", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    const button = screen.getByRole("button", { name: "Draw movie from bowl. Press and hold to draw." });
    expect(button.querySelector("svg")).toBeNull();
  });

  it("announces its own draw with the reveal it played, and the drawer's name", async () => {
    const drawReveal = {
      methodId: "title_first",
      person: null,
      title: { mode: "random", scope: "bowl", count: 1 },
    };
    mocks.state.handleDraw.mockImplementation(async ({ onPoolResolved }) => {
      onPoolResolved?.(mocks.state.bowlData.remaining);
      return { id: "m1", tmdb_id: 101, title: "Movie A", streamingProviders: [], drawReveal };
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    confirmDraw();

    await waitFor(() => expect(mocks.state.live.announceDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.live.announceDraw).toHaveBeenCalledWith(expect.objectContaining({
      v: 1,
      bowlMovieId: "m1",
      title: "Movie A",
      drawnBy: "Scott",
      reveal: drawReveal,
      preview: expect.objectContaining({ total: 1 }),
    }), "bowl-1");
  });

  it("names a drawer who left their name blank the way every shared surface does", async () => {
    mocks.state.displayName = "";
    mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A", streamingProviders: [] });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    confirmDraw();

    await waitFor(() => expect(mocks.state.live.announceDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.live.announceDraw.mock.calls[0][0].drawnBy).toBe(getProfileDisplayName(null, "u1"));
  });

  it("plays a draw made on another screen once the bowl shows it, naming who drew", async () => {
    const drawn = { id: "event-1", drawEventId: "event-1", bowlMovieId: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", drawn_at: new Date().toISOString() };
    mocks.state.reload.mockResolvedValue({ watched: [drawn] });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    await act(async () => {
      mocks.state.live.props.onDraw({
        bowlMovieId: "m1",
        title: "Movie A",
        methodId: "title_first",
        preview: null,
        reveal: null,
        drawnBy: "Robin",
      });
      await Promise.resolve();
    });
    expect(mocks.state.reload).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-testid='draw-reveal-drawn-by']")).toHaveTextContent("Robin");
    // The slip is decoration; the live region is what a screen reader hears.
    expect(screen.getByText(/drawn by robin\./i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument());
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    expect(mocks.state.live.announceDraw).not.toHaveBeenCalled();
  });

  it("opens nothing for an announcement the reloaded bowl does not back", async () => {
    mocks.state.reload.mockResolvedValue({ watched: [] });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    await act(async () => {
      mocks.state.live.props.onDraw({ bowlMovieId: "m-made-up", title: "Fake", methodId: "", preview: null, reveal: null, drawnBy: "" });
      await vi.advanceTimersByTimeAsync(1600);
    });
    vi.useRealTimers();
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Fake", level: 2 })).toBeNull();
  });

  it("only refreshes the bowl when an announced draw lands on an open movie", async () => {
    mocks.state.handleDraw.mockResolvedValue({ id: "m1", tmdb_id: 101, title: "Movie A", streamingProviders: [] });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    confirmDraw();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument(), { timeout: 3000 });

    await act(async () => {
      mocks.state.live.props.onDraw({ bowlMovieId: "m2", title: "Movie B", methodId: "", preview: null, reveal: null, drawnBy: "Robin" });
    });
    expect(mocks.state.reload).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
  });

  it.each([
    ["the filters sheet", () => fireEvent.click(screen.getByRole("button", { name: "Filters" }))],
    ["the add sheet", () => { mocks.state.bowlAdd = { ...mocks.state.bowlAdd, open: true }; }],
    ["a hold on the draw button", () => fireEvent.pointerDown(screen.getByRole("button", { name: /draw movie/i }))],
  ])("only refreshes the bowl when an announced draw arrives over %s", async (_name, openOverlay) => {
    const drawn = { id: "event-1", drawEventId: "event-1", bowlMovieId: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", drawn_at: new Date().toISOString() };
    mocks.state.reload.mockResolvedValue({ watched: [drawn] });
    const view = renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    act(() => openOverlay());
    view.rerender(<BowlDashboard />);

    await act(async () => {
      mocks.state.live.props.onDraw({ bowlMovieId: "m1", title: "Movie A", methodId: "", preview: null, reveal: null, drawnBy: "Robin" });
    });
    expect(mocks.state.reload).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Movie A", level: 2 })).toBeNull();
  });

  it("abandons an announced replay when the page moves to another bowl", async () => {
    const drawn = { id: "event-1", drawEventId: "event-1", bowlMovieId: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", drawn_at: new Date().toISOString() };
    mocks.state.reload.mockResolvedValue({ watched: [drawn] });
    const view = renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    vi.useFakeTimers();
    await act(async () => {
      mocks.state.live.props.onDraw({ bowlMovieId: "m1", title: "Movie A", methodId: "title_first", preview: null, reveal: null, drawnBy: "Robin" });
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(document.querySelector(".draw-reveal-stage")).not.toBeNull();

    mocks.state.bowlId = "bowl-2";
    view.rerender(<BowlDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    vi.useRealTimers();
    expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Movie A", level: 2 })).toBeNull();
  });

  it("only refreshes the bowl for an announcement behind the access error screen", async () => {
    const drawn = { id: "event-1", drawEventId: "event-1", bowlMovieId: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", drawn_at: new Date().toISOString() };
    mocks.state.reload.mockResolvedValue({ watched: [drawn] });
    mocks.state.bowlError = { message: "offline" };
    render(<MemoryRouter><BowlDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/could not load this bowl/i)).toBeInTheDocument());

    await act(async () => {
      mocks.state.live.props.onDraw({ bowlMovieId: "m1", title: "Movie A", methodId: "", preview: null, reveal: null, drawnBy: "Robin" });
    });
    expect(mocks.state.reload).toHaveBeenCalledTimes(1);

    mocks.state.bowlError = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    });
    expect(screen.queryByRole("heading", { name: "Movie A", level: 2 })).toBeNull();
  });

  describe("coming back to the page", () => {
    let visibility = "visible";
    const setVisibility = (next) => {
      visibility = next;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };

    beforeEach(() => {
      visibility = "visible";
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    });
    afterEach(() => {
      delete document.visibilityState;
    });

    it("reads the bowl again, showing a missed draw without replaying it", async () => {
      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

      setVisibility("hidden");
      expect(mocks.state.reload).not.toHaveBeenCalled();

      setVisibility("visible");
      expect(mocks.state.reload).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".draw-reveal-stage")).toBeNull();
    });

    it("leaves a draw this screen is running to land on its own", async () => {
      mocks.state.handleDraw.mockReturnValue(new Promise(() => {}));
      renderDashboard();
      await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
      confirmDraw();

      setVisibility("hidden");
      setVisibility("visible");
      expect(mocks.state.reload).not.toHaveBeenCalled();
    });
  });
});
