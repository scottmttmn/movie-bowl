import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

describe("MovieSearch detail flow", () => {
  beforeEach(() => {
    mocks.searchTmdbMovies.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.fetchStreamingProviders.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens details for a search result and adds the detailed movie", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 101, title: "Movie A", release_date: "2020-01-01", poster_path: "/a.jpg" }],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      runtime: 123,
      genres: [{ id: 1, name: "Action" }],
      overview: "Test overview",
      trailer: {
        site: "YouTube",
        key: "movie-a-trailer",
        embedUrl: "https://www.youtube.com/embed/movie-a-trailer",
      },
    });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    });

    const onAddMovie = vi.fn(async () => {});
    render(<MovieSearch onAddMovie={onAddMovie} userStreamingServices={["Netflix"]} />);

    fireEvent.change(screen.getByPlaceholderText("Search movies..."), { target: { value: "Movie A" } });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: /details/i }));

    await waitFor(() => {
      expect(screen.getByText("Movie A (2020)")).toBeInTheDocument();
    });
    expect(screen.getByText("Runtime: 123 minutes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show trailer/i })).toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show trailer/i }));
    expect(screen.getByTitle("Movie A trailer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add movie/i }));

    await waitFor(() => {
      expect(onAddMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 101,
          title: "Movie A",
          runtime: 123,
          streamingProviders: ["Netflix"],
          trailer: expect.objectContaining({
            key: "movie-a-trailer",
          }),
        })
      );
    });
  });

  it("prevents duplicate add submits when add is clicked twice quickly", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 101, title: "Movie A", release_date: "2020-01-01", poster_path: "/a.jpg" }],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      runtime: 123,
      genres: [{ id: 1, name: "Action" }],
      overview: "Test overview",
      trailer: null,
    });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    });

    let resolveAdd;
    const onAddMovie = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        })
    );

    render(<MovieSearch onAddMovie={onAddMovie} userStreamingServices={["Netflix"]} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), { target: { value: "Movie A" } });

    await screen.findByText("Movie A");
    const addButton = screen.getByRole("button", { name: /^add$/i });

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(onAddMovie).toHaveBeenCalledTimes(1);
    });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveTextContent("Adding...");

    resolveAdd();

    await waitFor(() => {
      expect(screen.queryByText("Movie A")).not.toBeInTheDocument();
    });
  });
});
