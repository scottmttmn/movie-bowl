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
  });

  it("loads watched movies across owned and member bowls and shows duplicates", async () => {
    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getByText("Watch List")).toBeInTheDocument();
    });

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((node) => node.textContent)).toEqual([
      "Shared Favorite",
      "Owned Favorite",
      "Shared Favorite",
    ]);

    expect(screen.getAllByText("Shared Favorite")).toHaveLength(2);
    expect(screen.getByText("Shared Bowl")).toBeInTheDocument();
    expect(screen.getAllByText("Owned Bowl")).toHaveLength(2);
    expect(screen.getAllByText(/Watched on /i)).toHaveLength(3);
  });

  it("shows an empty state when no watched movies are available", async () => {
    mocks.state.watchedRows = [];

    render(<WatchListPage />);

    await waitFor(() => {
      expect(screen.getByText(/no watched movies yet/i)).toBeInTheDocument();
    });
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
