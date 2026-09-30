import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbPeople: vi.fn(async () => ({ people: [] })), suggestTmdbQuery: vi.fn(async () => null),
  searchTmdbMovies: mocks.searchTmdbMovies,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

const friday = { id: "friday", name: "Friday Night" };
const results = [
  { id: 1, title: "Paris, Texas", release_date: "1984-05-19" },
  { id: 2, title: "Moonstruck", release_date: "1987-12-16" },
  { id: 3, title: "The Apartment", release_date: "1960-06-15" },
  { id: 4, title: "Before Sunrise", release_date: "1995-01-27" },
];
const marks = {
  1: { kind: "in_bowl", owner: "mine", blocksAdd: true, bowl: friday },
  2: { kind: "watched", watchedOn: "2026-01-05", blocksAdd: false },
  3: { kind: "other_bowl", bowl: { id: "late", name: "Late Shift" }, blocksAdd: false },
};

async function search(getResultMark = (movie) => marks[movie.id] || null) {
  const onAddMovie = vi.fn(async () => true);
  mocks.searchTmdbMovies.mockResolvedValue({ page: 1, totalPages: 1, totalResults: results.length, results });
  render(<MovieSearch onAddMovie={onAddMovie} getResultMark={getResultMark} />);
  fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value: "night" } });
  await screen.findByRole("button", { name: "Details for Paris, Texas" });
  return { onAddMovie };
}

const row = (title) => screen.getByRole("button", { name: `Details for ${title}` }).closest("[role='row']");

describe("MovieSearch result marks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], providerLogos: {}, availability: {}, status: "ready" });
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 100, genres: [], overview: "", trailer: null });
  });

  afterEach(() => cleanup());

  it("puts the bowl where the + was for a title already in this bowl", async () => {
    await search();

    const inBowl = row("Paris, Texas");
    expect(within(inBowl).queryByRole("button", { name: "Add Paris, Texas" })).not.toBeInTheDocument();
    expect(within(inBowl).getByRole("img", { name: "Paris, Texas is already in Friday Night" })).toBeInTheDocument();
    expect(within(row("Before Sunrise")).getByRole("button", { name: "Add Before Sunrise" })).toBeInTheDocument();
  });

  it("keeps the + on a watched title and says when, to a screen reader, with the row", async () => {
    await search();

    const watched = row("Moonstruck");
    expect(within(watched).getByRole("button", { name: "Add Moonstruck" })).toBeInTheDocument();
    expect(watched.querySelector(".search-watched-stub")).toHaveAttribute("aria-hidden", "true");
    const details = within(watched).getByRole("button", { name: "Details for Moonstruck" });
    expect(document.getElementById(details.getAttribute("aria-describedby"))).toHaveTextContent(/Watched January 5, 2026/);
  });

  it("names another bowl holding the title and keeps its +", async () => {
    await search();

    const elsewhere = row("The Apartment");
    expect(within(elsewhere).getByRole("button", { name: "Add The Apartment" })).toBeInTheDocument();
    const details = within(elsewhere).getByRole("button", { name: "Details for The Apartment" });
    expect(document.getElementById(details.getAttribute("aria-describedby"))).toHaveTextContent("In Late Shift");
  });

  it("opens a title already in the bowl on Enter instead of trying to add it", async () => {
    const { onAddMovie } = await search();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(await screen.findByText("Already in", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Movie", exact: true })).not.toBeInTheDocument();
    expect(onAddMovie).not.toHaveBeenCalled();
  });

  it("offers no add in the details of a title already in the bowl, and keeps it for the rest", async () => {
    await search();

    fireEvent.click(screen.getByRole("button", { name: "Details for Paris, Texas" }));
    await screen.findByText("Friday Night");
    expect(screen.queryByRole("button", { name: "Add Movie", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Recommended by Tim at dinner…")).not.toBeInTheDocument();

    cleanup();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "Details for Moonstruck" }));
    expect(await screen.findByRole("button", { name: "Add Movie", exact: true })).toBeInTheDocument();
  });

  it("adds a someone-else's-slip title once the mark stops blocking it", async () => {
    const { onAddMovie } = await search((movie) => (movie.id === 1
      ? { kind: "in_bowl", owner: "theirs", blocksAdd: false, bowl: friday } : null));

    fireEvent.click(within(row("Paris, Texas")).getByRole("button", { name: "Add Paris, Texas" }));

    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
  });

  it("marks nothing without marks, as on a public add link", async () => {
    await search(null);

    for (const { title } of results) {
      expect(within(row(title)).getByRole("button", { name: `Add ${title}` })).toBeInTheDocument();
    }
    expect(document.querySelector(".search-watched-stub")).toBeNull();
  });
});
