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
  bowls: [{ id: "bowl-1", name: "Date Night Eats", ownerId: "u1", role: "Owner", memberCount: 2, remainingCount: 2, kind: "restaurants" }],
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
import { clearPlaceHoursCache } from "../../hooks/usePlaceHours";

function renderDashboard() {
  return render(<BowlDashboard />);
}

// The list's open state is remembered per device, so open it only if shut.
function openBeenThere() {
  const toggle = screen.getByRole("button", { name: /Been there/ });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
}

const slips = () => [
  { id: "r1", added_by: "u1", tmdb_id: null, title: "La Rana Bistro", cuisine: "Mediterranean", place_id: "ChIJlarana", note: "Anniversary spot", profiles: { display_name: "Owner" } },
  { id: "r2", added_by: "u2", tmdb_id: null, title: "Great Dragon", cuisine: "Chinese", profiles: { display_name: "Friend" } },
];

describe("BowlDashboard in a restaurant bowl", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.bowlRow = { name: "Date Night Eats", owner_id: "u1", kind: "restaurants" };
    userBowlsMock.bowls = [{ id: "bowl-1", name: "Date Night Eats", ownerId: "u1", role: "Owner", memberCount: 2, remainingCount: 2, kind: "restaurants" }];
    userBowlsMock.loading = false;
    userBowlsMock.error = null;
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.bowlData = { remaining: slips(), watched: [] };
    mocks.state.handleDraw.mockReset();
    mocks.getPlaceHours.mockReset().mockResolvedValue({ hours: {} });
    clearPlaceHoursCache();
    mocks.fetchProviderLinks.mockReset().mockResolvedValue({ links: [] });
    mocks.getTmdbMovieDetails.mockReset().mockResolvedValue({});
    mocks.fetchStreamingProviders.mockReset().mockResolvedValue({ providers: [], region: "US", fetchedAt: null });
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("speaks of restaurants and leaves out what only movies have", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Add a restaurant to this bowl" })).toBeInTheDocument();
    expect(screen.getByText("My Restaurants")).toBeInTheDocument();
    expect(screen.getByText("Been there")).toBeInTheDocument();
    expect(screen.queryByText("My Movies")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /theater/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draw for myself/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drawing from 2 restaurants. Open draw filters." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draw restaurant from bowl. Press and hold to draw." })).toBeInTheDocument();
    expect(screen.queryByText(/movie/i)).not.toBeInTheDocument();
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalled();
  });

  it("draws from every slip and opens the place with directions", async () => {
    mocks.state.handleDraw.mockResolvedValue({ ...slips()[0], drawn_at: "2026-11-08T19:00:00Z" });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /draw restaurant/i }));
    expect(screen.getByText("Reveal a restaurant?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));

    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.handleDraw.mock.calls[0][0]).toMatchObject({
      prioritizeByServices: false,
      returnUntil: null,
      ratingFilter: null,
      genreFilter: null,
      runtimeFilter: null,
    });

    const heading = await screen.findByRole("heading", { name: "La Rana Bistro", level: 2 }, { timeout: 4000 });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("Anniversary spot")).toBeInTheDocument();
    const directions = screen.getByRole("link", { name: "Directions" });
    expect(directions.getAttribute("href")).toContain("query_place_id=ChIJlarana");
    expect(screen.queryByText(/where to watch/i)).not.toBeInTheDocument();
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalled();
  });

  it("takes the kind from the bowl itself when the account's bowl list has not answered", async () => {
    userBowlsMock.bowls = [];
    userBowlsMock.error = new Error("context failed");
    mocks.state.handleDraw.mockResolvedValue({ ...slips()[0], drawn_at: "2026-11-08T19:00:00Z" });

    renderDashboard();
    await waitFor(() => expect(screen.getByText("My Restaurants")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /draw restaurant/i }));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.handleDraw.mock.calls[0][0]).toMatchObject({
      ratingFilter: null,
      genreFilter: null,
      runtimeFilter: null,
    });
  });

  it("narrows the draw by cuisine, and keeps the narrowing for next time", async () => {
    mocks.state.handleDraw.mockResolvedValue({ ...slips()[1], drawn_at: "2026-11-08T19:00:00Z" });

    const view = renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Narrow the draw" });
    expect(within(sheet).getByRole("button", { name: "Chinese", pressed: true })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Mediterranean", pressed: true })).toBeInTheDocument();
    expect(within(sheet).queryByText(/movie|genre|rating|runtime/i)).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Only Chinese" }));
    expect(within(sheet).getByRole("button", { name: "Mediterranean", pressed: false })).toBeInTheDocument();
    expect(await within(sheet).findByText("1 of 2 restaurants in the draw")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getByRole("button", { name: /draw restaurant/i }));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    expect(mocks.state.handleDraw.mock.calls[0][0]).toMatchObject({
      restaurantFilter: { excluded: ["Mediterranean"] },
      genreFilter: null,
    });

    view.unmount();
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Mediterranean", pressed: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Mediterranean", pressed: true })).toBeInTheDocument();
  });

  it("leaves out a place closed at the time asked about, and asks only when asked", async () => {
    mocks.state.handleDraw.mockResolvedValue({ ...slips()[1], drawn_at: "2026-11-08T19:00:00Z" });
    // Closed all week; the other slip was added by name and has no hours.
    mocks.getPlaceHours.mockResolvedValue({
      hours: { ChIJlarana: { closedForGood: false, periods: [], timeZone: null, utcOffsetMinutes: null } },
    });

    const view = renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Narrow the draw" });
    expect(within(sheet).getByRole("radio", { name: "Any time", checked: true })).toBeInTheDocument();
    expect(mocks.getPlaceHours).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("radio", { name: "Now" }));
    expect(await within(sheet).findByText("0 open · 1 closed · 1 without hours")).toBeInTheDocument();
    expect(await within(sheet).findByText("1 of 2 restaurants in the draw now")).toBeInTheDocument();
    expect(mocks.getPlaceHours).toHaveBeenCalledTimes(1);
    expect(mocks.getPlaceHours.mock.calls[0][0]).toMatchObject({ bowlId: "bowl-1", placeIds: ["ChIJlarana"] });

    // Another time costs no second lookup.
    fireEvent.click(within(sheet).getByRole("radio", { name: "Pick" }));
    expect(within(sheet).getByLabelText("Day")).toHaveValue(within(sheet).getByRole("option", { name: "Tomorrow" }).value);
    expect(await within(sheet).findByText("1 of 2 restaurants in the draw tomorrow at 7 PM")).toBeInTheDocument();
    expect(mocks.getPlaceHours).toHaveBeenCalledTimes(1);
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getByRole("button", { name: /draw restaurant/i }));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    await waitFor(() => expect(mocks.state.handleDraw).toHaveBeenCalledTimes(1));
    // Drawn for tomorrow, so it can go back in the bowl until tomorrow ends.
    const now = new Date();
    expect(mocks.state.handleDraw.mock.calls[0][0]).toMatchObject({
      restaurantFilter: { excluded: [], closedPlaceIds: ["ChIJlarana"] },
      returnUntil: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime(),
    });

    // The time is not remembered: the next visit asks for nothing.
    view.unmount();
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("radio", { name: "Any time", checked: true })).toBeInTheDocument();
    expect(await screen.findByText("All 2 restaurants in the draw")).toBeInTheDocument();
    expect(mocks.getPlaceHours).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing out when the hours cannot be had", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Narrow the draw" });
    fireEvent.click(within(sheet).getByRole("radio", { name: "Tonight" }));
    expect(await within(sheet).findByText("No hours to go on, so nothing is left out")).toBeInTheDocument();
    expect(await within(sheet).findByText("All 2 restaurants in the draw tonight")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Reset" }));
    expect(within(sheet).getByRole("radio", { name: "Any time", checked: true })).toBeInTheDocument();
  });

  it("says how long a pick drawn for a day can go back, and moves it back", async () => {
    const now = new Date();
    const drawnAt = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
    mocks.state.bowlData = {
      remaining: [slips()[1]],
      watched: [{ ...slips()[0], drawn_at: drawnAt, drawn_by: "u1", return_until: dayEnd }],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());
    openBeenThere();
    fireEvent.click(await screen.findByRole("button", { name: /La Rana Bistro/ }));

    expect(await screen.findByText("It can go back in the bowl until the end of tomorrow.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Bowl" }));
    const confirm = screen.getByRole("dialog", { name: "Put it back in the bowl?" });
    fireEvent.click(within(confirm).getAllByRole("button").at(-1));
    await waitFor(() => expect(mocks.state.handleReaddMovie).toHaveBeenCalled());
  });

  it("explains the day has passed once a planned pick can no longer go back", async () => {
    const now = new Date();
    const drawnAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const dayEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    mocks.state.bowlData = {
      remaining: [slips()[1]],
      watched: [{ ...slips()[0], drawn_at: drawnAt, drawn_by: "u1", return_until: dayEnd }],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Date Night Eats")).toBeInTheDocument());
    openBeenThere();
    fireEvent.click(await screen.findByRole("button", { name: /La Rana Bistro/ }));

    expect(
      await screen.findByText("Moving a pick back was available until the end of the day it was drawn for. Add the restaurant again to go another night.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to Bowl" })).not.toBeInTheDocument();
  });
});
