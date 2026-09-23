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

describe("MovieSearch pagination and identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      providerLogos: {},
      availability: {},
      status: "ready",
      region: "US",
      fetchedAt: null,
    });
  });

  afterEach(() => cleanup());

  it("appends and deduplicates later pages while preserving identity metadata", async () => {
    mocks.searchTmdbMovies
      .mockResolvedValueOnce({
        page: 1,
        totalPages: 2,
        totalResults: 3,
        results: [
          {
            id: 101,
            title: "Amelie",
            original_title: "Le Fabuleux Destin d'Amélie Poulain",
            original_language: "fr",
            release_date: "2001-04-25",
          },
          { id: 102, title: "Arrival", original_title: "Arrival", original_language: "en", release_date: "2016-11-11" },
        ],
      })
      .mockResolvedValueOnce({
        page: 2,
        totalPages: 2,
        totalResults: 3,
        results: [
          { id: 102, title: "Arrival", release_date: "2016-11-11" },
          { id: 103, title: "Future Movie", release_date: "2099-12-04" },
        ],
      });

    render(<MovieSearch onAddMovie={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie" },
    });

    expect(await screen.findByText(/Original: Le Fabuleux Destin/)).toHaveTextContent("French");
    expect(screen.getByText(/2 of 3 results below/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /load more movies/i }));

    expect(await screen.findByText("Future Movie")).toBeInTheDocument();
    expect(screen.getByText("Coming Dec 4, 2099")).toBeInTheDocument();
    expect(screen.getAllByText("Arrival")).toHaveLength(1);
    expect(mocks.searchTmdbMovies).toHaveBeenNthCalledWith(1, "Movie", { page: 1 });
    expect(mocks.searchTmdbMovies).toHaveBeenNthCalledWith(2, "Movie", { page: 2 });
    expect(screen.queryByRole("button", { name: /load more movies/i })).not.toBeInTheDocument();
  });

  it("keeps current results and offers retry context when a later page fails", async () => {
    mocks.searchTmdbMovies
      .mockResolvedValueOnce({
        page: 1,
        totalPages: 2,
        totalResults: 2,
        results: [{ id: 101, title: "Movie A", release_date: "2020-01-01" }],
      })
      .mockRejectedValueOnce(new Error("Page unavailable"));

    render(<MovieSearch onAddMovie={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie" },
    });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: /load more movies/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Movie service is unavailable right now. Please try again. Your current results are still here."
    );
    expect(screen.getByText("Movie A")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /load more movies/i })).toBeEnabled());
  });

  it("does not call an unchecked or failed provider lookup empty", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [{ id: 101, title: "Movie A", release_date: "2020-01-01" }],
    });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      providerLogos: {},
      availability: {},
      status: "failed",
      region: "US",
      fetchedAt: null,
    });

    render(<MovieSearch onAddMovie={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie" },
    });

    expect(await screen.findByText("Couldn\u2019t check availability")).toBeInTheDocument();
    expect(screen.queryByText(/not on free or included/i)).not.toBeInTheDocument();
  });
});
