import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    sessionUser: { id: "user-1", email: "owner@example.com" },
    ownedRows: [{ id: "bowl-1" }],
    memberRows: [{ bowl_id: "bowl-2" }],
    watchedRows: [],
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
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
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
        if (table === "bowls") {
          return createFilterQuery({ data: state.ownedRows, error: null });
        }
        if (table === "bowl_members") {
          return createFilterQuery({ data: state.memberRows, error: null });
        }
        if (table === "bowl_movies") {
          return createFilterQuery({ data: state.watchedRows, error: null });
        }

        return createThenable({ data: [], error: null });
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
  default: ({ movie, onAddMovie, onDeleteMovie, onMoveToBowl }) => (
    <div data-testid="movie-detail-modal">
      <div>{movie.title}</div>
      <div>{movie.added_by_name || movie.profiles?.email?.split("@")[0] || "no attribution"}</div>
      <div>{movie.streamingProviders?.length ? "providers loaded" : "no providers"}</div>
      <div>{onAddMovie || onDeleteMovie || onMoveToBowl ? "actions enabled" : "read-only"}</div>
    </div>
  ),
}));

import WatchListPage from "../WatchListPage";

function formatLocalDate(value) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

describe("WatchListPage", () => {
  beforeEach(() => {
    mocks.state.sessionUser = { id: "user-1", email: "owner@example.com" };
    mocks.state.ownedRows = [{ id: "bowl-1" }];
    mocks.state.memberRows = [{ bowl_id: "bowl-2" }];
    mocks.state.watchedRows = [
      {
        id: "movie-2",
        bowl_id: "bowl-2",
        tmdb_id: 102,
        title: "Shared Favorite",
        poster_path: "/shared.jpg",
        release_date: "2004-12-17",
        runtime: 201,
        genres: ["Adventure"],
        overview: "A shared bowl movie",
        drawn_at: "2026-04-10T12:00:00.000Z",
        bowls: { name: "Shared Bowl" },
        profiles: { email: "friend@example.com" },
        added_by_name: null,
      },
      {
        id: "movie-1",
        bowl_id: "bowl-1",
        tmdb_id: 101,
        title: "Owned Favorite",
        poster_path: "/owned.jpg",
        release_date: "2001-12-19",
        runtime: 178,
        genres: ["Fantasy"],
        overview: "An owned bowl movie",
        drawn_at: "2026-04-12T18:30:00.000Z",
        bowls: { name: "Owned Bowl" },
        profiles: { email: "owner@example.com" },
        added_by_name: null,
      },
      {
        id: "movie-3",
        bowl_id: "bowl-1",
        tmdb_id: null,
        title: "Shared Favorite",
        poster_path: null,
        release_date: "1999-01-01",
        runtime: 90,
        genres: ["Drama"],
        overview: "Duplicate title in another bowl",
        drawn_at: "2026-04-01T09:00:00.000Z",
        bowls: { name: "Owned Bowl" },
        profiles: null,
        added_by_name: "Dad",
      },
    ];
    mocks.getTmdbMovieDetails.mockClear();
    mocks.fetchStreamingProviders.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads watched movies across owned and member bowls and shows duplicates", async () => {
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
    expect(screen.getByText("Shared Bowl")).toBeInTheDocument();
    expect(screen.getAllByText("Owned Bowl")).toHaveLength(2);
    expect(screen.getByText("3 watched in 2026 · 3 all time")).toBeInTheDocument();
    expect(screen.getAllByText(/Watched on /i)).toHaveLength(3);
    expect(screen.getByRole("button", { name: /export all csv/i })).toBeEnabled();
    expect(screen.getByText("2 exportable, 1 skipped")).toBeInTheDocument();
  });

  it("defaults to the latest watched year and navigates only between years with history", async () => {
    mocks.state.watchedRows = [
      ...mocks.state.watchedRows,
      {
        id: "movie-2024",
        bowl_id: "bowl-1",
        tmdb_id: 204,
        title: "Older Favorite",
        poster_path: "/older.jpg",
        release_date: "1994-09-23",
        drawn_at: "2024-11-15T18:00:00.000Z",
        bowls: { name: "Owned Bowl" },
        profiles: null,
        added_by_name: null,
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
        drawn_at: "2026-03-12T18:00:00.000Z",
      },
      {
        ...mocks.state.watchedRows[1],
        id: "march-b",
        title: "March Second",
        drawn_at: "2026-03-12T20:00:00.000Z",
      },
      {
        ...mocks.state.watchedRows[2],
        id: "january",
        title: "January Pick",
        drawn_at: "2026-01-04T18:00:00.000Z",
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
    expect(screen.getByRole("button", { name: /export all csv/i })).toBeDisabled();
  });

  it("disables Letterboxd export while the watch list is loading", () => {
    render(<WatchListPage />);

    expect(screen.getByRole("button", { name: /export all csv/i })).toBeDisabled();
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
        expect(screen.getByRole("button", { name: /export all csv/i })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole("button", { name: /export all csv/i }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:letterboxd-watch-list");
      expect(createdAnchor.download).toMatch(/^movie-bowl-letterboxd-watched-\d{4}-\d{2}-\d{2}\.csv$/);

      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.options).toEqual({ type: "text/csv;charset=utf-8" });
      expect(blob.parts).toEqual([
        [
          "tmdbID,Title,Year,WatchedDate",
          `102,Shared Favorite,2004,${formatLocalDate("2026-04-10T12:00:00.000Z")}`,
          `101,Owned Favorite,2001,${formatLocalDate("2026-04-12T18:30:00.000Z")}`,
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

  it("opens a read-only enriched detail modal when a TMDB watched movie is clicked", async () => {
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
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("providers loaded")).toBeInTheDocument();
    expect(screen.getByText("read-only")).toBeInTheDocument();
  });

  it("preserves public add-link attribution in detail view", async () => {
    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Shared Favorite")).toHaveLength(2);
    });

    const duplicateButtons = screen.getAllByRole("button", { name: /shared favorite/i });
    fireEvent.click(duplicateButtons[1]);

    await waitFor(() => {
      expect(screen.getByTestId("movie-detail-modal")).toBeInTheDocument();
    });

    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalledWith(null);
  });
});
