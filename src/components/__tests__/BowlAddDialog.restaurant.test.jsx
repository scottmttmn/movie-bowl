import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn(), searchPlaces: vi.fn() }));
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
vi.mock("../../lib/placesSearch", () => ({ searchPlaces: mocks.searchPlaces, createPlacesSessionToken: () => "session-token-1" }));
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
  mocks.searchPlaces.mockResolvedValue({ available: true, results: [] });
});

function openAdd() {
  render(<MemoryRouter><BowlAddProvider><Harness /></BowlAddProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Open add" }));
}
afterEach(cleanup);

describe("adding to a restaurant bowl", () => {
  it("adds a place from Google search on a slip prefilled from it, keeping only its id", async () => {
    mocks.searchPlaces.mockResolvedValue({ available: true, results: [
      { placeId: "ChIJlarana", name: "La Rana Bistro", address: "Water St, Decorah", cuisine: "Mediterranean" },
      { placeId: "ChIJmabes", name: "Mabe's Pizza", address: "W Water St, Decorah", cuisine: "Pizza" },
    ] });
    openAdd();
    expect(await screen.findByRole("heading", { name: "Add a restaurant" })).toHaveClass("sr-only");
    expect(screen.queryByPlaceholderText("Movie, actor or director")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search for a restaurant"), { target: { value: "La Ra" } });
    expect(await screen.findByText("Mediterranean · Water St, Decorah")).toBeInTheDocument();
    expect(mocks.searchPlaces).toHaveBeenLastCalledWith(expect.objectContaining({ query: "La Ra", sessionToken: "session-token-1" }));
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add La Rana Bistro" }));

    expect(screen.getByLabelText("Restaurant")).toHaveValue("La Rana Bistro");
    expect(screen.getByRole("radio", { name: "Mediterranean" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Restaurant"), { target: { value: "La Rana" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Date Night Eats" }));

    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
    expect(mocks.add.mock.calls[0][0].movie).toMatchObject({
      title: "La Rana", cuisine: "Mediterranean", place_id: "ChIJlarana", isCustomEntry: true,
    });
    // Back on an empty search for the next place.
    expect(await screen.findByLabelText("Search for a restaurant")).toHaveValue("");
  });

  it("adds a place Google does not list by name", async () => {
    openAdd();
    fireEvent.change(await screen.findByLabelText("Search for a restaurant"), { target: { value: "Grandma's" } });
    await waitFor(() => expect(mocks.searchPlaces).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Not listed? Add “Grandma's” by name" }));
    expect(screen.getByLabelText("Restaurant")).toHaveValue("Grandma's");
    fireEvent.click(screen.getByRole("button", { name: "Add to Date Night Eats" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
    expect(mocks.add.mock.calls[0][0].movie).not.toHaveProperty("place_id");
  });

  it("adds by name with a cuisine when there is no search, and never looks the name up on TMDB", async () => {
    mocks.searchPlaces.mockResolvedValue({ available: false, results: [] });
    openAdd();
    fireEvent.change(await screen.findByLabelText("Search for a restaurant"), { target: { value: "  La Rana Bistro " } });
    // The box being typed in becomes the slip's name, still focused.
    const name = await screen.findByLabelText("Restaurant");
    expect(name).toHaveValue("La Rana Bistro");
    expect(name).toHaveFocus();
    const submit = screen.getByRole("button", { name: "Add to Date Night Eats" });
    fireEvent.change(name, { target: { value: "" } });
    expect(submit).toBeDisabled();
    fireEvent.change(name, { target: { value: "  La Rana Bistro " } });
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
    openAdd();
    fireEvent.change(await screen.findByLabelText("Search for a restaurant"), { target: { value: "Mabe" } });
    fireEvent.click(screen.getByRole("button", { name: "Not listed? Add “Mabe” by name" }));
    const pizza = await screen.findByRole("radio", { name: "Pizza" });
    fireEvent.click(pizza);
    expect(pizza).toHaveAttribute("aria-checked", "true");
    fireEvent.click(pizza);
    expect(pizza).toHaveAttribute("aria-checked", "false");
  });

  it("goes back to movie search when a movie bowl is chosen", async () => {
    openAdd();
    fireEvent.click(await screen.findByRole("button", { name: /Choose bowl/ }));
    fireEvent.click(screen.getByRole("button", { name: /Friday Films/ }));
    expect(await screen.findByPlaceholderText("Movie, actor or director")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search for a restaurant")).not.toBeInTheDocument();
  });
});
