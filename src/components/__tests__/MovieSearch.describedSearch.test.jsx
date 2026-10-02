import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  searchTmdbPeople: vi.fn(),
  suggestTmdbQuery: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
  describeSearch: vi.fn(),
  discoverByTerms: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
  searchTmdbPeople: mocks.searchTmdbPeople,
  suggestTmdbQuery: mocks.suggestTmdbQuery,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: mocks.fetchStreamingProviders }));
vi.mock("../../lib/describedSearch", () => ({
  describeSearch: mocks.describeSearch,
  discoverByTerms: mocks.discoverByTerms,
}));

const DESCRIPTION = "space movie where matt damon is stranded";
const damon = { kind: "person", id: 1892, label: "Matt Damon" };
const scifi = { kind: "genre", id: 878, label: "Science Fiction" };
const martian = { id: 286217, title: "The Martian", release_date: "2015-09-30" };
const elysium = { id: 68724, title: "Elysium", release_date: "2013-08-07" };
const stray = { id: 5, title: "Stranded", release_date: "2001-01-01" };

function titles(page = { page: 1, totalPages: 1, totalResults: 0, results: [] }) {
  mocks.searchTmdbMovies.mockResolvedValue(page);
}

function type(value) {
  render(<MovieSearch onAddMovie={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value } });
}

describe("MovieSearch described search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchTmdbPeople.mockResolvedValue({ people: [] });
    mocks.suggestTmdbQuery.mockResolvedValue(null);
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], providerLogos: {}, availability: {}, status: "ready", region: "US", fetchedAt: null });
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 100, genres: [], overview: "", trailer: null });
  });
  afterEach(() => cleanup());

  it("never asks the model about a title, and keeps the magnifier", async () => {
    titles({ page: 1, totalPages: 1, totalResults: 1, results: [{ id: 2501, title: "The Bourne Identity", release_date: "2002-06-14" }] });
    type("the bourne identity");
    await screen.findByRole("button", { name: "Details for The Bourne Identity" });
    expect(mocks.describeSearch).not.toHaveBeenCalled();
    expect(screen.queryByTestId(/smart-search/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Smart search is resting/)).not.toBeInTheDocument();
  });

  it("does not ask about a name people search found", async () => {
    titles();
    mocks.searchTmdbPeople.mockResolvedValue({ people: [{ id: 1892, name: "Matt Damon Paige Foster", profilePath: null, knownFor: [] }] });
    type("matt damon paige");
    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalled());
    await screen.findByRole("button", { name: /Matt Damon Paige Foster/ });
    expect(mocks.describeSearch).not.toHaveBeenCalled();
  });

  it("replaces the title results with what the description found, and shows what it read", async () => {
    titles({ page: 1, totalPages: 3, totalResults: 41, results: [stray] });
    mocks.describeSearch.mockResolvedValue({ status: "ok", terms: [damon, scifi], results: [martian, elysium] });
    type(DESCRIPTION);

    await screen.findByRole("button", { name: "Details for The Martian" });
    expect(mocks.describeSearch).toHaveBeenCalledWith(DESCRIPTION);
    expect(screen.queryByRole("button", { name: "Details for Stranded" })).not.toBeInTheDocument();
    expect(screen.getByTestId("smart-search-ready")).toBeInTheDocument();
    const chips = within(screen.getByRole("group", { name: "Searched for" })).getAllByRole("button");
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual(["Remove Matt Damon", "Remove Science Fiction"]);
    expect(screen.queryByRole("button", { name: /more results/i })).not.toBeInTheDocument();
  });

  it("searches the remaining terms when one is removed, and returns to the title results after the last", async () => {
    titles({ page: 1, totalPages: 1, totalResults: 1, results: [stray] });
    mocks.describeSearch.mockResolvedValue({ status: "ok", terms: [damon, scifi], results: [martian] });
    mocks.discoverByTerms.mockResolvedValue({ status: "ok", terms: [damon], results: [martian, elysium] });
    type(DESCRIPTION);
    await screen.findByRole("button", { name: "Details for The Martian" });

    fireEvent.click(screen.getByRole("button", { name: "Remove Science Fiction" }));
    await screen.findByRole("button", { name: "Details for Elysium" });
    expect(mocks.discoverByTerms).toHaveBeenCalledWith([damon]);
    expect(mocks.describeSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove Matt Damon" }));
    await screen.findByRole("button", { name: "Details for Stranded" });
    expect(screen.queryByRole("group", { name: "Searched for" })).not.toBeInTheDocument();
    expect(screen.queryByTestId(/smart-search/)).not.toBeInTheDocument();
  });

  it("leads with the titles the model recognized, and keeps them while terms are removed", async () => {
    const apocalypse = { id: 28, title: "Apocalypse Now", release_date: "1979-08-15" };
    const war = { kind: "genre", id: 10752, label: "War" };
    titles({ page: 1, totalPages: 1, totalResults: 1, results: [stray] });
    mocks.describeSearch.mockResolvedValue({ status: "ok", terms: [war, scifi], picks: [apocalypse], results: [martian] });
    mocks.discoverByTerms.mockResolvedValue({ status: "ok", terms: [war], results: [apocalypse, elysium] });
    type("vietnam napalm in the morning");

    await screen.findByRole("button", { name: "Details for Apocalypse Now" });
    const order = () => screen.getAllByRole("button", { name: /^Details for / }).map((button) => button.getAttribute("aria-label"));
    expect(order()).toEqual(["Details for Apocalypse Now", "Details for The Martian"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Science Fiction" }));
    await screen.findByRole("button", { name: "Details for Elysium" });
    expect(order()).toEqual(["Details for Apocalypse Now", "Details for Elysium"]);
  });

  it("asks about a short search only when title and people search find nothing at all", async () => {
    const dicaprio = { kind: "person", id: 6193, label: "Leonardo DiCaprio" };
    const inception = { id: 27205, title: "Inception", release_date: "2010-07-15" };
    titles();
    mocks.describeSearch.mockResolvedValue({ status: "ok", terms: [dicaprio], results: [inception] });
    type("leanardo decapiro");
    await screen.findByRole("button", { name: "Details for Inception" });
    expect(mocks.describeSearch).toHaveBeenCalledWith("leanardo decapiro");
    cleanup();

    mocks.describeSearch.mockClear();
    titles({ page: 1, totalPages: 1, totalResults: 1, results: [stray] });
    type("stranded alone");
    await screen.findByRole("button", { name: "Details for Stranded" });
    expect(mocks.describeSearch).not.toHaveBeenCalled();
  });

  it("asks the model before the spelling retry can drop words from a description", async () => {
    const pitt = { kind: "person", id: 287, label: "Brad Pitt" };
    const moneyball = { id: 60308, title: "Moneyball", release_date: "2011-09-22" };
    titles();
    mocks.suggestTmdbQuery.mockResolvedValue("brad pitt");
    mocks.describeSearch.mockResolvedValue({ status: "ok", terms: [pitt], picks: [moneyball], results: [] });
    type("brad pitt baseball movie");

    await screen.findByRole("button", { name: "Details for Moneyball" });
    expect(mocks.suggestTmdbQuery).not.toHaveBeenCalled();
    expect(screen.queryByText(/Showing results for/i)).not.toBeInTheDocument();
  });

  it("says smart search is resting and shows the title results when no model answers", async () => {
    titles({ page: 1, totalPages: 1, totalResults: 1, results: [stray] });
    mocks.describeSearch.mockResolvedValue({ status: "unavailable" });
    type(DESCRIPTION);

    await screen.findByRole("button", { name: "Details for Stranded" });
    expect(await screen.findByText("Smart search is resting. Try a title or a name.")).toBeInTheDocument();
    expect(screen.getByTestId("smart-search-unavailable")).toBeInTheDocument();

    // Typing again clears it until the next search says otherwise.
    fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value: "the" } });
    expect(screen.queryByText(/Smart search is resting/)).not.toBeInTheDocument();
  });

  it("stays quiet when the description search itself fails or finds nothing, or nobody is signed in", async () => {
    for (const outcome of [() => Promise.reject(new Error("boom")), () => Promise.resolve({ status: "empty" }), () => Promise.resolve({ status: "signed-out" })]) {
      titles({ page: 1, totalPages: 1, totalResults: 1, results: [stray] });
      mocks.describeSearch.mockImplementationOnce(outcome);
      type(DESCRIPTION);
      await screen.findByRole("button", { name: "Details for Stranded" });
      expect(screen.queryByTestId(/smart-search/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Smart search is resting/)).not.toBeInTheDocument();
      cleanup();
    }
  });
});
