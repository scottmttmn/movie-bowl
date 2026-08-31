import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ add: vi.fn(), updateNote: vi.fn(), remove: vi.fn(), refresh: vi.fn() }));
const bowls = [{ id: "a", name: "Friday Night" }, { id: "b", name: "Family Movies" }];
vi.mock("../../hooks/useUserBowls", () => ({ default: () => ({ userId: "user", bowls, defaultBowlId: "a", refresh: mocks.refresh }) }));
vi.mock("../../hooks/useUserStreamingServices", () => ({ default: () => ({ streamingServices: [] }) }));
vi.mock("../../lib/addBowlMovie", () => ({ bowlMovieService: { add: mocks.add }, addResult: (ok, code, message) => ({ ok, code, message }) }));
vi.mock("../../lib/bowlMovieActions", () => ({ bowlMovieActions: { updateNote: mocks.updateNote, remove: mocks.remove } }));
vi.mock("../../lib/tmdbApi", () => ({ searchTmdbMovies: vi.fn(async () => ({ results: [] })), getTmdbMovieDetails: vi.fn() }));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: vi.fn() }));

import useBowlAdd, { BowlAddProvider } from "../../hooks/useBowlAdd";
import BowlAddDialog from "../BowlAddDialog";

function Harness() {
  const add = useBowlAdd();
  return <><button onClick={add.openGlobalAdd}>Open add</button>
    {(add.open || add.actionsPending) && <BowlAddDialog key={add.id} />}</>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ bowls, defaultBowlId: "a" });
  mocks.add.mockImplementation(async (op) => ({ ok: true, movie: { ...op.movie, id: op.submissionId, note: null } }));
  mocks.updateNote.mockImplementation(async (op) => ({ ok: true, movie: { id: op.movieId, note: op.note.trim() || null } }));
  mocks.remove.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
async function open() {
  render(<MemoryRouter><BowlAddProvider><Harness /></BowlAddProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Open add" }));
  await screen.findByPlaceholderText("Search movies...");
}
async function addMovie(title) {
  fireEvent.change(screen.getByPlaceholderText("Search movies..."), { target: { value: title } });
  fireEvent.click(await screen.findByRole("button", { name: `Add "${title}"`, exact: true }));
  await screen.findByRole("button", { name: `Add comment for ${title}` });
  await waitFor(() => expect(screen.getByPlaceholderText("Search movies...")).toHaveValue(""));
}

describe("add dialog session list", () => {
  it("adds first, then saves, retries, edits, and clears a comment on that specific movie", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /Comment \(optional\)/ })).not.toBeInTheDocument();
    await addMovie("First movie");
    expect(mocks.add.mock.calls[0][0].movie.note).toBeUndefined();
    expect(screen.queryByRole("textbox", { name: /Comment for/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add comment for First movie" }));
    const input = screen.getByRole("textbox", { name: "Comment for First movie" });
    expect(input).toHaveFocus(); expect(input).toHaveAttribute("maxlength", "500");
    fireEvent.change(input, { target: { value: "  Recommended at dinner  " } });
    mocks.updateNote.mockResolvedValueOnce({ ok: false, code: "update_failed", message: "Please retry this save" });
    fireEvent.click(screen.getByRole("button", { name: "Save comment", exact: true }));
    await screen.findByText("Please retry this save");
    expect(input).toHaveValue("  Recommended at dinner  ");
    fireEvent.click(screen.getByRole("button", { name: "Save comment", exact: true }));
    await screen.findByText("Recommended at dinner");
    expect(screen.getByRole("button", { name: "Edit comment for First movie" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment for First movie" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment for First movie" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save comment", exact: true }));
    await screen.findByRole("button", { name: "Add comment for First movie" });
    expect(screen.queryByText("Recommended at dinner")).not.toBeInTheDocument();
  });

  it("keeps each row attached to its bowl and requires confirmation before removal", async () => {
    await open(); await addMovie("First movie");
    fireEvent.click(screen.getByRole("button", { name: /Choose bowl/ }));
    fireEvent.click(screen.getByRole("button", { name: "Family Movies", exact: true }));
    await addMovie("Second movie");
    const list = screen.getByRole("list", { name: "Movies added this session" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Second movie"); expect(rows[0]).toHaveTextContent("Family Movies");
    expect(rows[1]).toHaveTextContent("First movie"); expect(rows[1]).toHaveTextContent("Friday Night");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Remove First movie from Friday Night" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Remove First movie from Friday Night" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from bowl", exact: true }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ bowlId: "a", accountId: "user" }));
    expect(screen.getByPlaceholderText("Search movies...")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close add movie" }));
    fireEvent.click(screen.getByRole("button", { name: "Open add" }));
    await screen.findByPlaceholderText("Search movies...");
    expect(screen.queryByRole("list", { name: "Movies added this session" })).not.toBeInTheDocument();
  });

  it("cancels the inline editor with Escape before closing the dialog", async () => {
    await open(); await addMovie("First movie");
    fireEvent.click(screen.getByRole("button", { name: "Add comment for First movie" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment for First movie" }), { target: { value: "Discard me" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Add a movie" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add comment for First movie" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Add comment for First movie" }));
    expect(screen.getByRole("textbox", { name: "Comment for First movie" })).toHaveValue("");
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });

  it("keeps a pending save across dismissal and shows stale-movie errors without discarding the draft", async () => {
    await open(); await addMovie("First movie");
    fireEvent.click(screen.getByRole("button", { name: "Add comment for First movie" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment for First movie" }), { target: { value: "Keep me" } });
    let finish;
    mocks.updateNote.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Save comment", exact: true }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Close add movie" }));
    fireEvent.click(screen.getByRole("button", { name: "Open add" }));
    expect(screen.getByRole("textbox", { name: "Comment for First movie" })).toHaveValue("Keep me");
    await act(async () => { finish({ ok: false, code: "movie_unavailable", message: "Movie was drawn" }); });
    expect(screen.getByRole("alert")).toHaveTextContent("Movie was drawn");
    expect(screen.getByRole("textbox", { name: "Comment for First movie" })).toHaveValue("Keep me");
    expect(screen.getByRole("button", { name: "Save comment", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove First movie from Friday Night" })).toBeDisabled();
  });
});
