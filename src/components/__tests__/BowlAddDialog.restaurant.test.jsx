import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn() }));
const bowls = [
  { id: "eats", name: "Date Night Eats", kind: "restaurants", role: "Owner" },
  { id: "films", name: "Friday Films", kind: "movies", role: "Owner" },
];
vi.mock("../../hooks/useUserBowls", () => ({ default: () => ({ userId: "user", bowls, defaultBowlId: "eats", refresh: mocks.refresh }) }));
vi.mock("../../hooks/useUserStreamingServices", () => ({ default: () => ({ streamingServices: [] }) }));
vi.mock("../../lib/addBowlMovie", () => ({ bowlMovieService: { add: mocks.add }, addResult: (ok, code, message) => ({ ok, code, message }), getSubmissionKey: ({ accountId, bowlId, movie }) => `${accountId}:${bowlId}:${String(movie?.title || "").trim().toLowerCase()}`, isUnsettledAddCode: () => false }));
vi.mock("../../lib/bowlMovieActions", () => ({ bowlMovieActions: { updateNote: vi.fn(), remove: vi.fn() } }));
vi.mock("../../lib/tmdbApi", () => ({ searchTmdbPeople: vi.fn(async () => ({ people: [] })), suggestTmdbQuery: vi.fn(async () => null), searchTmdbMovies: vi.fn(async () => ({ results: [] })), getTmdbMovieDetails: vi.fn() }));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: vi.fn() }));
vi.mock("../../lib/searchMarkSources", () => ({ fetchSearchMarkSources: vi.fn(async () => ({ slips: [], watchEvents: [] })) }));

import useBowlAdd, { BowlAddProvider } from "../../hooks/useBowlAdd";
import BowlAddDialog from "../BowlAddDialog";

function Harness() {
  const add = useBowlAdd();
  return <><div className="app-shell"><button onClick={add.openGlobalAdd}>Open add</button></div>
    {(add.open || add.actionsPending) && <BowlAddDialog key={add.id} />}</>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ bowls, defaultBowlId: "eats" });
  mocks.add.mockImplementation(async (op) => ({ ok: true, movie: { ...op.movie, id: op.submissionId } }));
});
afterEach(cleanup);

describe("adding to a restaurant bowl", () => {
  it("adds by name with a cuisine, and never looks the name up on TMDB", async () => {
    render(<MemoryRouter><BowlAddProvider><Harness /></BowlAddProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open add" }));
    expect(await screen.findByRole("heading", { name: "Add a restaurant" })).toHaveClass("sr-only");
    expect(screen.queryByPlaceholderText("Movie, actor or director")).not.toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Add to Date Night Eats" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Restaurant"), { target: { value: "  La Rana Bistro " } });
    fireEvent.click(screen.getByRole("radio", { name: "Mediterranean" }));
    fireEvent.change(screen.getByLabelText(/Why it's in the bowl/), { target: { value: "Anniversary spot" } });
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
    expect(mocks.add.mock.calls[0][0]).toMatchObject({
      bowlId: "eats",
      movie: { title: "La Rana Bistro", cuisine: "Mediterranean", note: "Anniversary spot", isCustomEntry: true },
    });
    // A clean slip for the next place.
    await waitFor(() => expect(screen.getByLabelText("Restaurant")).toHaveValue(""));
    expect(screen.getByRole("radio", { name: "Mediterranean" })).toHaveAttribute("aria-checked", "false");
  });

  it("lets a cuisine be unpicked, since it is optional", async () => {
    render(<MemoryRouter><BowlAddProvider><Harness /></BowlAddProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open add" }));
    const pizza = await screen.findByRole("radio", { name: "Pizza" });
    fireEvent.click(pizza);
    expect(pizza).toHaveAttribute("aria-checked", "true");
    fireEvent.click(pizza);
    expect(pizza).toHaveAttribute("aria-checked", "false");
  });

  it("goes back to movie search when a movie bowl is chosen", async () => {
    render(<MemoryRouter><BowlAddProvider><Harness /></BowlAddProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open add" }));
    fireEvent.click(await screen.findByRole("button", { name: /Choose bowl/ }));
    fireEvent.click(screen.getByRole("button", { name: /Friday Films/ }));
    expect(await screen.findByPlaceholderText("Movie, actor or director")).toBeInTheDocument();
    expect(screen.queryByLabelText("Restaurant")).not.toBeInTheDocument();
  });
});
