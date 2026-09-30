import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn(), sources: vi.fn(), search: vi.fn() }));
const bowls = [{ id: "a", name: "Friday Night" }, { id: "b", name: "Late Shift" }];
vi.mock("../../hooks/useUserBowls", () => ({ default: () => ({ userId: "user", bowls, defaultBowlId: "a", refresh: mocks.refresh }) }));
vi.mock("../../hooks/useUserStreamingServices", () => ({ default: () => ({ streamingServices: [] }) }));
vi.mock("../../lib/addBowlMovie", () => ({ bowlMovieService: { add: mocks.add }, addResult: (ok, code, message) => ({ ok, code, message }), getSubmissionKey: ({ accountId, bowlId, movie }) => `${accountId}:${bowlId}:${movie?.tmdb_id ?? movie?.id}`, isUnsettledAddCode: () => false }));
vi.mock("../../lib/bowlMovieActions", () => ({ bowlMovieActions: { updateNote: vi.fn(), remove: vi.fn() } }));
vi.mock("../../lib/tmdbApi", () => ({ searchTmdbPeople: vi.fn(async () => ({ people: [] })), suggestTmdbQuery: vi.fn(async () => null), searchTmdbMovies: mocks.search, getTmdbMovieDetails: vi.fn(async () => ({ runtime: 100, genres: [], trailer: null })) }));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: vi.fn(async () => ({ providers: [], providerLogos: {}, availability: {}, status: "ready" })) }));
vi.mock("../../lib/searchMarkSources", () => ({ fetchSearchMarkSources: mocks.sources }));

import useBowlAdd, { BowlAddProvider } from "../../hooks/useBowlAdd";
import BowlAddDialog from "../BowlAddDialog";

function Harness() {
  const add = useBowlAdd();
  return <><button onClick={add.openGlobalAdd}>Open add</button>{add.open && <BowlAddDialog key={add.id} />}</>;
}

const results = [
  { id: 10, title: "Paris, Texas", release_date: "1984-05-19" },
  { id: 20, title: "The Apartment", release_date: "1960-06-15" },
];

async function openAndSearch() {
  render(<MemoryRouter><BowlAddProvider><Harness /></BowlAddProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Open add" }));
  fireEvent.change(await screen.findByPlaceholderText("Movie, actor or director"), { target: { value: "paris" } });
  await screen.findByRole("button", { name: "Details for Paris, Texas" });
}
const row = (title) => screen.getByRole("button", { name: `Details for ${title}` }).closest("[role='row']");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ bowls, defaultBowlId: "a" });
  mocks.search.mockResolvedValue({ page: 1, totalPages: 1, totalResults: results.length, results });
  mocks.add.mockImplementation(async (op) => ({ ok: true, movie: { ...op.movie, id: "slip", tmdb_id: op.movie.id } }));
  mocks.sources.mockResolvedValue({
    slips: [{ bowl_id: "a", tmdb_id: 10, added_by: "casey", starter_pack: false }],
    watchEvents: [],
  });
});
afterEach(cleanup);

describe("add dialog search marks", () => {
  it("reads your bowls and history for the account that opened it", async () => {
    await openAndSearch();

    expect(mocks.sources).toHaveBeenCalledWith({ userId: "user", bowlIds: ["a", "b"] });
    expect(await within(row("Paris, Texas")).findByRole("img", { name: "Paris, Texas is already in Friday Night" })).toBeInTheDocument();
  });

  it("moves the marks with the destination bowl", async () => {
    await openAndSearch();
    await within(row("Paris, Texas")).findByRole("img", { name: /already in Friday Night/ });

    fireEvent.click(screen.getByRole("button", { name: "Choose bowl. Current bowl: Friday Night" }));
    fireEvent.click(screen.getByRole("button", { name: "Late Shift" }));

    await waitFor(() => expect(within(row("Paris, Texas")).getByRole("button", { name: "Add Paris, Texas" })).toBeInTheDocument());
    expect(within(row("Paris, Texas")).getByText("Friday Night")).toBeInTheDocument();
  });

  it("marks a title as in the bowl once you have added it", async () => {
    await openAndSearch();

    fireEvent.click(within(row("The Apartment")).getByRole("button", { name: "Add The Apartment" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), { target: { value: "apartment" } });

    expect(await screen.findByRole("img", { name: "The Apartment is already in Friday Night" })).toBeInTheDocument();
  });

  it("keeps every + when the marks cannot be read, and the add still decides", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sources.mockRejectedValue(new Error("offline"));
    await openAndSearch();

    await waitFor(() => expect(console.error).toHaveBeenCalledWith("[useSearchMarks] Failed to load search marks", expect.any(Error)));
    expect(within(row("Paris, Texas")).getByRole("button", { name: "Add Paris, Texas" })).toBeInTheDocument();
  });
});
