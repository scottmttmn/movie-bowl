import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1", max_contribution_lead: 1 },
    memberRows: [{ user_id: "u1" }, { user_id: "u2" }],
    bowlData: {
      remaining: [
        { id: "m1", added_by: "u1" },
        { id: "m2", added_by: "u1" },
        { id: "m3", added_by: "u1" },
        { id: "m4", added_by: "u1" },
      ],
      watched: [],
    },
    contributions: { "owner@example.com": 4 },
    handleDraw: vi.fn(async () => null),
    streamingServices: [],
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
    handleAddMovie: vi.fn(),
  }),
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
  }),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: mocks.supabase,
}));

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

describe("BowlDashboard contribution limit UI", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authUserId = "u1";
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", max_contribution_lead: 1 };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1" },
        { id: "m2", added_by: "u1" },
        { id: "m3", added_by: "u1" },
        { id: "m4", added_by: "u1" },
      ],
      watched: [],
    };
    mocks.state.contributions = { "owner@example.com": 4 };
    mocks.state.handleDraw.mockClear();
    mocks.state.streamingServices = [];
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it("disables Add Movie when user is over the contribution lead limit", async () => {
    render(<BowlDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Bowl 1")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /\+ add movie/i });
    expect(addButton).toBeDisabled();
    expect(
      screen.getByText(/you are at 4 contributions and the lowest active member is at 0/i)
    ).toBeInTheDocument();
  });

  it("keeps Add Movie enabled when only one active member exists", async () => {
    // Simulates an invited (not accepted) user: only one active bowl_members row.
    mocks.state.memberRows = [{ user_id: "u1" }];
    mocks.state.bowlData = { remaining: [], watched: [] };
    mocks.state.contributions = {};

    render(<BowlDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Bowl 1")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /\+ add movie/i });
    expect(addButton).toBeEnabled();
  });

  it("owner draw uses the owner's streaming services in prioritize payload", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" }],
      watched: [],
    };
    mocks.state.contributions = { "owner@example.com": 1 };
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.authUserId = "u1";

    render(<BowlDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Bowl 1")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith({
        prioritizeByServices: true,
        userStreamingServices: ["Netflix", "Max"],
      });
    });
  });

  it("member draw uses the member's streaming services in prioritize payload", async () => {
    mocks.state.streamingServices = ["Hulu"];
    mocks.state.bowlData = {
      remaining: [{ id: "m1", added_by: "u2", tmdb_id: 101, title: "Movie A" }],
      watched: [],
    };
    mocks.state.contributions = { "member@example.com": 1 };
    mocks.state.bowlRow = { name: "Bowl 1", owner_id: "u1", max_contribution_lead: null };
    mocks.state.memberRows = [{ user_id: "u1" }, { user_id: "u2" }];
    mocks.state.authUserId = "u2";

    render(<BowlDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Bowl 1")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mocks.state.handleDraw).toHaveBeenCalledWith({
        prioritizeByServices: true,
        userStreamingServices: ["Hulu"],
      });
    });
  });
});
