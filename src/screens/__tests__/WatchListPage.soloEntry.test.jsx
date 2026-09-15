import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const state = {
    watchedRows: [],
    matches: [],
  };

  return {
    state,
    findOwnUndrawnBowlCopies: vi.fn(async () => state.matches),
    removeOwnBowlCopies: vi.fn(async () => ({ ok: true, message: "", userId: "user-1" })),
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
  findOwnUndrawnBowlCopies: mocks.findOwnUndrawnBowlCopies,
  removeOwnBowlCopies: mocks.removeOwnBowlCopies,
}));
vi.mock("../../components/AddMovieModal", () => ({
  default: ({ onDetailPrimaryAction, movie }) => (
    <button type="button" onClick={() => onDetailPrimaryAction(movie)}>
      Edit history
    </button>
  ),
}));

import WatchListPage from "../WatchListPage";

const SOLO_ENTRY = {
  id: "event-1",
  source_kind: "solo_draw",
  source_bowl_movie_id: "copy-1",
  bowl_name: "First Bowl",
  tmdb_id: -42,
  title: "Custom Solo Pick",
  watched_on: "2026-09-15",
  created_at: "2026-09-15T18:00:00.000Z",
  genres: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchListPage />
    </MemoryRouter>
  );
}

async function openSoloEntryEditor() {
  renderPage();
  await waitFor(() => expect(screen.getByText("Custom Solo Pick")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /Custom Solo Pick/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit history" }));
}

beforeEach(() => {
  mocks.state.watchedRows = [SOLO_ENTRY];
  mocks.state.matches = [{ id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl" }];
  mocks.findOwnUndrawnBowlCopies.mockClear();
  mocks.removeOwnBowlCopies.mockClear();
});

afterEach(cleanup);

describe("WatchListPage solo entries", () => {
  it("marks a solo draw apart from a group draw", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Solo")).toBeInTheDocument());
  });

  // The offer belongs here rather than at the reveal, and it has to find the
  // drawn row: a custom title's negative tmdb_id matches nothing.
  it("offers the bowl copies of a custom title by its source row", async () => {
    await openSoloEntryEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Remove from my bowls…" }));

    await waitFor(() =>
      expect(mocks.findOwnUndrawnBowlCopies).toHaveBeenCalledWith({
        tmdbId: -42,
        bowlMovieId: "copy-1",
      })
    );
    expect(
      await screen.findByRole("button", { name: "Remove from First Bowl" })
    ).toBeInTheDocument();
  });

  it("removes the chosen copies", async () => {
    await openSoloEntryEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Remove from my bowls…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove from First Bowl" }));

    await waitFor(() => expect(mocks.removeOwnBowlCopies).toHaveBeenCalledWith(["copy-1"]));
  });

  it("says so when the copies are already gone", async () => {
    mocks.state.matches = [];
    await openSoloEntryEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Remove from my bowls…" }));

    expect(
      await screen.findByText("This movie is no longer in any of your bowls.")
    ).toBeInTheDocument();
  });

  it("does not offer bowl removal for a manual entry", async () => {
    mocks.state.watchedRows = [
      { ...SOLO_ENTRY, source_kind: "manual", source_bowl_movie_id: null, tmdb_id: 42 },
    ];
    await openSoloEntryEditor();

    expect(screen.queryByRole("button", { name: "Remove from my bowls…" })).toBeNull();
  });
});
