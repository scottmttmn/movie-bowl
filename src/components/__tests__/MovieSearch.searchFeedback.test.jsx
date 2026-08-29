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

describe("MovieSearch search feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 100, genres: [] });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("reports that a search is running and then how many results came back", async () => {
    let resolveSearch;
    mocks.searchTmdbMovies.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );

    render(<MovieSearch onAddMovie={vi.fn(async () => ({ ok: true }))} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie" },
    });

    // The indicator appears while the debounce is still counting down, so the
    // field never looks like it swallowed the query.
    expect(screen.getByText("Searching movies…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add "movie"/i })).toBeNull();
    expect(screen.queryByText(/no matching movies found/i)).toBeNull();

    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalled());
    resolveSearch({
      results: [
        { id: 101, title: "Movie A", release_date: "2020-01-01" },
        { id: 102, title: "Movie B", release_date: "2021-01-01" },
      ],
    });

    expect(await screen.findByText(/2 results below/i)).toBeInTheDocument();
    expect(screen.queryByText("Searching movies…")).toBeNull();
  });

  it("falls back to the empty-state copy once a search returns nothing", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({ results: [] });

    render(<MovieSearch onAddMovie={vi.fn(async () => ({ ok: true }))} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Nothing" },
    });

    expect(await screen.findByText(/no matching movies found/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add "nothing"/i })).toBeInTheDocument();
  });

  it("keeps the comment field collapsed until it is asked for", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({ results: [] });
    render(<MovieSearch onAddMovie={vi.fn(async () => ({ ok: true }))} />);

    expect(screen.queryByLabelText(/comment \(optional\)/i)).toBeNull();

    const toggle = screen.getByRole("button", { name: /comment \(optional\)/i });
    fireEvent.click(toggle);

    const comment = screen.getByLabelText(/comment \(optional\)/i);
    expect(comment).toHaveFocus();
    fireEvent.change(comment, { target: { value: "Tim swears by it" } });

    fireEvent.click(screen.getByRole("button", { name: /comment \(optional\)/i }));
    expect(screen.queryByLabelText(/comment \(optional\)/i)).toBeNull();
    // Collapsed, the draft is still visible so it is never silently attached.
    expect(screen.getByText("Tim swears by it")).toBeInTheDocument();
  });

  it("hides the comment field entirely when the host form opts out", () => {
    render(<MovieSearch onAddMovie={vi.fn()} includeComment={false} />);

    expect(screen.queryByRole("button", { name: /comment \(optional\)/i })).toBeNull();
  });
});
