import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  searchTmdbPeople: vi.fn(),
  suggestTmdbQuery: vi.fn(),
  getTmdbPersonMovies: vi.fn(),
  getTmdbPersonMoviesOnServices: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
  searchTmdbPeople: mocks.searchTmdbPeople,
  suggestTmdbQuery: mocks.suggestTmdbQuery,
  getTmdbPersonMovies: mocks.getTmdbPersonMovies,
  getTmdbPersonMoviesOnServices: mocks.getTmdbPersonMoviesOnServices,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

const eastwood = { id: 190, name: "Clint Eastwood", profilePath: null, knownForDepartment: "Directing", knownFor: [] };

const credits = {
  acting: [{ id: 4, title: "Dirty Harry", release_date: "1971-12-23", characters: ["Harry"] }],
  directing: [
    { id: 1, title: "Gran Torino", release_date: "2008-12-12" },
    { id: 2, title: "Letters from Iwo Jima", release_date: "2006-12-20" },
    { id: 3, title: "Unforgiven", release_date: "1992-08-07" },
  ],
};

const SERVICES = ["Netflix", "Max", "Prime Video", "Hulu"];
const FILTER_NAME = "Only movies on Netflix, Max, Prime Video, Hulu";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function openEastwood(props = {}) {
  render(<MovieSearch onAddMovie={vi.fn(async () => ({ ok: true }))} userStreamingServices={SERVICES} {...props} />);
  fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value: "clint eastwood" } });
  fireEvent.click(await screen.findByRole("button", { name: "Show Clint Eastwood’s movies" }));
  await screen.findByRole("button", { name: "Details for Gran Torino" });
}

const titles = () => screen.queryAllByRole("button", { name: /^Details for / }).map((button) => button.getAttribute("aria-label").slice(12));

describe("MovieSearch person movies on my services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchTmdbMovies.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });
    mocks.searchTmdbPeople.mockResolvedValue({ people: [eastwood] });
    mocks.getTmdbPersonMovies.mockResolvedValue(credits);
    mocks.getTmdbPersonMoviesOnServices.mockResolvedValue(new Set([1, 3, 4]));
    mocks.suggestTmdbQuery.mockResolvedValue(null);
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], providerLogos: {}, availability: {}, status: "ready", region: "US", fetchedAt: null });
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 100, genres: [], overview: "", trailer: null });
  });

  afterEach(() => cleanup());

  it("narrows the person's movies to the viewer's services, and back", async () => {
    await openEastwood();
    const filter = screen.getByRole("button", { name: FILTER_NAME });
    expect(filter).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(mocks.getTmdbPersonMoviesOnServices).toHaveBeenCalledWith(190, SERVICES);
    await waitFor(() => expect(titles()).toEqual(["Gran Torino", "Unforgiven"]));

    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(titles()).toEqual(["Gran Torino", "Letters from Iwo Jima", "Unforgiven"]);
  });

  it("keeps the list as it was until the whole answer arrives", async () => {
    const answer = deferred();
    mocks.getTmdbPersonMoviesOnServices.mockReturnValue(answer.promise);
    await openEastwood();
    fireEvent.click(screen.getByRole("button", { name: FILTER_NAME }));

    expect(screen.getByRole("button", { name: FILTER_NAME })).toHaveAttribute("aria-busy", "true");
    expect(titles()).toEqual(["Gran Torino", "Letters from Iwo Jima", "Unforgiven"]);
    answer.resolve(new Set([3]));
    await waitFor(() => expect(titles()).toEqual(["Unforgiven"]));
  });

  it("moves the highlight back to the top when the narrowed list lands", async () => {
    const answer = deferred();
    mocks.getTmdbPersonMoviesOnServices.mockReturnValue(answer.promise);
    await openEastwood();
    fireEvent.click(screen.getByRole("button", { name: FILTER_NAME }));
    const field = screen.getByPlaceholderText("Movie, actor or director");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-3");

    answer.resolve(new Set([3]));
    await waitFor(() => expect(titles()).toEqual(["Unforgiven"]));
    // The reset lands in the effect after the narrowed render, so wait for it.
    await waitFor(() => expect(field).toHaveAttribute("aria-activedescendant", "movie-option-3"));
    expect(screen.getByRole("row", { name: /Unforgiven/ })).toHaveAttribute("aria-selected", "true");
  });

  it("stays on across roles, and offers everything back when a role has none", async () => {
    mocks.getTmdbPersonMoviesOnServices.mockResolvedValue(new Set([1]));
    await openEastwood();
    fireEvent.click(screen.getByRole("button", { name: FILTER_NAME }));
    await waitFor(() => expect(titles()).toEqual(["Gran Torino"]));

    fireEvent.click(screen.getByRole("tab", { name: "Acting" }));
    expect(titles()).toEqual([]);
    expect(screen.getByText("None on your services.")).toBeInTheDocument();
    expect(screen.queryByText(/No feature films found/)).not.toBeInTheDocument();
    expect(mocks.getTmdbPersonMoviesOnServices).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(titles()).toEqual(["Dirty Harry"]);
    expect(screen.getByRole("button", { name: FILTER_NAME })).toHaveAttribute("aria-pressed", "false");
  });

  it("says when the services could not be checked and hides nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getTmdbPersonMoviesOnServices.mockRejectedValue(new Error("TMDB down"));
    await openEastwood();
    fireEvent.click(screen.getByRole("button", { name: FILTER_NAME }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t check your services.");
    expect(screen.getByRole("button", { name: FILTER_NAME })).toHaveAttribute("aria-pressed", "false");
    expect(titles()).toEqual(["Gran Torino", "Letters from Iwo Jima", "Unforgiven"]);
  });

  it("ignores an answer that lands after the filter was turned off", async () => {
    const answer = deferred();
    mocks.getTmdbPersonMoviesOnServices.mockReturnValue(answer.promise);
    await openEastwood();
    const filter = screen.getByRole("button", { name: FILTER_NAME });
    fireEvent.click(filter);
    fireEvent.click(filter);
    answer.resolve(new Set([3]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(titles()).toEqual(["Gran Torino", "Letters from Iwo Jima", "Unforgiven"]);
    expect(filter).toHaveAttribute("aria-pressed", "false");
  });

  it("starts off again for the next person", async () => {
    await openEastwood();
    fireEvent.click(screen.getByRole("button", { name: FILTER_NAME }));
    await waitFor(() => expect(titles()).toEqual(["Gran Torino", "Unforgiven"]));

    fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value: "clint eastwoo" } });
    fireEvent.click(await screen.findByRole("button", { name: "Show Clint Eastwood’s movies" }));
    await screen.findByRole("button", { name: "Details for Letters from Iwo Jima" });
    expect(screen.getByRole("button", { name: FILTER_NAME })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no filter without services, as on a public add link", async () => {
    await openEastwood({ userStreamingServices: [] });
    expect(screen.queryByTestId("person-services-filter")).not.toBeInTheDocument();
  });
});
