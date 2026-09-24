import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  searchTmdbPeople: vi.fn(),
  getTmdbPersonMovies: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
  searchTmdbPeople: mocks.searchTmdbPeople,
  getTmdbPersonMovies: mocks.getTmdbPersonMovies,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

const hanks = {
  id: 31,
  name: "Tom Hanks",
  profilePath: null,
  knownForDepartment: "Acting",
  knownFor: ["Cast Away", "Big"],
};

const titleResults = [
  { id: 101, title: "Hanky Panky", release_date: "1982-06-04" },
  { id: 102, title: "The Hanks Story", release_date: "2010-01-01" },
];

const credits = {
  acting: [
    { id: 1, title: "Cast Away", release_date: "2000-12-22", characters: ["Chuck Noland"] },
    { id: 2, title: "Big", release_date: "1988-06-03", characters: ["Josh"] },
  ],
  directing: [{ id: 3, title: "That Thing You Do!", release_date: "1996-10-04" }],
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// What a real click does that fireEvent.click does not: say what pointer it
// came from, and move focus to what was clicked.
function pointerClick(element, pointerType) {
  const down = new Event("pointerdown", { bubbles: true });
  down.pointerType = pointerType;
  fireEvent(element, down);
  element.focus();
  fireEvent.click(element, { detail: 1 });
}

function type(term) {
  fireEvent.change(screen.getByPlaceholderText("Movie title or person"), { target: { value: term } });
}

async function searchWithPeople({ onAddMovie = vi.fn(async () => ({ ok: true })), props = {} } = {}) {
  render(<MovieSearch onAddMovie={onAddMovie} {...props} />);
  type("tom han");
  await screen.findByRole("button", { name: "Show Tom Hanks’s movies" });
  await screen.findByRole("button", { name: "Details for Hanky Panky" });
  return { onAddMovie };
}

describe("MovieSearch people", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchTmdbMovies.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 2, results: titleResults });
    mocks.searchTmdbPeople.mockResolvedValue({ people: [hanks] });
    mocks.getTmdbPersonMovies.mockResolvedValue(credits);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      providerLogos: {},
      availability: {},
      status: "ready",
      region: "US",
      fetchedAt: null,
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({ runtime: 100, genres: [], overview: "", trailer: null });
  });

  afterEach(() => cleanup());

  it("offers a strong match above the movies, as navigation with no add action", async () => {
    await searchWithPeople();

    expect(mocks.searchTmdbPeople).toHaveBeenCalledWith("tom han", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const grid = screen.getByRole("grid", { name: "Search results" });
    const rows = within(grid).getAllByRole("row");
    expect(rows[0]).toHaveAccessibleName("People");
    expect(within(rows[0]).getAllByRole("button")).toHaveLength(1);
    expect(within(rows[0]).queryByRole("button", { name: /add/i })).not.toBeInTheDocument();
    expect(screen.getByText("Cast Away, Big")).toBeInTheDocument();
  });

  it("waits a moment for people, so the row lands with the movies", async () => {
    const people = deferred();
    mocks.searchTmdbPeople.mockReturnValue(people.promise);
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("tom han");
    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Titles have answered, but they are held for the people lookup.
    expect(screen.queryByRole("button", { name: "Details for Hanky Panky" })).not.toBeInTheDocument();

    people.resolve({ people: [hanks] });
    expect(await screen.findByRole("button", { name: "Details for Hanky Panky" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Tom Hanks’s movies" })).toBeInTheDocument();
  });

  it("still shows a person who answers after the movies, every time the name is searched", async () => {
    render(<MovieSearch onAddMovie={vi.fn()} />);

    for (let round = 0; round < 2; round += 1) {
      mocks.searchTmdbPeople.mockResolvedValueOnce({ people: [] });
      type("cast");
      await screen.findByRole("button", { name: "Details for Hanky Panky" });

      const people = deferred();
      mocks.searchTmdbPeople.mockReturnValueOnce(people.promise);
      type("tom han");
      // The titles stop waiting after a moment and show on their own...
      await screen.findByRole("button", { name: "Details for Hanky Panky" });
      expect(screen.queryByRole("button", { name: "Show Tom Hanks’s movies" })).not.toBeInTheDocument();
      // ...and the person still arrives, on the first search and the retype.
      people.resolve({ people: [hanks] });
      expect(await screen.findByRole("button", { name: "Show Tom Hanks’s movies" })).toBeInTheDocument();
    }
  });

  it("drops a people answer for a query that has since changed", async () => {
    const stale = deferred();
    mocks.searchTmdbPeople.mockReturnValueOnce(stale.promise).mockResolvedValue({ people: [] });
    mocks.searchTmdbMovies.mockReturnValueOnce(new Promise(() => {}));
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("tom han");
    await waitFor(() => expect(mocks.searchTmdbPeople).toHaveBeenCalledTimes(1));

    type("cast");
    stale.resolve({ people: [hanks] });
    await screen.findByRole("button", { name: "Details for Hanky Panky" });
    expect(mocks.searchTmdbPeople).toHaveBeenLastCalledWith("cast", expect.anything());
    expect(screen.queryByRole("button", { name: "Show Tom Hanks’s movies" })).not.toBeInTheDocument();
  });

  it("keeps a bare Enter adding the first movie, and opens a person only when arrowed to", async () => {
    const { onAddMovie } = await searchWithPeople();
    const field = screen.getByRole("combobox");

    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-101");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field).toHaveAttribute("aria-activedescendant", "person-option-31");
    fireEvent.keyDown(field, { key: "Enter" });

    expect(await screen.findByText("Tom Hanks’s movies")).toBeInTheDocument();
    expect(onAddMovie).not.toHaveBeenCalled();

    // Editing the query is the way back to titles.
    type("tom hank");
    await screen.findByRole("button", { name: "Details for Hanky Panky" });
    expect(screen.queryByText("Tom Hanks’s movies")).not.toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
    expect(onAddMovie.mock.calls[0][0]).toEqual(expect.objectContaining({ title: "Hanky Panky" }));
  });

  it("keeps the arrow keys working after a person or role is clicked with a mouse", async () => {
    await searchWithPeople();
    pointerClick(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }), "mouse");
    await screen.findByRole("button", { name: "Details for Cast Away" });

    const field = screen.getByRole("combobox");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-1");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-2");

    pointerClick(screen.getByRole("tab", { name: "Directing" }), "mouse");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-3");
  });

  it("moves between roles with the keyboard without leaving the switch", async () => {
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));
    await screen.findByRole("button", { name: "Details for Cast Away" });
    const acting = screen.getByRole("tab", { name: "Acting" });
    expect(acting).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Directing" })).toHaveAttribute("tabindex", "-1");
    acting.focus();

    fireEvent.keyDown(acting, { key: "ArrowRight" });
    const directing = screen.getByRole("tab", { name: "Directing" });
    expect(directing).toHaveAttribute("aria-selected", "true");
    expect(directing).toHaveFocus();
    expect(screen.getByRole("button", { name: "Details for That Thing You Do!" })).toBeInTheDocument();

    // Space or Enter on a tab is a click with no pointer behind it; the tab
    // keeps focus so its own arrow keys go on working.
    acting.focus();
    fireEvent.click(acting, { detail: 0 });
    expect(acting).toHaveAttribute("aria-selected", "true");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acting).toHaveFocus();

    fireEvent.keyDown(acting, { key: "ArrowDown" });
    const field = screen.getByRole("combobox");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-activedescendant", "movie-option-1");
  });

  it("does not raise the on-screen keyboard when a person or role is tapped", async () => {
    await searchWithPeople();
    const field = screen.getByRole("combobox");
    pointerClick(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }), "touch");
    await screen.findByRole("button", { name: "Details for Cast Away" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(field).not.toHaveFocus();

    pointerClick(screen.getByRole("tab", { name: "Directing" }), "touch");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(field).not.toHaveFocus();
  });

  it("opens a person on the role they are known for, with a switch only for both roles", async () => {
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));

    expect(await screen.findByRole("button", { name: "Details for Cast Away" })).toBeInTheDocument();
    expect(mocks.getTmdbPersonMovies).toHaveBeenCalledWith(31);
    expect(screen.getByText(/as Chuck Noland/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details for Hanky Panky" })).not.toBeInTheDocument();

    const acting = screen.getByRole("tab", { name: "Acting" });
    const directing = screen.getByRole("tab", { name: "Directing" });
    expect(acting).toHaveAttribute("aria-selected", "true");
    expect(directing).toHaveAttribute("aria-selected", "false");

    fireEvent.click(directing);
    expect(screen.getByRole("button", { name: "Details for That Thing You Do!" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details for Cast Away" })).not.toBeInTheDocument();
    expect(directing).toHaveAttribute("aria-selected", "true");
  });

  it("shows no role switch for someone with credits in one role, even if known for the other", async () => {
    mocks.searchTmdbPeople.mockResolvedValue({ people: [{ ...hanks, knownForDepartment: "Directing" }] });
    mocks.getTmdbPersonMovies.mockResolvedValue({ acting: credits.acting, directing: [] });
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));

    expect(await screen.findByRole("button", { name: "Details for Cast Away" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("stays on the person's movies after an add, so several can be added", async () => {
    const { onAddMovie } = await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Cast Away" }));

    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
    expect(onAddMovie.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 1, title: "Cast Away" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Big" })).not.toBeDisabled());
    expect(screen.getByText("Tom Hanks’s movies")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("tom han");

    fireEvent.click(screen.getByRole("button", { name: "Add Big" }));
    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(2));
  });

  it("returns from Details to the person, and names where Back goes", async () => {
    await searchWithPeople({ props: { inlineDetails: true } });
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));
    fireEvent.click(await screen.findByRole("button", { name: "Details for Cast Away" }));

    const back = await screen.findByRole("button", { name: "Back to Tom Hanks’s movies" });
    fireEvent.click(back);
    expect(await screen.findByRole("button", { name: "Details for Cast Away" })).toBeInTheDocument();
    expect(screen.getByText("Tom Hanks’s movies")).toBeInTheDocument();
  });

  it("reveals a long filmography in batches without another request", async () => {
    const acting = Array.from({ length: 25 }, (_, index) => ({ id: 500 + index, title: `Film ${index + 1}` }));
    mocks.getTmdbPersonMovies.mockResolvedValue({ acting, directing: [] });
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));

    await screen.findByRole("button", { name: "Details for Film 20" });
    expect(screen.queryByRole("button", { name: "Details for Film 21" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more movies" }));
    expect(screen.getByRole("button", { name: "Details for Film 25" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more movies" })).not.toBeInTheDocument();
    expect(mocks.getTmdbPersonMovies).toHaveBeenCalledTimes(1);
  });

  it("says when a person's movies could not load and offers to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getTmdbPersonMovies.mockRejectedValueOnce(new Error("Failed to fetch TMDB credits"));
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));

    expect(await screen.findByText("Couldn't load Tom Hanks’s movies")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Details for Cast Away" })).toBeInTheDocument();
    console.error.mockRestore();
  });

  it("still offers a custom slip when a name matches people and no titles", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({ page: 1, totalPages: 0, totalResults: 0, results: [] });
    const onAddMovie = vi.fn(async () => ({ ok: true }));
    render(<MovieSearch onAddMovie={onAddMovie} />);
    type("tom han");

    await screen.findByRole("button", { name: "Show Tom Hanks’s movies" });
    expect(screen.queryByText(/no movie or person matches/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Add "tom han"' }));
    await waitFor(() => expect(onAddMovie).toHaveBeenCalledTimes(1));
    expect(onAddMovie.mock.calls[0][0]).toEqual(expect.objectContaining({ title: "tom han", isCustomEntry: true }));
  });

  it("never offers a custom slip from a person's movies", async () => {
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));
    await screen.findByRole("button", { name: "Details for Cast Away" });

    expect(screen.queryByRole("button", { name: 'Add "tom han"' })).not.toBeInTheDocument();
  });

  it("leaves the person when the query is edited", async () => {
    await searchWithPeople();
    fireEvent.click(screen.getByRole("button", { name: "Show Tom Hanks’s movies" }));
    await screen.findByRole("button", { name: "Details for Cast Away" });

    type("cast");
    expect(screen.queryByText("Tom Hanks’s movies")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show Tom Hanks’s movies" })).not.toBeInTheDocument();
  });

  it("shows no one and today's page when the people lookup fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.searchTmdbPeople.mockRejectedValue(new Error("Failed to fetch TMDB people"));
    render(<MovieSearch onAddMovie={vi.fn()} />);
    type("tom han");

    await screen.findByRole("button", { name: "Details for Hanky Panky" });
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(screen.queryByRole("row", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    console.warn.mockRestore();
  });
});
