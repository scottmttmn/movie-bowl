import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Friday Night", owner_id: "u1", draw_access_mode: "all_members" },
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
        maybeSingle: vi.fn(async () => ({ data: { user_id: state.authUserId }, error: null })),
        single: vi.fn(async () => (table === "bowls"
          ? { data: state.bowlRow, error: null }
          : { data: null, error: null })),
        then: (resolve, reject) => {
          if (table === "bowl_members") {
            return Promise.resolve({ data: [{ user_id: "u1" }], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
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

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: { remaining: [], watched: [] },
    drawOdds: [],
    isLoading: false,
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
import { MAX_BOWLS_PER_USER } from "../../utils/appLimits";

const BOWLS = [
  { id: "bowl-1", name: "Friday Night", role: "Owner", remainingCount: 12, memberCount: 3 },
  { id: "bowl-2", name: "Family Movies", role: "Owner", remainingCount: 8, memberCount: 2 },
  { id: "bowl-3", name: "Work Crew", role: "Member", remainingCount: 4, memberCount: 5 },
];

async function renderDashboard() {
  render(<BowlDashboard />);
  await waitFor(() => expect(screen.getByRole("button", { name: /switch bowl/i })).toBeInTheDocument());
}

async function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /switch bowl/i }));
  return screen.getByRole("dialog", { name: /choose a bowl/i });
}

describe("BowlDashboard bowl picker", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.setDefaultBowl.mockReset();
    mocks.state.setDefaultBowl.mockImplementation(async () => {
      mocks.state.defaultBowlId = "bowl-1";
      return { bowls: BOWLS, defaultBowlId: "bowl-1" };
    });
    mocks.state.bowlId = "bowl-1";
    mocks.state.bowlRow = { name: "Friday Night", owner_id: "u1", draw_access_mode: "all_members" };
    mocks.state.bowls = BOWLS;
    mocks.state.defaultBowlId = "bowl-2";
    mocks.state.contextLoading = false;
    mocks.state.contextError = null;
    mocks.state.savingDefault = false;
  });

  afterEach(cleanup);

  it("titles the bowl as a picker trigger and shows no home control when it is not home", async () => {
    await renderDashboard();

    expect(screen.getByRole("button", { name: "Switch bowl. Current bowl: Friday Night" })).toBeInTheDocument();
    expect(screen.queryByText("Home bowl")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /my home bowl/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("marks the header with a non-interactive badge on the home bowl", async () => {
    mocks.state.defaultBowlId = "bowl-1";

    await renderDashboard();

    expect(screen.getByText("Home bowl")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /home bowl/i })).not.toBeInTheDocument();
  });

  it("groups owned and shared bowls with undrawn counts and state markers", async () => {
    await renderDashboard();
    const dialog = await openPicker();

    expect(within(dialog).getByText("Owned by you")).toBeInTheDocument();
    expect(within(dialog).getByText("Shared with you")).toBeInTheDocument();
    expect(within(dialog).getByText("12 to draw · 3 members")).toBeInTheDocument();
    expect(within(dialog).getByText("4 to draw · 5 members")).toBeInTheDocument();
    expect(within(dialog).queryByText(/12 movies/)).not.toBeInTheDocument();

    expect(within(dialog).getByRole("button", { name: /Friday Night, current bowl/ })).toHaveAttribute("aria-current", "true");
    expect(within(dialog).getByRole("button", { name: /Family Movies, home bowl/ })).toBeInTheDocument();
  });

  it("opens another bowl without changing the home bowl", async () => {
    await renderDashboard();
    const dialog = await openPicker();

    fireEvent.click(within(dialog).getByRole("button", { name: /Work Crew/ }));

    expect(mocks.state.navigate).toHaveBeenCalledWith("/bowl/bowl-3");
    expect(mocks.state.setDefaultBowl).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /choose a bowl/i })).not.toBeInTheDocument();
  });

  it("only closes when the current bowl is chosen", async () => {
    await renderDashboard();
    const dialog = await openPicker();

    fireEvent.click(within(dialog).getByRole("button", { name: /Friday Night, current bowl/ }));

    expect(mocks.state.navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /choose a bowl/i })).not.toBeInTheDocument();
  });

  it("moves the home designation from inside the picker without closing it", async () => {
    await renderDashboard();
    const dialog = await openPicker();

    fireEvent.click(within(dialog).getByRole("button", { name: "Make Friday Night my home bowl" }));

    await waitFor(() => expect(mocks.state.setDefaultBowl).toHaveBeenCalledWith("bowl-1"));
    expect(screen.getByRole("dialog", { name: /choose a bowl/i })).toBeInTheDocument();
    expect(mocks.state.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Friday Night is now your home bowl.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /my home bowl/i })).not.toBeInTheDocument();
    expect(screen.getByText("Home bowl")).toBeInTheDocument();
  });

  it("keeps the previous home bowl when the save fails", async () => {
    mocks.state.setDefaultBowl.mockImplementation(async () => null);

    await renderDashboard();
    const dialog = await openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make Friday Night my home bowl" }));

    await waitFor(() => expect(
      within(screen.getByRole("dialog", { name: /choose a bowl/i }))
        .getByText("Could not change your home bowl. Please try again.")
    ).toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: /choose a bowl/i })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: /choose a bowl/i }))
      .getByRole("button", { name: /Family Movies, home bowl/ })).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    await renderDashboard();
    await openPicker();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /choose a bowl/i })).not.toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /switch bowl/i }));
  });

  it("disables creation at the owned-bowl limit and explains why", async () => {
    mocks.state.bowls = Array.from({ length: MAX_BOWLS_PER_USER }, (_unused, index) => ({
      id: index === 0 ? "bowl-1" : `owned-${index}`,
      name: index === 0 ? "Friday Night" : `Bowl ${index}`,
      role: "Owner",
      remainingCount: 1,
      memberCount: 1,
    }));

    await renderDashboard();
    const dialog = await openPicker();

    expect(within(dialog).getByRole("button", { name: /create new bowl/i })).toBeDisabled();
    expect(within(dialog).getByText(`You can create up to ${MAX_BOWLS_PER_USER} bowls.`)).toBeInTheDocument();
  });

  it("offers a retry inside the picker when the bowl context could not load", async () => {
    mocks.state.bowls = [];
    mocks.state.contextError = "Could not load your bowls. Please try again.";

    await renderDashboard();
    const dialog = await openPicker();

    expect(within(dialog).getByText("Could not load your bowls. Please try again.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /try again/i }));
    expect(mocks.state.refresh).toHaveBeenCalledWith({ force: true });
  });
});
