import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MPAA_RATING_OPTIONS } from "../../utils/movieRatings";
import { RokuDeviceProvider } from "../../context/RokuDeviceContext";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null },
    memberRows: [{ user_id: "u1" }, { user_id: "u2" }],
    bowlData: {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 180 }],
      watched: [],
    },
    contributions: { "owner@example.com": 1 },
    handleDraw: vi.fn(async () => null),
    handleDeleteMovie: vi.fn(async () => true),
    handleReaddMovie: vi.fn(async () => true),
    streamingServices: [],
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
    locationHash: "",
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
    defaultDrawSettings: mocks.state.defaultDrawSettings,
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
    useLocation: () => ({ hash: mocks.state.locationHash }),
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

describe("BowlDashboard draw preferences", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"], runtime: 180 }],
      watched: [],
    };
    mocks.state.contributions = { "owner@example.com": 1 };
    mocks.state.handleDraw.mockClear();
    mocks.state.streamingServices = [];
    mocks.state.defaultDrawSettings = {
      prioritizeStreaming: false,
      useStreamingRank: true,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    };
    mocks.state.locationHash = "";
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it("owner draw uses the owner's streaming services in prioritize payload", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Netflix", "Max"],
          ratingFilter: {
            allowedRatings: MPAA_RATING_OPTIONS,
            includeUnknown: true,
          },
          genreFilter: {
            allowedGenres: ["Action"],
            includeUnknown: true,
          },
          runtimeFilter: {
            minMinutes: 0,
            maxMinutes: 500,
            includeUnknown: true,
          },
        })
      );
    });
  });

  it("member draw uses the member's streaming services in prioritize payload", async () => {
    mocks.state.streamingServices = ["Hulu"];
    mocks.state.authUserId = "u2";
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u2", tmdb_id: 101, title: "Movie A", genres: ["Action"] }],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Hulu"],
        })
      );
    });
  });

  it("can disable ranking while still prioritizing services", async () => {
    mocks.state.streamingServices = ["Hulu", "Netflix"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));
    const rankToggle = screen.getByRole("checkbox", { name: /use streaming service ranking/i });
    fireEvent.click(rankToggle);
    expect(rankToggle).not.toBeChecked();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeByServices: true,
          prioritizeByServiceRank: false,
          userStreamingServices: ["Hulu", "Netflix"],
        })
      );
    });
  });

  it("resets ranking toggle to on whenever prioritize streaming is turned on", async () => {
    mocks.state.streamingServices = ["Hulu", "Netflix"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    const prioritizeToggle = screen.getByRole("checkbox", { name: /prioritize streaming services/i });
    fireEvent.click(prioritizeToggle);
    const rankToggle = screen.getByRole("checkbox", { name: /use streaming service ranking/i });
    fireEvent.click(rankToggle);
    expect(rankToggle).not.toBeChecked();

    fireEvent.click(prioritizeToggle);
    fireEvent.click(prioritizeToggle);

    expect(screen.getByRole("checkbox", { name: /use streaming service ranking/i })).toBeChecked();
  });

  it("includes selected genres in the draw payload", async () => {
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A", genres: ["Action"] },
        { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B", genres: ["Comedy"] },
      ],
      watched: [],
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit genres/i }));
    fireEvent.click(screen.getByLabelText(/draw-genre-comedy/i));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith(
        expect.objectContaining({
          genreFilter: {
            allowedGenres: ["Action"],
            includeUnknown: true,
          },
        })
      );
    });
  });

  it("hydrates draw controls from saved default draw settings", async () => {
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.defaultDrawSettings = {
      prioritizeStreaming: true,
      useStreamingRank: false,
      selectedRatings: ["PG-13", "R"],
      includeUnknownRatings: false,
      selectedGenres: ["Action"],
      includeUnknownGenres: false,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 180,
      includeUnknownRuntime: false,
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit ratings/i }));

    expect(screen.getByRole("checkbox", { name: /prioritize streaming services/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /use streaming service ranking/i })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));
    expect(screen.getByRole("spinbutton", { name: /draw-runtime-max/i })).toHaveValue(180);
    expect(screen.getByRole("spinbutton", { name: /draw-runtime-min/i })).toHaveValue(0);
    expect(screen.getByLabelText(/draw-rating-pg-13/i)).toBeChecked();
    expect(screen.getByLabelText(/draw-rating-g/i)).not.toBeChecked();
  });

  it("links to streaming service ranking from draw filters", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];

    renderDashboard();
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit streaming service ranking/i }));

    expect(mocks.state.navigate).toHaveBeenCalledWith("/settings#streaming-services");
  });
});
