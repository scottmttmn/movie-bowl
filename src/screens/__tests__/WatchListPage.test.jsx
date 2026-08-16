import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    sessionUser: { id: "user-1", email: "owner@example.com" },
    ownedRows: [{ id: "bowl-1" }],
    memberRows: [{ bowl_id: "bowl-2" }],
    watchedRows: [],
    rpcCalls: [],
  };

  function createThenable(result) {
    return {
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
  }

  function createFilterQuery(result) {
    const query = {
      select: vi.fn(() => query),
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      is: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return query;
  }

  return {
    state,
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: state.sessionUser ? { user: state.sessionUser } : null },
          error: null,
        })),
      },
      from: vi.fn((table) => {
        if (table === "user_watch_events") {
          return createFilterQuery({ data: state.watchedRows, error: null });
        }

        // No bowl copies here — the removal prompt has its own focused test file.
        if (table === "bowl_movies") {
          return createFilterQuery({ data: [], error: null });
        }

        return createThenable({ data: [], error: null });
      }),
      rpc: vi.fn(async (name, params) => {
        state.rpcCalls.push({ name, params });
        return { data: null, error: null };
      }),
    },
    getTmdbMovieDetails: vi.fn(async () => ({
      runtime: 130,
      trailer: { site: "YouTube", key: "trailer-1", embedUrl: "https://youtube.com/embed/trailer-1" },
    })),
    fetchStreamingProviders: vi.fn(async () => ({
      providers: [{ service: "Max" }],
      region: "US",
      fetchedAt: "2026-04-13T00:00:00.000Z",
    })),
  };
});

vi.mock("../../lib/supabase", () => ({
  supabase: mocks.supabase,
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

vi.mock("../../components/AddMovieModal", () => ({
  default: ({ movie, detailPrimaryActionLabel, onDetailPrimaryAction }) => (
    <div data-testid="movie-detail-modal">
      <div>{movie.title}</div>
      <div>{movie.streamingProviders?.length ? "providers loaded" : "no providers"}</div>
      <div>{detailPrimaryActionLabel ? "actions enabled" : "read-only"}</div>
      {detailPrimaryActionLabel && (
        <button type="button" onClick={() => onDetailPrimaryAction?.(movie)}>
          {detailPrimaryActionLabel}
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../components/WatchHistoryEntryModal", () => ({
  default: ({ entry, onSave, onDelete }) => (
    <div data-testid="watch-history-editor">
      <div>{entry ? `editing ${entry.title}` : "adding history"}</div>
      <button
        type="button"
        onClick={() =>
          onSave(
            entry || {
              id: 303,
              title: "Manual Favorite",
              watched_on: "2026-05-01",
              release_date: "1999-01-01",
              genres: ["Drama"],
            }
          )
        }
      >
        Save history entry
      </button>
      {entry && (
        <button type="button" onClick={() => onDelete(entry)}>
          Remove history entry
        </button>
      )}
    </div>
  ),
}));

import WatchListPage from "../WatchListPage";

describe("WatchListPage", () => {
  beforeEach(() => {
    mocks.state.sessionUser = { id: "user-1", email: "owner@example.com" };
    mocks.state.ownedRows = [{ id: "bowl-1" }];
    mocks.state.memberRows = [{ bowl_id: "bowl-2" }];
    mocks.state.watchedRows = [
      {
        id: "history-2",
        source_kind: "bowl_draw",
        bowl_name: "Shared Bowl",
        tmdb_id: 102,
        title: "Shared Favorite",
        poster_path: "/shared.jpg",
        release_date: "2004-12-17",
        runtime: 201,
        genres: ["Adventure"],
        overview: "A shared bowl movie",
        watched_on: "2026-04-10",
      },
      {
        id: "history-1",
        source_kind: "bowl_draw",
        bowl_name: "Owned Bowl",
        tmdb_id: 101,
        title: "Owned Favorite",
        poster_path: "/owned.jpg",
        release_date: "2001-12-19",
        runtime: 178,
        genres: ["Fantasy"],
        overview: "An owned bowl movie",
        watched_on: "2026-04-12",
      },
      {
        id: "history-3",
        source_kind: "manual",
        bowl_name: null,
        tmdb_id: null,
        title: "Shared Favorite",
        poster_path: null,
        release_date: "1999-01-01",
        runtime: 90,
        genres: ["Drama"],
        overview: "Duplicate title in another bowl",
        watched_on: "2026-04-01",
      },
    ];
    mocks.getTmdbMovieDetails.mockClear();
    mocks.fetchStreamingProviders.mockClear();
    mocks.state.rpcCalls = [];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads personal watch events and shows duplicates from bowls and manual entries", async () => {
    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getByText("Watch History")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { level: 2, name: "April" })).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((node) => node.textContent)).toEqual([
      "Owned Favorite",
      "Shared Favorite",
      "Shared Favorite",
    ]);

    expect(screen.getAllByText("Shared Favorite")).toHaveLength(2);
    expect(screen.getByText("From Shared Bowl")).toBeInTheDocument();
    expect(screen.getByText("From Owned Bowl")).toBeInTheDocument();
    expect(screen.getByText("Added manually")).toBeInTheDocument();
    expect(screen.getByText("3 watched in 2026 · 3 all time")).toBeInTheDocument();
    expect(screen.getAllByText(/Watched on /i)).toHaveLength(3);
    expect(screen.getByRole("button", { name: /export all history csv/i })).toBeEnabled();
    expect(screen.getByText("2 exportable, 1 skipped")).toBeInTheDocument();
  });

  it("defaults to the latest watched year and navigates only between years with history", async () => {
    mocks.state.watchedRows = [
      ...mocks.state.watchedRows,
      {
        id: "movie-2024",
        source_kind: "bowl_draw",
        bowl_name: "Owned Bowl",
        tmdb_id: 204,
        title: "Older Favorite",
        poster_path: "/older.jpg",
        release_date: "1994-09-23",
        watched_on: "2024-11-15",
      },
    ];

    render(<WatchListPage />);

    const yearSelect = await screen.findByLabelText(/year watched/i);
    expect(yearSelect).toHaveValue("2026");
    expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2024" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "2025" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous watched year/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next watched year/i })).toBeDisabled();
    expect(screen.queryByText("Older Favorite")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /previous watched year/i }));

    expect(yearSelect).toHaveValue("2024");
    expect(screen.getByText("1 watched in 2024 · 4 all time")).toBeInTheDocument();
    expect(screen.getByText("Older Favorite")).toBeInTheDocument();
    expect(screen.queryByText("Owned Favorite")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous watched year/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next watched year/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /next watched year/i }));
    expect(yearSelect).toHaveValue("2026");
  });

  it("groups the selected year by month and watched date in newest-first order", async () => {
    mocks.state.watchedRows = [
      {
        ...mocks.state.watchedRows[0],
        id: "march-a",
        title: "March First",
        watched_on: "2026-03-12",
        created_at: "2026-03-12T18:00:00.000Z",
      },
      {
        ...mocks.state.watchedRows[1],
        id: "march-b",
        title: "March Second",
        watched_on: "2026-03-12",
        created_at: "2026-03-12T20:00:00.000Z",
      },
      {
        ...mocks.state.watchedRows[2],
        id: "january",
        title: "January Pick",
        watched_on: "2026-01-04",
        created_at: "2026-01-04T18:00:00.000Z",
      },
    ];

    render(<WatchListPage />);

    await screen.findByText("March First");

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
    ).toEqual(["March", "January"]);
    expect(screen.getAllByLabelText(/March 12/i)).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    ).toEqual(["March Second", "March First", "January Pick"]);
  });

  it("shows an empty state when no watched movies are available", async () => {
    mocks.state.watchedRows = [];

    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getByText(/no watched movies yet/i)).toBeInTheDocument();
    });
    expect(screen.getByText("0 watched movies")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export all history csv/i })).toBeDisabled();
  });

  it("disables Letterboxd export while the watch list is loading", () => {
    render(<WatchListPage />);

    expect(screen.getByRole("button", { name: /export all history csv/i })).toBeDisabled();
  });

  it("downloads a Letterboxd CSV for exportable watched movies", async () => {
    const createObjectURL = vi.fn(() => "blob:letterboxd-watch-list");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    let createdAnchor = null;
    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    class TestBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    }

    vi.stubGlobal("Blob", TestBlob);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === "a") {
        createdAnchor = element;
        element.click = anchorClick;
      }
      return element;
    });

    try {
      render(<WatchListPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /export all history csv/i })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole("button", { name: /export all history csv/i }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:letterboxd-watch-list");
      expect(createdAnchor.download).toMatch(/^movie-bowl-letterboxd-watched-\d{4}-\d{2}-\d{2}\.csv$/);

      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.options).toEqual({ type: "text/csv;charset=utf-8" });
      expect(blob.parts).toEqual([
        [
          "tmdbID,Title,Year,WatchedDate",
          "101,Owned Favorite,2001,2026-04-12",
          "102,Shared Favorite,2004,2026-04-10",
        ].join("\n"),
      ]);
    } finally {
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", {
          configurable: true,
          value: originalCreateObjectURL,
        });
      } else {
        delete URL.createObjectURL;
      }

      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, "revokeObjectURL", {
          configurable: true,
          value: originalRevokeObjectURL,
        });
      } else {
        delete URL.revokeObjectURL;
      }
    }
  });

  it("opens an enriched detail modal and can start editing a TMDB watch event", async () => {
    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getByText("Owned Favorite")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /owned favorite/i }));

    await waitFor(() => {
      expect(screen.getByTestId("movie-detail-modal")).toBeInTheDocument();
    });

    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledWith(101);
    expect(mocks.fetchStreamingProviders).toHaveBeenCalledWith(101, { region: "US" });
    expect(screen.getByText("providers loaded")).toBeInTheDocument();
    expect(screen.getByText("actions enabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit history/i }));
    expect(screen.getByTestId("watch-history-editor")).toHaveTextContent("editing Owned Favorite");
  });

  it("keeps manual entries distinct from bowl entries and skips TMDB enrichment for custom titles", async () => {
    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Shared Favorite")).toHaveLength(2);
    });

    const duplicateButtons = screen.getAllByRole("button", { name: /shared favorite/i });
    fireEvent.click(duplicateButtons[1]);

    await waitFor(() => {
      expect(screen.getByTestId("movie-detail-modal")).toBeInTheDocument();
    });

    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalledWith(null);
  });

  it("creates a manual watch event without requiring a bowl", async () => {
    render(<WatchListPage />);

    await screen.findByText("Owned Favorite");
    fireEvent.click(screen.getByRole("button", { name: /add watched movie/i }));

    expect(screen.getByTestId("watch-history-editor")).toHaveTextContent("adding history");
    fireEvent.click(screen.getByRole("button", { name: /save history entry/i }));

    await waitFor(() => {
      expect(mocks.state.rpcCalls).toContainEqual({
        name: "create_manual_watch_event",
        params: expect.objectContaining({
          p_title: "Manual Favorite",
          p_watched_on: "2026-05-01",
          p_tmdb_id: 303,
        }),
      });
    });
  });

  it("updates and removes only the selected personal history event", async () => {
    render(<WatchListPage />);

    await screen.findByText("Owned Favorite");
    fireEvent.click(screen.getByRole("button", { name: /owned favorite/i }));
    await screen.findByTestId("movie-detail-modal");
    fireEvent.click(screen.getByRole("button", { name: /edit history/i }));
    fireEvent.click(screen.getByRole("button", { name: /save history entry/i }));

    await waitFor(() => {
      expect(mocks.state.rpcCalls).toContainEqual({
        name: "update_user_watch_event",
        params: expect.objectContaining({
          p_event_id: "history-1",
          p_title: "Owned Favorite",
          p_watched_on: "2026-04-12",
        }),
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /owned favorite/i }));
    await screen.findByTestId("movie-detail-modal");
    fireEvent.click(screen.getByRole("button", { name: /edit history/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove history entry/i }));

    await waitFor(() => {
      expect(mocks.state.rpcCalls).toContainEqual({
        name: "delete_user_watch_event",
        params: { p_event_id: "history-1" },
      });
    });
  });
});
