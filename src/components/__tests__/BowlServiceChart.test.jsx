import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { services: [], rows: [], rpcError: null, profileError: null },
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "user-1", email: "me@example.com" } } }, error: null }),
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({
          data: mocks.state.profileError ? null : { streaming_services: mocks.state.services },
          error: mocks.state.profileError,
        }),
      };
      return query;
    },
    rpc: vi.fn(async () => ({
      data: mocks.state.rpcError ? null : mocks.state.rows,
      error: mocks.state.rpcError,
    })),
  },
}));

import BowlServiceChart from "../BowlServiceChart";
import { notifyBowlChange } from "../../lib/bowlChanges";
import { supabase } from "../../lib/supabase";

function row(tmdbId, subscription, { fetched = true } = {}) {
  return {
    tmdb_id: tmdbId,
    fetched_at: fetched ? "2026-09-30T00:00:00.000Z" : null,
    providers: subscription,
    provider_availability: { subscription: subscription.map((name) => ({ name })) },
    region: "US",
  };
}

beforeEach(() => {
  mocks.state = { services: [], rows: [], rpcError: null, profileError: null };
});
afterEach(cleanup);

describe("BowlServiceChart", () => {
  it("draws a bar per service, marks yours, and names the best addition", async () => {
    mocks.state.services = ["Netflix", "Hulu"];
    mocks.state.rows = [
      row(1, ["Netflix", "Max"]),
      row(2, ["Max"]),
      row(3, ["Max", "Tubi"]),
      row(4, ["Peacock"]),
      row(5, [], { fetched: false }),
    ];
    const onSummaryChange = vi.fn();

    render(<BowlServiceChart bowlId="bowl-1" onSummaryChange={onSummaryChange} />);

    const list = await screen.findByRole("list", { name: "Movies in this bowl by service" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Max3 movies",
      "Netflix✓(one of your services)1 movie",
      "Peacock1 movie",
      "Hulu✓(one of your services)0 movies",
    ]);
    expect(screen.getByText(/Max would add 2 movies/)).toBeInTheDocument();
    expect(screen.getByText(/1 movie hasn't been checked yet/)).toBeInTheDocument();
    expect(screen.getByText(/Counts movies, not chances of being drawn/)).toBeInTheDocument();
    expect(screen.queryByText(/Tubi/)).not.toBeInTheDocument();
    // The summary is reported from an effect, which can land after the text.
    await vi.waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith("Max carries 3"));
  });

  it("names the service carrying the most when the viewer has none", async () => {
    mocks.state.rows = [row(1, ["Max"]), row(2, ["Max", "Netflix"])];

    render(<BowlServiceChart bowlId="bowl-1" />);

    expect(await screen.findByText(/Max carries the most/)).toBeInTheDocument();
  });

  it("says which of your services add nothing you can't already stream", async () => {
    mocks.state.services = ["Netflix", "Hulu"];
    mocks.state.rows = [row(1, ["Netflix", "Hulu"]), row(2, ["Netflix"])];

    render(<BowlServiceChart bowlId="bowl-1" />);

    expect(await screen.findByText(/Your services already carry everything/)).toBeInTheDocument();
    expect(screen.getByText(/Hulu carries nothing here you can't already stream/)).toBeInTheDocument();
  });

  it("says so when the bowl has nothing to check", async () => {
    const onSummaryChange = vi.fn();

    render(<BowlServiceChart bowlId="bowl-1" onSummaryChange={onSummaryChange} />);

    expect(await screen.findByText("No movies left in this bowl to check yet.")).toBeInTheDocument();
    await vi.waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith("None on paid services"));
  });

  it("reports a failed read rather than an empty chart", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSummaryChange = vi.fn();
    mocks.state.rpcError = { message: "boom" };
    mocks.state.rows = [row(1, ["Max"])];

    render(<BowlServiceChart bowlId="bowl-1" onSummaryChange={onSummaryChange} />);

    expect(await screen.findByText(/couldn't be loaded right now/)).toBeInTheDocument();
    await vi.waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith("Unavailable"));
    // Never blank while loading: the tile holds the placeholder until an answer.
    expect(onSummaryChange).not.toHaveBeenCalledWith(null);
    expect(onSummaryChange).toHaveBeenCalledWith("…");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("counts unchecked movies as left in the bowl rather than calling it empty", async () => {
    const onSummaryChange = vi.fn();
    mocks.state.rows = [row(1, [], { fetched: false }), row(2, [], { fetched: false })];

    render(<BowlServiceChart bowlId="bowl-1" onSummaryChange={onSummaryChange} />);

    expect(await screen.findByText(/hasn't been checked yet\./)).toBeInTheDocument();
    expect(screen.getByText(/How many of the 2 movies left/)).toBeInTheDocument();
    expect(screen.getByText(/2 movies haven't been checked yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No movies left/)).not.toBeInTheDocument();
    await vi.waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith("Not checked yet"));
  });

  it("describes the whole bowl when only some of it has been checked", async () => {
    mocks.state.rows = [row(1, ["Max"]), row(2, [], { fetched: false })];

    render(<BowlServiceChart bowlId="bowl-1" />);

    expect(await screen.findByText(/How many of the 2 movies left/)).toBeInTheDocument();
    expect(screen.getByText(/1 movie hasn't been checked yet/)).toBeInTheDocument();
  });

  it("reads again when this bowl changes, such as a starter pack going in", async () => {
    mocks.state.rows = [row(1, ["Max"])];
    supabase.rpc.mockClear();
    render(<BowlServiceChart bowlId="bowl-1" />);
    await screen.findByText(/How many of the 1 movie left/);

    mocks.state.rows = [row(1, ["Max"]), row(2, ["Max"]), row(3, ["Peacock"])];
    act(() => notifyBowlChange({ type: "context", bowlId: "other-bowl" }));
    act(() => notifyBowlChange({ type: "add", phase: "pending", bowlId: "bowl-1" }));
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    act(() => notifyBowlChange({ type: "context", bowlId: "bowl-1" }));
    expect(await screen.findByText(/How many of the 3 movies left/)).toBeInTheDocument();

    // A movie added elsewhere is read on its add, before its cache row is
    // warmed; the warm-up's own event brings its providers in.
    mocks.state.rows = [...mocks.state.rows, row(4, ["Peacock"], { fetched: false })];
    act(() => notifyBowlChange({ type: "add", phase: "success", bowlId: "bowl-1" }));
    expect(await screen.findByText(/1 movie hasn't been checked yet/)).toBeInTheDocument();
    mocks.state.rows = [...mocks.state.rows.slice(0, 3), row(4, ["Peacock"])];
    act(() => notifyBowlChange({ type: "metadata", bowlId: "bowl-1", tmdbId: 4 }));
    await vi.waitFor(() => expect(screen.queryByText(/hasn't been checked yet/)).not.toBeInTheDocument());
  });
});
