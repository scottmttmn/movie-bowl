import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";
import { OFFLINE_MESSAGE } from "../../utils/networkErrors";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbPeople: vi.fn(async () => ({ people: [] })),
  searchTmdbMovies: mocks.searchTmdbMovies,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

function type(term) {
  fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value: term } });
}

describe("MovieSearch loading, empty and error states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      providerLogos: {},
      availability: {},
      status: "ready",
      region: "US",
      fetchedAt: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows loading in the field and as row-height placeholders, not a line that pushes results", async () => {
    mocks.searchTmdbMovies.mockReturnValue(new Promise(() => {}));
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("Shutter");

    expect(await screen.findByTestId("search-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("search-skeleton")).toBeInTheDocument();
    expect(screen.getByText("Searching movies…")).toHaveClass("sr-only");
  });

  it("offers the custom slip as the main action when nothing matches, with no retry", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({ results: [] });
    const onAddMovie = vi.fn(async () => ({ ok: true }));
    render(<MovieSearch onAddMovie={onAddMovie} />);
    type("something with Adam Sandler");

    expect(await screen.findByText(/no movie or person matches/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: 'Add "something with Adam Sandler"' }));
    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
    expect(onAddMovie.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: "something with Adam Sandler", isCustomEntry: true })
    );
  });

  it("keeps the custom slip after its add fails, so it can be tried again", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({ results: [] });
    const onAddMovie = vi.fn()
      .mockResolvedValueOnce({ ok: false, message: "This add link has expired." })
      .mockResolvedValueOnce({ ok: true });
    render(<MovieSearch onAddMovie={onAddMovie} />);
    type("something with Adam Sandler");

    fireEvent.click(await screen.findByRole("button", { name: 'Add "something with Adam Sandler"' }));
    expect(await screen.findByText("This add link has expired.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: 'Add "something with Adam Sandler"' }));
    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(2));
  });

  it("keeps a quieter custom slip below real results", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }],
    });
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("cast");

    await screen.findByRole("button", { name: "Details for Cast Away" });
    expect(screen.getByRole("button", { name: 'Add "cast"' })).toHaveTextContent(/not here\?/i);
    expect(screen.queryByText(/no movie or person matches/i)).not.toBeInTheDocument();
  });

  it("says a failed search failed, offers Try again, and retries the same search", async () => {
    mocks.searchTmdbMovies
      .mockRejectedValueOnce(new Error("Request failed with 503"))
      .mockResolvedValueOnce({ results: [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }] });
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("cast away");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't search right now");
    expect(alert).toHaveTextContent("Your search is still here.");
    expect(screen.queryByText(/no movie or person matches/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Movie, actor or director")).toHaveValue("cast away");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Details for Cast Away" })).toBeInTheDocument();
    expect(mocks.searchTmdbMovies).toHaveBeenLastCalledWith("cast away", { page: 1 });
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("does not blame the movie service when the person is offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    mocks.searchTmdbMovies.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("cast away");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(OFFLINE_MESSAGE);
    expect(alert).not.toHaveTextContent(/movie service/i);
  });

  it("never offers Try again for an add that was rejected", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }],
    });
    const onAddMovie = vi.fn(async () => ({ ok: false, message: "Cast Away is already in this bowl." }));
    render(<MovieSearch onAddMovie={onAddMovie} />);
    type("cast");

    fireEvent.click(await screen.findByRole("button", { name: "Add Cast Away" }));
    expect(await screen.findByText("Cast Away is already in this bowl.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
