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

function getCommentField() {
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

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: "Details for Movie A" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    });
    fireEvent.change(getCommentField(), {
      target: { value: "  Recommended after dinner.\nBring tissues.  " },
    });
    expect(screen.getByText("123 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch trailer/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open on web in/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Movie A trailer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));
    expect(await screen.findByTitle("Movie A trailer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Movie", exact: true }));

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
    expect(screen.queryByLabelText(/comment \(optional\)/i)).toBeNull();
  });

  it("offers the comment only in a movie's details, and quick add carries none", async () => {
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
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie A" },
    });

    await screen.findByText("Movie A");
    expect(screen.queryByLabelText(/comment \(optional\)/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /comment \(optional\)/i })).toBeNull();

    // A comment written for one movie is dropped when its details close, so it
    // can never ride along on the next add.
    fireEvent.click(screen.getByRole("button", { name: "Details for Movie A" }));
    await screen.findByRole("heading", { name: "Movie A", level: 2 });
    expect(getCommentField()).toHaveAttribute("maxlength", "500");
    fireEvent.change(getCommentField(), { target: { value: "Meant for another movie" } });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByLabelText(/comment \(optional\)/i)).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Add Movie A" }));

    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
    expect(onAddMovie.mock.calls[0][0].note).toBeUndefined();
  });

  it("sends a blank details comment as no comment", async () => {
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
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Movie A" },
    });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: "Details for Movie A" }));
    await screen.findByRole("heading", { name: "Movie A", level: 2 });
    fireEvent.change(getCommentField(), { target: { value: "   \n  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add Movie", exact: true }));

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
    const addButton = screen.getByRole("button", { name: "Add Movie A" });

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(onAddMovie).toHaveBeenCalledTimes(1);
    });
    expect(addButton).toBeDisabled();
    // The + becomes a spinner; only its name says what is happening.
    expect(addButton).toHaveAccessibleName("Adding Movie A");

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
    fireEvent.click(screen.getByRole("button", { name: "Details for Movie A" }));
    await screen.findByRole("heading", { name: "Movie A", level: 2 });
    fireEvent.change(getCommentField(), { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Movie", exact: true }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This movie is already in the bowl."
    );
    expect(screen.getByRole("heading", { name: "Movie A", level: 2 })).toBeInTheDocument();
    expect(getCommentField()).toHaveValue("Keep this draft");
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
    fireEvent.change(searchInput, { target: { value: "Movie A" } });

    await screen.findByText("Movie A");
    fireEvent.click(screen.getByRole("button", { name: "Add Movie A" }));

    expect(await screen.findByText("This movie is already in the bowl.")).toBeInTheDocument();
    expect(searchInput).toHaveValue("Movie A");
    expect(screen.getByText("Movie A")).toBeInTheDocument();
  });
});
