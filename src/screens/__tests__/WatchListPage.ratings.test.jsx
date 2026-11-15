import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Thumbs on the Watch History cards: one tap rates, a failed save puts the
// thumbs back, and a failed read leaves them out rather than show a rated
// movie as unrated.
const mocks = vi.hoisted(() => {
  const state = {
    watchedRows: [],
    ratingRows: [],
    ratingsError: null,
    rateError: null,
    rpcCalls: [],
  };

  function query(result) {
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      order: vi.fn(() => q),
      range: vi.fn(() => q),
      in: vi.fn(() => q),
      is: vi.fn(() => q),
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return q;
  }

  return {
    state,
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: "user-1" } } }, error: null })),
      },
      from: vi.fn((table) => {
        if (table === "user_watch_events") return query(() => ({ data: state.watchedRows, error: null }));
        if (table === "user_movie_ratings") {
          return query(() => ({ data: state.ratingsError ? null : state.ratingRows, error: state.ratingsError }));
        }
        return query(() => ({ data: [], error: null }));
      }),
      rpc: vi.fn(async (name, params) => {
        state.rpcCalls.push({ name, params });
        if (name === "set_my_movie_rating") {
          if (state.rateError) return { data: null, error: state.rateError };
          return { data: { rating: params.p_rating }, error: null };
        }
        return { data: null, error: null };
      }),
    },
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/tmdbApi", () => ({ getTmdbMovieDetails: vi.fn(async () => null) }));

import WatchListPage from "../WatchListPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchListPage />
    </MemoryRouter>
  );
}

describe("WatchListPage thumbs", () => {
  beforeEach(() => {
    mocks.state.watchedRows = [
      { id: "entry-1", source_kind: "manual", tmdb_id: 655, title: "Paris, Texas", release_date: "1984-05-19", watched_on: "2026-11-08", created_at: "2026-11-08T22:00:00Z" },
      { id: "entry-2", source_kind: "manual", tmdb_id: 655, title: "Paris, Texas", release_date: "1984-05-19", watched_on: "2026-10-01", created_at: "2026-10-01T22:00:00Z" },
      { id: "entry-3", source_kind: "manual", tmdb_id: -4, title: "Something with Adam Sandler", watched_on: "2026-11-01", created_at: "2026-11-01T22:00:00Z" },
    ];
    mocks.state.ratingRows = [{ tmdb_id: 655, watch_event_id: null, rating: 1 }];
    mocks.state.ratingsError = null;
    mocks.state.rateError = null;
    mocks.state.rpcCalls = [];
  });

  afterEach(() => cleanup());

  it("shows the one rating on every viewing of a movie", async () => {
    renderPage();

    const groups = await screen.findAllByRole("group", { name: "Your rating for Paris, Texas" });
    expect(groups).toHaveLength(2);
    groups.forEach((group) => {
      expect(within(group).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("rates in one tap through the entry, and every viewing follows", async () => {
    renderPage();

    const [first] = await screen.findAllByRole("group", { name: "Your rating for Paris, Texas" });
    fireEvent.click(within(first).getByRole("button", { name: "Love" }));

    await waitFor(() => {
      expect(mocks.state.rpcCalls).toContainEqual({
        name: "set_my_movie_rating",
        params: { p_watch_event_id: "entry-1", p_rating: 2 },
      });
    });
    screen.getAllByRole("group", { name: "Your rating for Paris, Texas" }).forEach((group) => {
      expect(within(group).getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("rates a custom title on its own entry", async () => {
    renderPage();

    const group = await screen.findByRole("group", { name: "Your rating for Something with Adam Sandler" });
    fireEvent.click(within(group).getByRole("button", { name: "Strong dislike" }));

    await waitFor(() => {
      expect(mocks.state.rpcCalls).toContainEqual({
        name: "set_my_movie_rating",
        params: { p_watch_event_id: "entry-3", p_rating: -2 },
      });
    });
  });

  it("puts the thumbs back and says so when a save fails", async () => {
    mocks.state.rateError = { message: "network" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();

    const [first] = await screen.findAllByRole("group", { name: "Your rating for Paris, Texas" });
    fireEvent.click(within(first).getByRole("button", { name: "Love" }));

    expect(await screen.findByText("Could not save your rating. Please try again.")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves the thumbs out when your ratings cannot be read", async () => {
    mocks.state.ratingsError = { message: "network" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();

    expect(await screen.findAllByText("Paris, Texas")).not.toHaveLength(0);
    expect(screen.queryByRole("group", { name: /Your rating for/ })).not.toBeInTheDocument();
  });
});
