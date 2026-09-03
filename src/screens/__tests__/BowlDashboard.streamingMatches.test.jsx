import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_SCAN_TITLE_LIMIT } from "../../hooks/useBowlStreamingMatches";

const mocks = vi.hoisted(() => {
  const state = {
    bowlId: "bowl-1",
    navigate: vi.fn(),
    authUserId: "u1",
    bowlRow: { name: "Bowl 1", owner_id: "u1" },
    memberRows: [{ user_id: "u1" }],
    bowlData: { remaining: [], watched: [] },
    drawOdds: [],
    streamingServices: [],
    providersByTmdbId: {},
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

const userBowlsMock = vi.hoisted(() => ({
  bowls: [],
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
  default: () => ({
    bowl: mocks.state.bowlData,
    drawOdds: mocks.state.drawOdds,
    isLoading: false,
    errorMessage: null,
    handleDraw: vi.fn(),
    handleDeleteMovie: vi.fn(),
    handleReaddMovie: vi.fn(),
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
    saveDefaultDrawSettings: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

const fetchStreamingProviders = vi.fn(async (tmdbId) => ({
  providers: mocks.state.providersByTmdbId[tmdbId] || [],
  region: "US",
  fetchedAt: null,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: (...args) => fetchStreamingProviders(...args),
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

function buildRemaining(count, startId = 1000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    added_by: "u1",
    tmdb_id: startId + index,
    title: `Movie ${index}`,
  }));
}

describe("BowlDashboard streaming match count", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.streamingServices = [];
    mocks.state.providersByTmdbId = {};
    mocks.state.bowlData = {
      remaining: [
        { id: "m1", added_by: "u1", tmdb_id: 101, title: "Movie A" },
        { id: "m2", added_by: "u1", tmdb_id: 102, title: "Movie B" },
        { id: "m3", added_by: "u1", tmdb_id: -900, title: "Custom Movie" },
      ],
      watched: [],
    };
    fetchStreamingProviders.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("hides the count when the user has no streaming services saved", async () => {
    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /drawing from 3 titles/i })).toBeInTheDocument();
    expect(screen.queryByText(/service/i)).not.toBeInTheDocument();
    expect(fetchStreamingProviders).not.toHaveBeenCalled();
  });

  it("keeps the sub-100 streaming summary lazy until the user asks for it", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];
    mocks.state.providersByTmdbId = { 101: ["Netflix"], 102: ["Paramount+"] };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /check your services/i })).toBeInTheDocument();
    expect(fetchStreamingProviders).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /check your services/i }));
    await waitFor(() => expect(fetchStreamingProviders).toHaveBeenCalledTimes(2));
    // Matching without prioritizing narrows nothing, so the pool is unchanged
    // and there is no second number to print.
    expect(screen.getByRole("button", { name: /drawing from 3 titles/i })).toBeInTheDocument();
  });

  it("says the draw is favoring the top-ranked service once prioritizing is on", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];
    mocks.state.providersByTmdbId = { 101: ["Netflix"], 102: ["Max"] };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    expect(fetchStreamingProviders).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    await waitFor(() => expect(screen.getByText(/on Netflix/i)).toBeInTheDocument());
    expect(fetchStreamingProviders).toHaveBeenCalledTimes(2);
    const line = screen.getByRole("button", { name: /drawing from 1 titles on Netflix/i });
    expect(line).toHaveAttribute("data-tone", "active");
    // The eligible count and the service tally were the same number twice.
    expect(screen.queryByText(/favoring/i)).not.toBeInTheDocument();
  });

  it("shows the ranked post-filter pool and warns about unreachable manual contributors", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];
    mocks.state.providersByTmdbId = { 101: ["Netflix"], 102: ["Max"] };
    mocks.state.bowlData = {
      remaining: [
        {
          id: "m1",
          added_by: "u1",
          tmdb_id: 101,
          title: "Movie A",
          profiles: { email: "alex@example.com" },
        },
        {
          id: "m2",
          added_by: "u2",
          tmdb_id: 102,
          title: "Movie B",
          profiles: { email: "sam@example.com" },
        },
        {
          id: "m3",
          added_by: null,
          added_by_name: "Jo",
          tmdb_id: -900,
          title: "Custom Movie",
        },
      ],
      watched: [],
    };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    const poolSegment = await screen.findByRole("button", {
      name: /drawing from 1 titles on Netflix/i,
    });
    expect(poolSegment).toHaveAttribute("data-tone", "warning");
    // The people readout is now its own segment, as a ratio behind a glyph.
    const reach = screen.getByRole("button", { name: /1 of 3 people have a movie in the draw/i });
    expect(reach).toHaveTextContent("1/3");

    fireEvent.click(
      screen.getByRole("button", { name: /how this bowl picks — some people are filtered out/i })
    );
    expect(screen.getByText(/Jo and sam are left out — your filters removed every movie they added\./)).toBeInTheDocument();
    expect(fetchStreamingProviders).not.toHaveBeenCalledWith(-900);
  });

  it("favors every match when service ranking is turned off", async () => {
    mocks.state.streamingServices = ["Netflix", "Max"];
    mocks.state.providersByTmdbId = { 101: ["Netflix"], 102: ["Max"] };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /use streaming service ranking/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /drawing from 2 titles\./i })).toBeInTheDocument()
    );
  });

  it("warns that streaming falls back to the otherwise eligible pool", async () => {
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.providersByTmdbId = { 101: ["Paramount+"], 102: ["Peacock"] };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /prioritize streaming services/i }));

    // A preference that is on but changing nothing should not look like one
    // that works. The sentence is gone; the tone still says it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /drawing from/i })).toHaveAttribute(
        "data-tone",
        "warning"
      )
    );
  });

  it("opens the filter panel so the count leads to the control that changes it", async () => {
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.providersByTmdbId = { 101: ["Netflix"] };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());
    expect(fetchStreamingProviders).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /check your services/i }));
    await waitFor(() => expect(fetchStreamingProviders).toHaveBeenCalled());

    expect(
      screen.queryByRole("checkbox", { name: /prioritize streaming services/i })
    ).not.toBeInTheDocument();

    // The count still leads to the control that changes it -- through the pool
    // segment now that the streaming readout is folded into it.
    fireEvent.click(screen.getByRole("button", { name: /drawing from/i }));

    expect(
      screen.getByRole("checkbox", { name: /prioritize streaming services/i })
    ).toBeInTheDocument();
  });

  it("defers the lookup behind a tap on bowls past the auto-scan limit", async () => {
    mocks.state.streamingServices = ["Netflix"];
    mocks.state.bowlData = {
      remaining: buildRemaining(AUTO_SCAN_TITLE_LIMIT + 1),
      watched: [],
    };
    mocks.state.providersByTmdbId = { 1000: ["Netflix"], 1001: ["Netflix"] };

    render(<BowlDashboard />);
    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    const scanButton = screen.getByRole("button", { name: /check your services/i });
    expect(fetchStreamingProviders).not.toHaveBeenCalled();

    fireEvent.click(scanButton);

    await waitFor(() => expect(fetchStreamingProviders).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /check your services/i })).not.toBeInTheDocument();
  });
});
