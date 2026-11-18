import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1" },
    memberRows: [{ user_id: "u1" }],
    bowlData: {
      remaining: [],
      watched: [],
    },
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
    preferencesLoading: false,
    preferencesLoadError: null,
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
  };

  return {
    state,
    supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: state.authUserId } } },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: vi.fn((table) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { user_id: state.authUserId }, error: null })),
        single: vi.fn(async () => {
          if (table === "bowls") return { data: state.bowlRow, error: null };
          return { data: null, error: null };
        }),
        then: (resolve, reject) => {
          if (table === "bowl_members") {
            return Promise.resolve({ data: state.memberRows, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    }),
    },
    getTmdbMovieDetails: vi.fn(async () => ({})),
    fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
    fetchProviderLinks: vi.fn(),
    saveStreamingServices: vi.fn(async () => ({ error: null })),
    getPlaceHours: vi.fn(async () => ({ hours: {} })),
  };
});

const userBowlsMock = vi.hoisted(() => ({
  bowls: [{ id: "bowl-1", name: "Friday Night", ownerId: "u1", role: "Owner", memberCount: 3, remainingCount: 4, kind: "movies" }],
  defaultBowlId: null,
  loading: false,
  error: null,
  refresh: vi.fn(async () => null),
  setDefaultBowl: vi.fn(async () => null),
  savingDefault: false,
}));
vi.mock("../../hooks/useUserBowls", () => ({ default: () => userBowlsMock }));

vi.mock("../../hooks/useBowlAdd", () => ({ default: () => ({ openBowlAdd: vi.fn() }) }));
vi.mock("../../hooks/useBowl", () => ({
  default: (bowlId) => ({
    bowl: mocks.state.bowlData,
    isLoading: false,
    loadedBowlId: bowlId,
    errorMessage: null,
    handleDraw: mocks.state.handleDraw,
    handleDeleteMovie: mocks.state.handleDeleteMovie,
    handleReaddMovie: mocks.state.handleReaddMovie,
    handleAddMovie: vi.fn(),
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
    saveStreamingServices: mocks.saveStreamingServices,
    defaultDrawSettings: mocks.state.defaultDrawSettings,
    loading: mocks.state.preferencesLoading,
    loadError: mocks.state.preferencesLoadError,
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
const roster = vi.hoisted(() => ({ members: [], status: "ready" }));
vi.mock("../../hooks/useBowlPeople", () => ({
  default: () => ({
    status: roster.status,
    members: roster.status === "ready" ? roster.members : [],
    invites: [],
    names: { u1: "Scott", u2: "Jordan", u3: "Casey" },
  }),
}));
vi.mock("../../lib/placesSearch", async () => ({
  ...(await vi.importActual("../../lib/placesSearch")),
  getPlaceHours: mocks.getPlaceHours,
}));
vi.mock("../../lib/providerLinks", () => ({ fetchProviderLinks: mocks.fetchProviderLinks }));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useParams: () => ({ bowlId: mocks.state.bowlId }),
  };
});

import BowlDashboard from "../BowlDashboard";
import { writeAwayKeys, writeSkipAsk } from "../../utils/whoIsHere";

const slips = () => [
  { id: "m1", added_by: "u1", tmdb_id: -1, title: "Gran Torino", profiles: { display_name: "Scott" } },
  { id: "m2", added_by: "u2", tmdb_id: -2, title: "Moonstruck", profiles: { display_name: "Jordan" } },
  { id: "m3", added_by: "u3", tmdb_id: -3, title: "Alien", profiles: { display_name: "Casey" } },
  { id: "m4", added_by: "u3", tmdb_id: -4, title: "The Thing", profiles: { display_name: "Casey" } },
];

const tapDraw = () => fireEvent.click(screen.getByRole("button", { name: "Draw movie from bowl. Choose who's here first." }));
const sheet = () => screen.getByRole("dialog");

async function renderBowl() {
  render(<BowlDashboard />);
  await waitFor(() => expect(screen.getByText("Friday Night")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Draw movie from bowl. Choose who's here first." })).toBeEnabled());
}

describe("BowlDashboard asking who's here", () => {
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* jsdom always has storage */ }
    mocks.state.navigate.mockReset();
    mocks.state.bowlRow = { name: "Friday Night", owner_id: "u1", kind: "movies", draw_method: "person_first" };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }];
    mocks.state.bowlData = { remaining: slips(), watched: [] };
    mocks.state.handleDraw.mockReset().mockResolvedValue(null);
    roster.status = "ready";
    userBowlsMock.bowls[0].memberCount = 3;
    roster.members = [
      { userId: "u1", role: "Owner", displayName: "Scott" },
      { userId: "u2", role: "Member", displayName: "Jordan" },
      { userId: "u3", role: "Member", displayName: "Casey" },
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it("opens on a tap, and the draw leaves out whoever is away", async () => {
    await renderBowl();
    tapDraw();
    expect(mocks.state.handleDraw).not.toHaveBeenCalled();

    const casey = within(sheet()).getByRole("button", { name: "Casey is here" });
    expect(casey).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(casey);
    expect(casey).toHaveAttribute("aria-pressed", "false");
    expect(within(sheet()).getByText("2/3")).toBeInTheDocument();

    fireEvent.click(within(sheet()).getByRole("button", { name: "Draw" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.handleDraw.mock.calls[0][0].awayKeys).toEqual(["user:u3"]);
    // The stat line says the draw is narrowed, in the tone filters use.
    expect(screen.getByRole("button", { name: "Drawing for 2 of 3 people. Change who's here." })).toBeInTheDocument();
  });

  it("keeps the choice on this device for the evening", async () => {
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Casey is here" }));
    cleanup();

    await renderBowl();
    tapDraw();
    expect(within(sheet()).getByRole("button", { name: "Casey is here" })).toHaveAttribute("aria-pressed", "false");
  });

  it("draws for yourself when only you are here", async () => {
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Jordan is here" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Casey is here" }));

    fireEvent.click(within(sheet()).getByRole("button", { name: "Draw for myself" }));
    expect(mocks.state.navigate).toHaveBeenCalledWith("/solo-draw?bowl=bowl-1");
    expect(mocks.state.handleDraw).not.toHaveBeenCalled();
  });

  it("cannot draw when nobody here has anything in the bowl", async () => {
    mocks.state.bowlData = { remaining: slips().filter((movie) => movie.added_by === "u3"), watched: [] };
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Casey is here" }));
    expect(within(sheet()).getByRole("button", { name: "Draw" })).toBeDisabled();
  });

  it("brings back the hold after Don't ask again, and the people count undoes it", async () => {
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("checkbox", { name: "Don't ask again" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Draw" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));

    const hold = await screen.findByRole("button", { name: "Draw movie from bowl. Press and hold to draw." });
    // Without the sheet the keyboard path confirms again, as before.
    hold.focus();
    fireEvent.click(hold, { detail: 0 });
    expect(screen.getByText("Reveal a movie?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "3 people in this bowl. See who." }));
    const box = within(sheet()).getByRole("checkbox", { name: "Don't ask again" });
    expect(box).toBeChecked();
    fireEvent.click(box);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Draw movie from bowl. Choose who's here first." })).toBeInTheDocument();
  });

  it("lets the slips of someone who has since left back into the draw", async () => {
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Casey is here" }));
    cleanup();

    roster.members = roster.members.filter((member) => member.userId !== "u3");
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Draw" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.handleDraw.mock.calls[0][0].awayKeys).toEqual([]);
  });

  it("draws for yourself from the hold as well, once the question is skipped", async () => {
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Jordan is here" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Casey is here" }));
    fireEvent.click(within(sheet()).getByRole("checkbox", { name: "Don't ask again" }));
    fireEvent.click(document.querySelector(".modal-overlay"));

    const hold = await screen.findByRole("button", { name: "Draw movie from bowl. Press and hold to draw." });
    fireEvent.click(hold, { detail: 0 });
    fireEvent.click(screen.getByRole("button", { name: /^Reveal/ }));
    expect(mocks.state.navigate).toHaveBeenCalledWith("/solo-draw?bowl=bowl-1");
    expect(mocks.state.handleDraw).not.toHaveBeenCalled();
  });

  it("waits for the roster before a draw that someone's absence could make solo", async () => {
    // Saved earlier on this device: everyone else away, and the question skipped.
    writeAwayKeys("u1", "bowl-1", ["user:u2", "user:u3"]);
    writeSkipAsk("u1", "bowl-1", true);
    roster.status = "loading";
    render(<BowlDashboard />);

    const hold = await screen.findByRole("button", { name: "Draw movie from bowl. Press and hold to draw." });
    expect(hold).toBeDisabled();
    fireEvent.click(hold, { detail: 0 });
    expect(screen.queryByRole("button", { name: /^Reveal/ })).not.toBeInTheDocument();
    expect(mocks.state.handleDraw).not.toHaveBeenCalled();
  });

  it("still asks who's here while the account's bowl list has not answered", async () => {
    userBowlsMock.bowls[0].memberCount = null;
    await renderBowl();
    tapDraw();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Casey is here" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Draw" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalled());
    expect(mocks.state.handleDraw.mock.calls[0][0].awayKeys).toEqual(["user:u3"]);
  });
});
