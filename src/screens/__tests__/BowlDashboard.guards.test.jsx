import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" },
    // Flipped off to stand in for a deploy that reaches users before the
    // draw_method migration is applied.
    hasDrawMethodColumn: true,
    useBowlOptions: null,
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
    openBowlAdd: vi.fn(),
    handleAddMovie: vi.fn(async () => true),
    handleUpdateMovieNote: vi.fn(async (_movieId, note) => ({
      ok: true,
      movie: { note: String(note).trim() || null },
    })),
    handleSetMoviePin: vi.fn(async (_movieId, isPinned) => ({
      ok: true,
      movie: { is_pinned: isPinned },
    })),
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
      let selectedColumns = "";
      const query = {
        select: vi.fn((columns) => {
          selectedColumns = String(columns || "");
          return query;
        }),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { user_id: state.authUserId }, error: null })),
        single: vi.fn(async () => {
          if (table === "bowls") {
            if (!state.hasDrawMethodColumn && selectedColumns.includes("draw_method")) {
              return {
                data: null,
                error: { message: 'column bowls.draw_method does not exist' },
              };
            }
            return { data: state.bowlRow, error: null };
          }
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

vi.mock("../../hooks/useBowlAdd", () => ({ default: () => ({ openBowlAdd: mocks.state.openBowlAdd }) }));
vi.mock("../../hooks/useBowl", () => ({
  default: (_bowlId, options) => {
    // The screen owns the bowl row, so what it hands the hook is the wiring
    // that decides how the bowl actually draws.
    mocks.state.useBowlOptions = options;
    return {
      bowl: mocks.state.bowlData,
      drawOdds: mocks.state.drawOdds,
      isLoading: false,
      errorMessage: null,
      handleDraw: mocks.state.handleDraw,
      handleAddMovie: mocks.state.handleAddMovie,
      handleUpdateMovieNote: mocks.state.handleUpdateMovieNote,
      handleSetMoviePin: mocks.state.handleSetMoviePin,
      handleDeleteMovie: mocks.state.handleDeleteMovie,
      handleReaddMovie: mocks.state.handleReaddMovie,
    };
  },
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
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
    loading: false,
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
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
  return render(<BowlDashboard />);
}

describe("BowlDashboard guards", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", draw_access_mode: "all_members" };
    mocks.state.hasDrawMethodColumn = true;
    mocks.state.useBowlOptions = null;
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
    mocks.state.handleUpdateMovieNote.mockClear();
    mocks.state.handleSetMoviePin.mockClear();
    mocks.state.streamingServices = [];
    mocks.getTmdbMovieDetails.mockReset();
    mocks.getTmdbMovieDetails.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps Add Movie enabled and explains the current person-first draw method", async () => {
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /add to this bowl/i })).toBeEnabled();
    expect(screen.queryByText(/lowest active member/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/draw odds/i)).not.toBeInTheDocument();

    expect(screen.queryByText(/each person is equally likely to be selected/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^how this bowl picks$/i }));

    expect(screen.getByText(/each person is equally likely to be selected/i)).toBeInTheDocument();
    expect(mocks.state.useBowlOptions).toEqual({ drawMethod: "person_first" });
  });

  it("explains a title-first bowl with title-first copy and draws that way", async () => {
    mocks.state.bowlRow = {
      name: "Bowl 1",
      owner_id: "u1",
      draw_access_mode: "all_members",
      draw_method: "title_first",
    };

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    await waitFor(() =>
      expect(mocks.state.useBowlOptions).toEqual({ drawMethod: "title_first" })
    );

    fireEvent.click(screen.getByRole("button", { name: /^how this bowl picks$/i }));

    expect(screen.getByText(/every movie is equally likely/i)).toBeInTheDocument();
    expect(screen.queryByText(/each person is equally likely to be selected/i)).not.toBeInTheDocument();
  });

  it("passes rotation into the shared draw hook and explains the turn history", async () => {
    mocks.state.bowlRow = {
      name: "Bowl 1",
      owner_id: "u1",
      draw_access_mode: "all_members",
      draw_method: "rotation",
    };

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    await waitFor(() =>
      expect(mocks.state.useBowlOptions).toEqual({ drawMethod: "rotation" })
    );

    fireEvent.click(screen.getByRole("button", { name: /^how this bowl picks$/i }));

    expect(screen.getByText(/starting with anyone who has never had a movie drawn/i)).toBeInTheDocument();
    expect(screen.getByText(/returning a movie does not reset the turn/i)).toBeInTheDocument();
  });

  it("falls back to person-first when the draw_method column is missing", async () => {
    mocks.state.hasDrawMethodColumn = false;

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    // The bowl still loads, still draws, and still describes itself correctly.
    expect(screen.getByRole("button", { name: /draw movie/i })).toBeEnabled();
    expect(mocks.state.navigate).not.toHaveBeenCalled();
    expect(mocks.state.useBowlOptions).toEqual({ drawMethod: "person_first" });

    fireEvent.click(screen.getByRole("button", { name: /^how this bowl picks$/i }));

    expect(screen.getByText(/each person is equally likely to be selected/i)).toBeInTheDocument();
  });

  it("opens the shared add session for the viewed bowl", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /add to this bowl/i }));
    expect(mocks.state.openBowlAdd).toHaveBeenCalledWith("bowl-1");
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
    expect(within(myMoviesSection).getByText("1 movie")).toBeInTheDocument();
    expect(screen.getAllByText(/^My Movie$/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/friend movie/i)).not.toBeInTheDocument();
  });

  it("shows My Movies above a collapsed Watched strip", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", title: "My Movie", added_by: "u1", added_at: "2026-03-06T12:00:00.000Z" },
      ],
      watched: [
        { id: "w1", title: "Watched Movie", drawn_at: "2026-03-05T12:00:00.000Z" },
      ],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const myMoviesHeading = screen.getByRole("heading", { name: /my movies/i });
    const watchedHeading = screen.getByRole("heading", { name: /^watched$/i });
    const myMoviesSection = myMoviesHeading.closest("section");
    const watchedSection = watchedHeading.closest("section");

    expect(
      myMoviesHeading.compareDocumentPosition(watchedHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(myMoviesSection).getAllByText(/^My Movie$/i).length).toBeGreaterThan(0);
    expect(within(myMoviesSection).queryByRole("button", { name: /^(show|hide)$/i })).not.toBeInTheDocument();
    expect(within(watchedSection).getByText("1 watched")).toBeInTheDocument();
    expect(within(watchedSection).queryByText("Watched Movie")).not.toBeInTheDocument();

    const showButton = within(watchedSection).getByRole("button", { name: "Show" });
    expect(showButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showButton);
    expect(within(watchedSection).getAllByText("Watched Movie").length).toBeGreaterThan(0);
    expect(within(watchedSection).getByRole("button", { name: "Hide" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("reorders and greys My Movies when the current filters change", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [
        {
          id: "m-long",
          tmdb_id: 101,
          title: "Long Movie",
          added_by: "u1",
          added_at: "2026-03-06T12:00:00.000Z",
          runtime: 180,
          genres: ["Drama"],
        },
        {
          id: "m-short",
          tmdb_id: 102,
          title: "Short Movie",
          added_by: "u1",
          added_at: "2026-03-06T12:10:00.000Z",
          runtime: 95,
          genres: ["Drama"],
        },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const myMoviesSection = screen.getByRole("heading", { name: /my movies/i }).closest("section");
    await waitFor(() => expect(myMoviesSection.querySelectorAll("article")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    fireEvent.change(screen.getByLabelText("draw-runtime-max"), { target: { value: "120" } });

    await waitFor(() => {
      const cards = [...myMoviesSection.querySelectorAll("article")];
      expect(cards[0]).toHaveTextContent("Short Movie");
      expect(cards[1]).toHaveTextContent("Long Movie");
      expect(cards[1]).toHaveAttribute("data-filter-excluded", "true");
    });

    expect(within(myMoviesSection).getAllByRole("button", { name: /details/i })[1]).toBeEnabled();
    expect(within(myMoviesSection).getAllByRole("button", { name: /delete/i })[1]).toBeEnabled();
    fireEvent.click(within(myMoviesSection).getAllByRole("button", { name: /details/i })[1]);
    const pinGroup = await screen.findByRole("group", { name: "Movie pin" });
    expect(within(pinGroup).getByRole("button", { name: "Pin movie" })).toBeDisabled();
    expect(within(pinGroup).getByRole("button", { name: "Pin movie" })).toHaveAccessibleDescription(/This movie is outside tonight's filters/);
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

    const cards = myMoviesSection.querySelectorAll("article");
    expect(cards.length).toBe(1);

    const deleteButtons = within(myMoviesSection).getAllByRole("button", { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => expect(mocks.state.handleDeleteMovie).toHaveBeenCalledWith("m-added-1"));
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Added Movie" from this bowl?');
    confirmSpy.mockRestore();
  });

  it("routes a My Movies pin through the bowl mutation handler", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [
        {
          id: "m-pin",
          title: "Pin Me",
          added_by: "u1",
          added_at: "2026-03-06T12:30:00.000Z",
          is_pinned: false,
        },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const myMoviesSection = screen.getByRole("heading", { name: /my movies/i }).closest("section");
    fireEvent.click(
      within(myMoviesSection).getByRole("button", {
        name: /pin "pin me" so it comes up first/i,
      })
    );

    await waitFor(() => {
      expect(mocks.state.handleSetMoviePin).toHaveBeenCalledWith("m-pin", true);
    });
  });

  it("offers comment editing from an owned undrawn My Movies detail", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [
        {
          id: "m-added-1",
          title: "Added Movie",
          added_by: "u1",
          added_at: "2026-03-06T12:30:00.000Z",
          note: "Original comment",
        },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const myMoviesSection = screen.getByRole("heading", { name: /my movies/i }).closest("section");
    fireEvent.click(within(myMoviesSection).getByRole("button", { name: /details/i }));

    await screen.findByRole("button", { name: /edit comment/i });
    fireEvent.click(screen.getByRole("button", { name: /edit comment/i }));
    fireEvent.change(await screen.findByLabelText(/comment \(optional\)/i), {
      target: { value: "  Updated comment  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save comment/i }));

    await waitFor(() => {
      expect(mocks.state.handleUpdateMovieNote).toHaveBeenCalledWith(
        "m-added-1",
        "  Updated comment  "
      );
    });
  });

  it("pins and unpins an owned movie from details through the existing mutation", async () => {
    mocks.state.bowlData = {
      remaining: [{ id: "detail-pin", title: "Pin Me", added_by: "u1", is_pinned: false }],
      watched: [],
    };
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Details", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Pin movie" }));
    await waitFor(() => expect(mocks.state.handleSetMoviePin).toHaveBeenCalledWith("detail-pin", true));
    expect(await screen.findByRole("button", { name: "Unpin movie" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Unpin movie" }));
    await waitFor(() => expect(mocks.state.handleSetMoviePin).toHaveBeenLastCalledWith("detail-pin", false));
    expect(await screen.findByRole("button", { name: "Pin movie" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps saved pins inactive in title-first movie details", async () => {
    mocks.state.bowlRow.draw_method = "title_first";
    mocks.state.bowlData = {
      remaining: [{ id: "detail-pin", title: "Pin Me", added_by: "u1", is_pinned: true }],
      watched: [],
    };
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Details", exact: true }));
    const pinGroup = await screen.findByRole("group", { name: "Movie pin" });
    expect(within(pinGroup).getByRole("button", { name: "Unpin movie" })).toBeDisabled();
    expect(within(pinGroup).getByRole("button", { name: "Unpin movie" })).toHaveAccessibleDescription("This bowl draws title-first, so pins don't change anything here.");
    expect(mocks.state.handleSetMoviePin).not.toHaveBeenCalled();
  });

  it("keeps Add Movie enabled when only one active member exists", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = { remaining: [], watched: [] };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /add to this bowl/i })).toBeEnabled();
  });

  it("disables Add Movie when undrawn movie limit is reached", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: Array.from({ length: MAX_UNDRAWN_MOVIES_PER_BOWL }, (_, index) => ({
        id: `m-${index + 1}`,
        added_by: "u2",
      })),
      watched: [],
    };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /add to this bowl/i })).toBeDisabled();
    expect(
      screen.getByText(new RegExp(`undrawn movie limit \\(${MAX_UNDRAWN_MOVIES_PER_BOWL}\\)`, "i"))
    ).toBeInTheDocument();
  });

  it("explains bounded history cleanup before putting a watched item back in the bowl", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "w1",
          drawEventId: "draw-1",
          bowlMovieId: "w1",
          tmdb_id: 101,
          title: "Movie A",
          drawn_at: "2026-02-23T00:00:00.000Z",
          added_by: "u1",
        },
      ],
    };
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const watchedSection = screen.getByRole("heading", { name: /^watched$/i }).closest("section");
    fireEvent.click(within(watchedSection).getByRole("button", { name: /^show$/i }));
    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument());
    expect(screen.queryByRole("group", { name: "Movie pin" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /move to bowl/i }));

    expect(screen.getByText(/put movie back in bowl\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/puts "movie a" back into the bowl for everyone/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/within the last two hours.*watch history entries/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /put movie back in bowl/i }));

    await waitFor(() => expect(mocks.state.handleReaddMovie).toHaveBeenCalledWith("draw-1"));
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

    const watchedSection = screen.getByRole("heading", { name: /^watched$/i }).closest("section");
    fireEvent.click(within(watchedSection).getByRole("button", { name: /^show$/i }));
    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument());
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledWith(101);
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch trailer/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open on web in/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));
    // Re-query rather than asserting on a node captured before the click: the
    // label flips to "Hide trailer", so holding the old reference asserts on
    // whatever that element became rather than on the control itself.
    await waitFor(() => expect(
      screen.getByRole("button", { name: /hide trailer/i })
    ).toHaveAttribute("aria-expanded", "true"));
    expect(await screen.findByTitle("Movie A trailer")).toBeInTheDocument();
  });

  it("preserves the draw event id when moving an enriched watched movie to the bowl", async () => {
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = {
      remaining: [],
      watched: [
        {
          id: "w1",
          drawEventId: "draw-1",
          bowlMovieId: "w1",
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

    const watchedSection = screen.getByRole("heading", { name: /^watched$/i }).closest("section");
    fireEvent.click(within(watchedSection).getByRole("button", { name: /^show$/i }));
    fireEvent.click(screen.getByRole("button", { name: /movie a/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /move to bowl/i }));

    fireEvent.click(screen.getByRole("button", { name: /put movie back in bowl/i }));

    await waitFor(() => expect(mocks.state.handleReaddMovie).toHaveBeenCalledWith("draw-1"));
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
