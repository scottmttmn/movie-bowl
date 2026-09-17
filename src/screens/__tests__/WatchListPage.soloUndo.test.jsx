import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const state = {
    watchedRows: [],
    removedCopies: [],
    undoResult: { ok: true, code: null, message: "", restored: 1, skipped: [] },
  };

  return {
    state,
    undoSoloDraw: vi.fn(async () => state.undoResult),
    fetchSoloDrawRemovedCopies: vi.fn(async () => state.removedCopies),
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: "user-1" } } },
          error: null,
        })),
      },
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (resolve, reject) =>
            Promise.resolve({ data: state.watchedRows, error: null }).then(resolve, reject),
        };
        return query;
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/tmdbApi", () => ({ getTmdbMovieDetails: vi.fn(async () => ({})) }));
vi.mock("../../lib/ownBowlCopies", () => ({
  findOwnUndrawnBowlCopies: vi.fn(async () => []),
  removeOwnBowlCopies: vi.fn(async () => ({ ok: true, message: "", userId: "user-1" })),
}));
vi.mock("../../lib/soloDraw", () => ({
  undoSoloDraw: mocks.undoSoloDraw,
  fetchSoloDrawRemovedCopies: mocks.fetchSoloDrawRemovedCopies,
  describeSkippedRestores: (skipped) =>
    (skipped || []).length === 0 ? "" : `${skipped.length} copies could not go back.`,
}));
vi.mock("../../components/AddMovieModal", () => ({
  default: ({ onDetailPrimaryAction, movie }) => (
    <button type="button" onClick={() => onDetailPrimaryAction(movie)}>
      Edit history
    </button>
  ),
}));

import WatchListPage from "../WatchListPage";

const HOUR_MS = 60 * 60 * 1000;

function soloEntry(overrides = {}) {
  return {
    id: "event-1",
    source_kind: "solo_draw",
    source_bowl_movie_id: "copy-1",
    bowl_name: "First Bowl",
    tmdb_id: 4242,
    title: "Solo Pick",
    watched_on: "2026-09-15",
    created_at: new Date(Date.now() - HOUR_MS).toISOString(),
    genres: [],
    ...overrides,
  };
}

async function openEditor() {
  render(
    <MemoryRouter>
      <WatchListPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText("Solo Pick")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Solo Pick/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit history" }));
}

beforeEach(() => {
  mocks.state.watchedRows = [soloEntry()];
  mocks.state.removedCopies = [
    { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Solo Pick" },
  ];
  mocks.state.undoResult = { ok: true, code: null, message: "", restored: 1, skipped: [] };
  mocks.undoSoloDraw.mockClear();
  mocks.fetchSoloDrawRemovedCopies.mockClear();
  mocks.supabase.rpc.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(cleanup);

describe("WatchListPage solo undo", () => {
  // Inside the window the two actions are no longer the same act: only undo
  // puts back what the draw removed, and the server refuses the plain delete.
  it("undoes rather than deletes an entry that is still inside the window", async () => {
    await openEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));

    await waitFor(() => expect(mocks.undoSoloDraw).toHaveBeenCalledWith("event-1"));
    expect(mocks.supabase.rpc).not.toHaveBeenCalledWith(
      "delete_user_watch_event",
      expect.anything()
    );
  });

  it("promises the copies back before undoing", async () => {
    mocks.state.removedCopies = [
      { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Solo Pick" },
      { id: "copy-2", bowlId: "bowl-2", bowlName: "Second Bowl", title: "Solo Pick" },
    ];
    await openEditor();

    await waitFor(() =>
      expect(mocks.fetchSoloDrawRemovedCopies).toHaveBeenCalledWith("event-1")
    );
    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));

    expect(
      await screen.findByText("Undo this draw? The 2 copies it removed go back to your bowls.")
    ).toBeInTheDocument();
  });

  it("asks only about the entry when the draw removed nothing", async () => {
    mocks.state.removedCopies = [];
    await openEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));

    expect(await screen.findByText("Remove this watch history entry?")).toBeInTheDocument();
  });

  // A copy that could not go back leaves a bowl short with nothing else on
  // screen to explain it.
  it("says which copies could not go back", async () => {
    mocks.state.undoResult = {
      ok: true,
      code: null,
      message: "",
      restored: 1,
      skipped: [{ bowl_name: "Second Bowl", reason: "bowl_gone" }],
    };
    await openEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));

    expect(await screen.findByText("1 copies could not go back.")).toBeInTheDocument();
  });

  it("keeps the editor open and says why when undo is refused", async () => {
    mocks.state.undoResult = {
      ok: false,
      code: "P0001",
      message: "This draw can no longer be undone.",
      restored: 0,
      skipped: [],
    };
    await openEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo draw" }));

    expect(
      await screen.findByText("This draw can no longer be undone.")
    ).toBeInTheDocument();
  });

  it("deletes through the ordinary path once the window has passed", async () => {
    mocks.state.watchedRows = [
      soloEntry({ created_at: new Date(Date.now() - 3 * HOUR_MS).toISOString() }),
    ];
    await openEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Remove from history" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove entry" }));

    await waitFor(() =>
      expect(mocks.supabase.rpc).toHaveBeenCalledWith("delete_user_watch_event", {
        p_event_id: "event-1",
      })
    );
    expect(mocks.undoSoloDraw).not.toHaveBeenCalled();
    expect(mocks.fetchSoloDrawRemovedCopies).not.toHaveBeenCalled();
  });
});
