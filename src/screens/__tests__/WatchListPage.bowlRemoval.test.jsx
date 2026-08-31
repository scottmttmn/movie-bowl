import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    sessionUser: { id: "user-1", email: "owner@example.com" },
    watchedRows: [],
    bowlMovieRows: [],
    bowlMovieLookupError: null,
    bowlMovieDeleteError: null,
    bowlRows: [],
    bowlsLookupError: null,
    bowlMovieCalls: [],
    savedEntry: {
      id: 303,
      tmdb_id: 303,
      title: "Manual Favorite",
      watched_on: "2026-05-01",
      release_date: "1999-01-01",
      genres: ["Drama"],
    },
  };

  function createQuery(resolve) {
    const record = { deleted: false, filters: [] };
    const query = {
      select: vi.fn(() => query),
      delete: vi.fn(() => {
        record.deleted = true;
        return query;
      }),
      eq: vi.fn((column, value) => {
        record.filters.push([column, value]);
        return query;
      }),
      in: vi.fn((column, value) => {
        record.filters.push([column, value]);
        return query;
      }),
      is: vi.fn((column, value) => {
        record.filters.push([column, value]);
        return query;
      }),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolve(record)).then(onFulfilled, onRejected);
      },
    };

    return { query, record };
  }

  return {
    state,
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: state.sessionUser ? { user: state.sessionUser } : null },
          error: null,
        })),
      },
      from: vi.fn((table) => {
        if (table === "user_watch_events") {
          return createQuery(() => ({ data: state.watchedRows, error: null })).query;
        }

        if (table === "bowl_movies") {
          const { query, record } = createQuery((call) =>
            call.deleted
              ? { data: null, error: state.bowlMovieDeleteError }
              : { data: state.bowlMovieRows, error: state.bowlMovieLookupError }
          );
          state.bowlMovieCalls.push(record);
          return query;
        }

        if (table === "bowls") {
          return createQuery(() => ({ data: state.bowlRows, error: state.bowlsLookupError }))
            .query;
        }

        return createQuery(() => ({ data: [], error: null })).query;
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
  };
});

vi.mock("../../lib/supabase", () => ({
  supabase: mocks.supabase,
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: vi.fn(async () => ({})),
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
}));

vi.mock("../../components/AddMovieModal", () => ({
  default: () => <div data-testid="movie-detail-modal" />,
}));

vi.mock("../../components/WatchHistoryEntryModal", () => ({
  default: ({ onSave }) => (
    <div data-testid="watch-history-editor">
      <button type="button" onClick={() => onSave(mocks.state.savedEntry)}>
        Save history entry
      </button>
    </div>
  ),
}));

import WatchListPage from "../WatchListPage";

async function saveManualEntry() {
  render(<WatchListPage />);

  await waitFor(() => {
    expect(screen.getByText("Watch History")).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "Log a watched movie" }));
  fireEvent.click(screen.getByRole("button", { name: "Save history entry" }));
}

function getDeleteCall() {
  return mocks.state.bowlMovieCalls.find((call) => call.deleted) || null;
}

describe("WatchListPage bowl removal prompt", () => {
  beforeEach(() => {
    mocks.state.sessionUser = { id: "user-1", email: "owner@example.com" };
    mocks.state.watchedRows = [];
    mocks.state.bowlMovieRows = [];
    mocks.state.bowlMovieLookupError = null;
    mocks.state.bowlMovieDeleteError = null;
    mocks.state.bowlRows = [];
    mocks.state.bowlsLookupError = null;
    mocks.state.bowlMovieCalls = [];
    mocks.state.savedEntry = {
      id: 303,
      tmdb_id: 303,
      title: "Manual Favorite",
      watched_on: "2026-05-01",
      release_date: "1999-01-01",
      genres: ["Drama"],
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers a single-bowl removal without a checkbox and deletes only that slip", async () => {
    mocks.state.bowlMovieRows = [{ id: "slip-1", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "Family Bowl" }];

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.getByText("Take it out of your bowls?")).toBeInTheDocument();
    });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove from Family Bowl" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove from Family Bowl" }));

    await waitFor(() => {
      expect(screen.queryByText("Take it out of your bowls?")).not.toBeInTheDocument();
    });

    const deleteCall = getDeleteCall();
    expect(deleteCall).not.toBeNull();
    expect(deleteCall.filters).toEqual([
      ["id", ["slip-1"]],
      ["added_by", "user-1"],
      ["drawn_at", null],
    ]);
  });

  it("labels each bowl with the action and removes only the ticked ones", async () => {
    mocks.state.bowlMovieRows = [
      { id: "slip-1", bowl_id: "bowl-1" },
      { id: "slip-2", bowl_id: "bowl-2" },
    ];
    mocks.state.bowlRows = [
      { id: "bowl-1", name: "Family Bowl" },
      { id: "bowl-2", name: "Friday Crew" },
    ];

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.getByText("Take it out of your bowls?")).toBeInTheDocument();
    });

    const familyCheckbox = screen.getByRole("checkbox", { name: "Remove from Family Bowl" });
    const fridayCheckbox = screen.getByRole("checkbox", { name: "Remove from Friday Crew" });

    expect(familyCheckbox).toBeChecked();
    expect(fridayCheckbox).toBeChecked();
    expect(screen.getByRole("button", { name: "Remove from 2 bowls" })).toBeEnabled();

    fireEvent.click(fridayCheckbox);

    expect(screen.getByRole("button", { name: "Remove from 1 bowl" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove from 1 bowl" }));

    await waitFor(() => {
      expect(screen.queryByText("Take it out of your bowls?")).not.toBeInTheDocument();
    });

    expect(getDeleteCall().filters).toEqual([
      ["id", ["slip-1"]],
      ["added_by", "user-1"],
      ["drawn_at", null],
    ]);
  });

  it("keeps the movie in every bowl when the prompt is declined", async () => {
    mocks.state.bowlMovieRows = [{ id: "slip-1", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "Family Bowl" }];

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.getByText("Take it out of your bowls?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Leave it in the bowl" }));

    await waitFor(() => {
      expect(screen.queryByText("Take it out of your bowls?")).not.toBeInTheDocument();
    });

    expect(getDeleteCall()).toBeNull();
  });

  it("looks up only the signed-in user's undrawn slips", async () => {
    mocks.state.bowlMovieRows = [{ id: "slip-1", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "Family Bowl" }];

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.getByText("Take it out of your bowls?")).toBeInTheDocument();
    });

    expect(mocks.state.bowlMovieCalls[0].filters).toEqual([
      ["added_by", "user-1"],
      ["tmdb_id", 303],
      ["drawn_at", null],
    ]);
  });

  it("skips the prompt for a custom title with no TMDB id", async () => {
    mocks.state.savedEntry = {
      title: "Home Movie",
      watched_on: "2026-05-01",
      genres: [],
    };
    mocks.state.bowlMovieRows = [{ id: "slip-1", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "Family Bowl" }];

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.queryByTestId("watch-history-editor")).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Take it out of your bowls?")).not.toBeInTheDocument();
    expect(mocks.state.bowlMovieCalls).toHaveLength(0);
  });

  it("skips the prompt when no bowl holds the movie", async () => {
    mocks.state.bowlMovieRows = [];

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.queryByTestId("watch-history-editor")).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Take it out of your bowls?")).not.toBeInTheDocument();
  });

  it("saves the history entry even when the bowl lookup fails", async () => {
    mocks.state.bowlMovieLookupError = { message: "lookup blew up" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.queryByTestId("watch-history-editor")).not.toBeInTheDocument();
    });

    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "create_manual_watch_event",
      expect.objectContaining({ p_title: "Manual Favorite", p_tmdb_id: 303 })
    );
    expect(screen.queryByText("Take it out of your bowls?")).not.toBeInTheDocument();
  });

  it("keeps the prompt open with an error when the removal fails", async () => {
    mocks.state.bowlMovieRows = [{ id: "slip-1", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "Family Bowl" }];
    mocks.state.bowlMovieDeleteError = { message: "delete denied" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await saveManualEntry();

    await waitFor(() => {
      expect(screen.getByText("Take it out of your bowls?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove from Family Bowl" }));

    await waitFor(() => {
      expect(
        screen.getByText("Could not remove it from your bowls. Please try again.")
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Take it out of your bowls?")).toBeInTheDocument();
  });
});
