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

function openCommentField() {
  fireEvent.click(screen.getByRole("button", { name: /comment \(optional\)/i }));
  return screen.getByLabelText(/comment \(optional\)/i);
}

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
    fireEvent.change(openCommentField(), {
      target: { value: "  Recommended after dinner.\nBring tissues.  " },
    });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: /details/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    });
    expect(screen.getByText("123 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch trailer/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open on web in/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));
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
          note: "Recommended after dinner.\nBring tissues.",
        })
      );
    });
    expect(openCommentField()).toHaveValue("");
  });

  it("passes a normalized blank comment through quick add and enforces the limit", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 101, title: "Movie A", release_date: "2020-01-01" }],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 123, genres: [] });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: null,
    });
    const onAddMovie = vi.fn(async () => ({ ok: true }));

    render(<MovieSearch onAddMovie={onAddMovie} />);
    const comment = openCommentField();
    expect(comment).toHaveAttribute("maxlength", "500");
    fireEvent.change(comment, { target: { value: "   \n  " } });
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie A" },
    });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onAddMovie).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
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

  it("keeps movie details open and shows an inline duplicate error", async () => {
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
    const onAddMovie = vi.fn(async () => ({
      ok: false,
      code: "duplicate_movie",
      message: "This movie is already in the bowl.",
    }));

    render(<MovieSearch onAddMovie={onAddMovie} userStreamingServices={["Netflix"]} />);
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie A" },
    });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    await screen.findByRole("heading", { name: "Movie A", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: /add movie/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This movie is already in the bowl."
    );
    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
  });

  it("keeps search results open after a duplicate add is rejected", async () => {
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
    const onAddMovie = vi.fn(async () => ({
      ok: false,
      code: "duplicate_movie",
      message: "This movie is already in the bowl.",
    }));

    render(<MovieSearch onAddMovie={onAddMovie} userStreamingServices={["Netflix"]} />);
    const searchInput = screen.getByPlaceholderText("Search movies...");
    const comment = openCommentField();
    fireEvent.change(comment, { target: { value: "Keep this draft" } });
    fireEvent.change(searchInput, { target: { value: "Movie A" } });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText("This movie is already in the bowl.")).toBeInTheDocument();
    expect(searchInput).toHaveValue("Movie A");
    expect(comment).toHaveValue("Keep this draft");
    expect(screen.getByText("Movie A")).toBeInTheDocument();
  });
});
