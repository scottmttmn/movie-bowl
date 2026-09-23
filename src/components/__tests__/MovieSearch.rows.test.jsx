import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

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

const providerResult = (providers, status = "ready") => ({
  providers,
  providerLogos: {},
  availability: {},
  status,
  region: "US",
  fetchedAt: null,
});

async function search(term, results, { userStreamingServices = [], onAddMovie = vi.fn() } = {}) {
  mocks.searchTmdbMovies.mockResolvedValue({ page: 1, totalPages: 1, totalResults: results.length, results });
  render(<MovieSearch onAddMovie={onAddMovie} userStreamingServices={userStreamingServices} />);
  fireEvent.change(screen.getByPlaceholderText("Movie title or person"), { target: { value: term } });
  await screen.findByRole("button", { name: `Details for ${results[0].title}` });
  return { onAddMovie };
}

describe("MovieSearch result rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchStreamingProviders.mockResolvedValue(providerResult([]));
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 100, genres: [], overview: "", trailer: null });
  });

  afterEach(() => cleanup());

  it("lays results out as a grid of rows with two actions, not listbox options", async () => {
    await search("Cast", [
      { id: 1, title: "Cast Away", release_date: "2000-12-22" },
      { id: 2, title: "The Cast", release_date: "2012-01-01" },
    ]);

    const grid = screen.getByRole("grid", { name: "Search results" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(2);
    const firstRowButtons = within(rows[0]).getAllByRole("button");
    expect(firstRowButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Details for Cast Away",
      "Add Cast Away",
    ]);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-controls", "movie-search-listbox");
  });

  it("opens details from the row and adds only from the +", async () => {
    const { onAddMovie } = await search("Cast", [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }]);

    fireEvent.click(screen.getByRole("button", { name: "Details for Cast Away" }));
    expect(await screen.findByRole("button", { name: "Add Movie", exact: true })).toBeInTheDocument();
    expect(onAddMovie).not.toHaveBeenCalled();
  });

  it("still adds the highlighted row on Enter", async () => {
    const { onAddMovie } = await search("Cast", [
      { id: 1, title: "Cast Away", release_date: "2000-12-22" },
      { id: 2, title: "The Cast", release_date: "2012-01-01" },
    ]);
    const field = screen.getByRole("combobox");

    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-2");
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
    expect(onAddMovie.mock.calls[0][0]).toEqual(expect.objectContaining({ title: "The Cast" }));
  });

  it("leads availability with the viewer's own services", async () => {
    mocks.fetchStreamingProviders.mockResolvedValue(providerResult(["Netflix", "Max", "Hulu"]));
    await search("Cast", [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }], {
      userStreamingServices: ["Netflix"],
    });

    expect(await screen.findByText("On your Netflix · +2 more")).toBeInTheDocument();
  });

  it("lists other services quietly when none are the viewer's", async () => {
    mocks.fetchStreamingProviders.mockResolvedValue(providerResult(["Hulu", "Peacock"]));
    await search("Cast", [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }], {
      userStreamingServices: ["Netflix"],
    });

    expect(await screen.findByText("Hulu, Peacock")).toBeInTheDocument();
    expect(screen.queryByText(/on your/i)).not.toBeInTheDocument();
  });

  it("says a checked title streams nowhere only when the check succeeded", async () => {
    await search("Cast", [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }]);

    expect(await screen.findByText("Not on free or included US services")).toBeInTheDocument();
  });

  it("shows a placeholder, not a sentence, while availability is being checked", async () => {
    mocks.fetchStreamingProviders.mockReturnValue(new Promise(() => {}));
    await search("Cast", [{ id: 1, title: "Cast Away", release_date: "2000-12-22" }]);

    expect(await screen.findByText("Checking availability")).toHaveClass("sr-only");
    expect(screen.queryByText(/not on free or included/i)).not.toBeInTheDocument();
  });
});
