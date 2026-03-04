import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RokuDeviceProvider } from "../../context/RokuDeviceContext";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null },
    memberRows: [{ user_id: "u1" }, { user_id: "u2" }],
    bowlData: {
      remaining: [{ id: "m1", added_by: "u2", tmdb_id: 101, title: "Movie A", runtime: 180, genres: ["Action"] }],
      watched: [],
    },
    contributions: { "member@example.com": 1 },
    handleDraw: vi.fn(async () => null),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: ["Hulu"],
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
  };

  return { state, supabase };
});

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.state.bowlData,
    contributions: mocks.state.contributions,
    isLoading: false,
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
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    },
    loading: false,
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
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

function renderDashboard() {
  return render(
    <RokuDeviceProvider>
      <BowlDashboard />
    </RokuDeviceProvider>
  );
}

describe("BowlDashboard runtime filters", () => {
  beforeEach(() => {
    mocks.state.handleDraw.mockClear();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it("sends runtime min/max range in draw payload", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /draw-runtime-min/i }), { target: { value: "95" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /draw-runtime-max/i }), { target: { value: "170" } });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
        expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeFilter: {
            minMinutes: 95,
            maxMinutes: 170,
            includeUnknown: true,
          },
        })
      );
    });
  });
});
