import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RokuDeviceProvider } from "../../context/RokuDeviceContext";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" },
    memberRows: [{ user_id: "u1" }, { user_id: "u2" }],
    drawPermissionRows: [],
    bowlData: {
      remaining: [
        { id: "m1", added_by: "u1" },
        { id: "m2", added_by: "u1" },
        { id: "m3", added_by: "u1" },
        { id: "m4", added_by: "u1" },
      ],
      watched: [],
    },
    drawOdds: [{ bucketKey: "user:u1", member: "owner@example.com", movieCount: 4, drawOdds: 1 }],
    handleDraw: vi.fn(async () => null),
    handleAddMovie: vi.fn(async () => true),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
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
          if (table === "bowl_draw_permissions") {
            return Promise.resolve({ data: state.drawPermissionRows, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    }),
  };

  return {
    state,
    supabase,
    getTmdbMovieDetails: vi.fn(async () => ({})),
  };
});

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.state.bowlData,
    drawOdds: mocks.state.drawOdds,
    isLoading: false,
    errorMessage: null,
    handleDraw: mocks.state.handleDraw,
    handleAddMovie: mocks.state.handleAddMovie,
    handleDeleteMovie: mocks.state.handleDeleteMovie,
    handleReaddMovie: mocks.state.handleReaddMovie,
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
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
    loading: false,
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
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
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../../utils/appLimits";

function renderDashboard() {
  return render(
    <RokuDeviceProvider>
      <BowlDashboard />
    </RokuDeviceProvider>
  );
}

describe("BowlDashboard guards", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.drawPermissionRows = [];
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1" },
        { id: "m2", added_by: "u1" },
        { id: "m3", added_by: "u1" },
        { id: "m4", added_by: "u1" },
      ],
      watched: [],
    };
    mocks.state.drawOdds = [{ bucketKey: "user:u1", member: "owner@example.com", movieCount: 4, drawOdds: 1 }];
    mocks.state.handleReaddMovie.mockClear();
    mocks.state.handleAddMovie.mockClear();
    mocks.state.streamingServices = [];
    mocks.getTmdbMovieDetails.mockReset();
    mocks.getTmdbMovieDetails.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps Add Movie enabled and shows draw odds instead of lead warnings", async () => {
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ add movie/i })).toBeEnabled();
    expect(screen.queryByText(/lowest active member/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Draw Odds").length).toBeGreaterThan(0);
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("adds a custom movie directly", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /\+ add movie/i }));
    fireEvent.change(screen.getByPlaceholderText(/search movies/i), { target: { value: "Wildcard Night" } });
    fireEvent.click(screen.getByRole("button", { name: /add "wildcard night"/i }));

    await waitFor(() => {
      expect(mocks.state.handleAddMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Wildcard Night",
        })
      );
    });
  });

  it("shows only current user's undrawn picks in My Movies", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", title: "My Movie", added_by: "u1", added_at: "2026-03-06T12:00:00.000Z" },
        { id: "m2", title: "Friend Movie", added_by: "u2", added_at: "2026-03-06T12:10:00.000Z" },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const myMoviesSection = screen.getByRole("heading", { name: /my movies/i }).closest("section");
    expect(myMoviesSection).toBeTruthy();
    fireEvent.click(within(myMoviesSection).getByRole("button", { name: /^show$/i }));
    expect(screen.getAllByText(/^My Movie$/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/friend movie/i)).not.toBeInTheDocument();
  });

  it("routes My Movies delete to bowl delete for added items", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [
        { id: "m-added-1", title: "Added Movie", added_by: "u1", added_at: "2026-03-06T12:30:00.000Z" },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const myMoviesSection = screen.getByRole("heading", { name: /my movies/i }).closest("section");
    expect(myMoviesSection).toBeTruthy();
    fireEvent.click(within(myMoviesSection).getByRole("button", { name: /^show$/i }));

    const cards = myMoviesSection.querySelectorAll("article");
    expect(cards.length).toBe(1);

    const deleteButtons = within(myMoviesSection).getAllByRole("button", { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => expect(mocks.state.handleDeleteMovie).toHaveBeenCalledWith("m-added-1"));
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Added Movie" from this bowl?');
    confirmSpy.mockRestore();
  });

  it("keeps Add Movie enabled when only one active member exists", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = { remaining: [], watched: [] };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ add movie/i })).toBeEnabled();
  });

  it("disables Add Movie when undrawn movie limit is reached", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: Array.from({ length: MAX_UNDRAWN_MOVIES_PER_BOWL }, (_, index) => ({
        id: `m-${index + 1}`,
        added_by: "u1",
      })),
      watched: [],
    };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ add movie/i })).toBeDisabled();
    expect(
      screen.getByText(new RegExp(`undrawn movie limit \\(${MAX_UNDRAWN_MOVIES_PER_BOWL}\\)`, "i"))
    ).toBeInTheDocument();
  });

  it("shows re-add confirmation modal before moving watched item back to bowl", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "w1",
          tmdb_id: 101,
          title: "Movie A",
          drawn_at: "2026-02-23T00:00:00.000Z",
          added_by: "u1",
        },
      ],
    };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /move to bowl/i }));

    expect(screen.getByText(/re-add to bowl\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/will be removed from the watched strip and placed back in your bowl/i)
    ).toBeInTheDocument();

    const readdButtons = screen.getAllByRole("button", { name: /^re-add$/i });
    fireEvent.click(readdButtons[readdButtons.length - 1]);

    await waitFor(() => expect(mocks.state.handleReaddMovie).toHaveBeenCalledWith("w1"));
  });

  it("enriches watched TMDB details with trailer data before opening the modal", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "w1",
          tmdb_id: 101,
          title: "Movie A",
          release_date: "2020-01-01",
          drawn_at: "2026-02-23T00:00:00.000Z",
          added_by: "u1",
          profiles: { email: "owner@example.com" },
        },
      ],
    };
    mocks.getTmdbMovieDetails.mockResolvedValue({
      runtime: 123,
      trailer: {
        site: "YouTube",
        key: "movie-a-trailer",
        embedUrl: "https://www.youtube.com/embed/movie-a-trailer",
      },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));

    await waitFor(() => expect(screen.getByText("Movie A (2020)")).toBeInTheDocument());
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledWith(101);
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show trailer/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open on web in/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    const trailerButton = screen.getByRole("button", { name: /show trailer/i });
    act(() => {
      fireEvent.click(trailerButton);
    });
    await waitFor(() => expect(trailerButton).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByTitle("Movie A trailer")).toBeInTheDocument();
  });

  it("preserves the bowl row id when re-adding an enriched watched movie", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "w1",
          tmdb_id: 238,
          title: "Movie A",
          release_date: "2020-01-01",
          drawn_at: "2026-02-23T00:00:00.000Z",
          added_by: "u1",
        },
      ],
    };
    mocks.getTmdbMovieDetails.mockResolvedValue({
      id: 238,
      runtime: 123,
      trailer: {
        site: "YouTube",
        key: "movie-a-trailer",
        embedUrl: "https://www.youtube.com/embed/movie-a-trailer",
      },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /move to bowl/i }));

    const readdButtons = screen.getAllByRole("button", { name: /^re-add$/i });
    fireEvent.click(readdButtons[readdButtons.length - 1]);

    await waitFor(() => expect(mocks.state.handleReaddMovie).toHaveBeenCalledWith("w1"));
  });

  it("disables draw for a non-selected member in selected-members mode", async () => {
    mocks.state.authUserId = "u2";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "selected_members" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.drawPermissionRows = [{ user_id: "u3" }];
    mocks.state.bowlData = { remaining: [{ id: "m1", added_by: "u1" }], watched: [] };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /draw movie/i })).toBeDisabled();
    expect(screen.getByText(/only selected members can draw in this bowl/i)).toBeInTheDocument();
  });

  it("allows draw for selected member in selected-members mode", async () => {
    mocks.state.authUserId = "u2";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "selected_members" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.drawPermissionRows = [{ user_id: "u2" }];
    mocks.state.bowlData = { remaining: [{ id: "m1", added_by: "u1" }], watched: [] };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /draw movie/i })).toBeEnabled();
  });

  it("owner can draw in selected-members mode even if not listed", async () => {
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "selected_members" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.drawPermissionRows = [];
    mocks.state.bowlData = { remaining: [{ id: "m1", added_by: "u2" }], watched: [] };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /draw movie/i })).toBeEnabled();
  });

  it("keeps draw enabled for members in all-members mode", async () => {
    mocks.state.authUserId = "u2";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.drawPermissionRows = [];
    mocks.state.bowlData = { remaining: [{ id: "m1", added_by: "u1" }], watched: [] };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /draw movie/i })).toBeEnabled();
  });
});
