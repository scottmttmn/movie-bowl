import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Friday Night", owner_id: "u1", draw_access_mode: "all_members", draw_method: "rotation" },
    queue: [],
    queueError: null,
    bowls: [],
    defaultBowlId: "bowl-2",
    contextLoading: false,
    contextError: null,
    savingDefault: false,
    refresh: vi.fn(async () => null),
    setDefaultBowl: vi.fn(async () => ({ bowls: [], defaultBowlId: "bowl-1" })),
    openBowlAdd: vi.fn(),
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: state.authUserId } } },
        error: null,
      })),
    },
    from: vi.fn((table) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { user_id: state.authUserId }, error: null })),
        single: vi.fn(async () => (table === "bowls"
          ? { data: state.bowlRow, error: null }
          : { data: null, error: null })),
        then: (resolve, reject) => {
          if (table === "bowl_members") {
            return Promise.resolve({
              data: [
                { user_id: "u1", role: "Owner" },
                { user_id: "u2", role: "Member" },
                { user_id: "u3", role: "Member" },
              ],
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    }),
    rpc: vi.fn(async (name) => {
      if (name === "get_bowl_rotation_queue") return { data: state.queue, error: state.queueError };
      if (name === "get_bowl_profile_directory") {
        return {
          data: [
            { user_id: "u1", display_name: "Alex" },
            { user_id: "u2", display_name: "Sam" },
            { user_id: "u3", display_name: "Robin" },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    }),
  };

  return { state, supabase };
});

vi.mock("../../hooks/useUserBowls", () => ({
  default: () => ({
    bowls: mocks.state.bowls,
    defaultBowlId: mocks.state.defaultBowlId,
    loading: mocks.state.contextLoading,
    error: mocks.state.contextError,
    refresh: mocks.state.refresh,
    setDefaultBowl: mocks.state.setDefaultBowl,
    savingDefault: mocks.state.savingDefault,
  }),
}));

vi.mock("../../hooks/useBowlAdd", () => ({ default: () => ({ openBowlAdd: mocks.state.openBowlAdd }) }));

const REMAINING = [
  { id: "m1", tmdb_id: -1, title: "Alex Pick", added_by: "u1" },
  { id: "m2", tmdb_id: -2, title: "Sam Pick", added_by: "u2" },
  { id: "m3", tmdb_id: -3, title: "Robin Pick", added_by: "u3" },
];

vi.mock("../../hooks/useBowl", () => ({
  default: (bowlId) => ({
    bowl: { remaining: REMAINING, watched: [] },
    isLoading: false,
    loadedBowlId: bowlId,
    errorMessage: null,
    handleDraw: vi.fn(async () => null),
    handleAddMovie: vi.fn(async () => true),
    handleUpdateMovieNote: vi.fn(async () => ({ ok: true })),
    handleSetMoviePin: vi.fn(async () => ({ ok: true })),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: [],
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      enablePreferredWebLaunch: false,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    },
    loading: false,
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/starterPacks", async () => ({
  ...(await vi.importActual("../../lib/starterPacks")),
  fetchStarterPackPeople: vi.fn(async () => ({})),
}));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
}));
vi.mock("../../lib/tmdbApi", () => ({ getTmdbMovieDetails: vi.fn(async () => ({})) }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useParams: () => ({ bowlId: mocks.state.bowlId }),
  };
});

import BowlDashboard from "../BowlDashboard";

const BOWLS = [{ id: "bowl-1", name: "Friday Night", role: "Owner", remainingCount: 3, memberCount: 3 }];

async function openPeople() {
  render(<BowlDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "3 people in this bowl. See who." }));
  return screen.getByRole("dialog");
}

describe("BowlDashboard rotation turn order", () => {
  beforeEach(() => {
    mocks.state.bowls = BOWLS;
    mocks.state.bowlRow = { name: "Friday Night", owner_id: "u1", draw_access_mode: "all_members", draw_method: "rotation" };
    mocks.state.queue = [
      { bucket_key: "user:u3", never_drawn: true },
      { bucket_key: "user:u1", never_drawn: false },
      { bucket_key: "user:u2", never_drawn: false },
    ];
    mocks.state.queueError = null;
    mocks.supabase.rpc.mockClear();
  });

  afterEach(cleanup);

  it("lists a rotation bowl's people in the order the next draws reach them", async () => {
    const dialog = await openPeople();

    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(3));
    expect(within(dialog).getAllByRole("listitem").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Robin, up next: 1 movie in the draw",
      "Alex (you), owner: 1 movie in the draw",
      "Sam: 1 movie in the draw",
    ]);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("get_bowl_rotation_queue", {
      p_bowl_id: "bowl-1",
      p_candidate_movie_ids: ["m1", "m2", "m3"],
    });
  });

  it("does not ask for an order until someone opens the sheet", async () => {
    render(<BowlDashboard />);
    await screen.findByRole("button", { name: "3 people in this bowl. See who." });

    expect(mocks.supabase.rpc).not.toHaveBeenCalledWith("get_bowl_rotation_queue", expect.anything());
  });

  it("keeps the usual order and marks nobody when the order cannot be read", async () => {
    mocks.state.queueError = { message: "boom" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const dialog = await openPeople();

    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(3));
    expect(within(dialog).getAllByRole("listitem")[0]).toHaveAccessibleName(/^Alex/);
    expect(within(dialog).queryByRole("listitem", { name: /up next/ })).not.toBeInTheDocument();
    error.mockRestore();
  });

  it("asks for no order where the draw does not take turns", async () => {
    mocks.state.bowlRow = { ...mocks.state.bowlRow, draw_method: "person_first" };
    const dialog = await openPeople();

    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(3));
    expect(mocks.supabase.rpc).not.toHaveBeenCalledWith("get_bowl_rotation_queue", expect.anything());
    expect(within(dialog).queryByRole("listitem", { name: /up next/ })).not.toBeInTheDocument();
  });
});
