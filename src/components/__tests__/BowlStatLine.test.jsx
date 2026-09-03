import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BowlStatLine from "../BowlStatLine";
import { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";
import { STREAMING_MATCH_STATUS } from "../../utils/streamingMatchSummary";

const FULL_REACH = { totalCount: 2, reachedCount: 2, excludedNames: [] };
const SHORT_REACH = { totalCount: 2, reachedCount: 1, excludedNames: ["ana"] };

function renderLine(props = {}) {
  const handlers = {
    onRunPoolLookups: vi.fn(),
    onScanStreaming: vi.fn(),
    onOpenFilters: vi.fn(),
    onOpenMethodInfo: vi.fn(),
  };
  render(
    <BowlStatLine
      poolStatus={DRAW_POOL_STATUS.unfiltered}
      poolCount={null}
      poolTotalCount={5}
      streamingStatus={STREAMING_MATCH_STATUS.unavailable}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

const pool = () => screen.getByRole("button", { name: /drawing from|nothing is eligible/i });

describe("BowlStatLine", () => {
  afterEach(cleanup);

  it("states the whole bowl when nothing is narrowing the draw", () => {
    const { onOpenFilters } = renderLine();

    expect(pool()).toHaveTextContent("Drawing from 5");
    expect(pool()).toHaveAttribute("data-tone", "idle");
    fireEvent.click(pool());
    expect(onOpenFilters).toHaveBeenCalled();
  });

  it("states the narrowed pool without making the reader do the arithmetic", () => {
    renderLine({ poolStatus: DRAW_POOL_STATUS.ready, poolCount: 3 });

    expect(pool()).toHaveTextContent("Drawing from 3");
    // The denominator lives behind the filters panel this segment opens.
    expect(screen.queryByText(/of 5/)).not.toBeInTheDocument();
    expect(pool()).toHaveAttribute("data-tone", "active");
  });

  it("names the service when ranked prioritization narrows the pool further", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 5,
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 3,
      streamingTopService: "Netflix",
      streamingTopServiceCount: 2,
      isPrioritized: true,
      useServiceRank: true,
    });

    // The eligible count and the streaming tally were the same number printed
    // twice; prioritization owns it, so it appears once.
    expect(pool()).toHaveTextContent("Drawing from 2 on Netflix");
    expect(screen.queryByText(/favoring/i)).not.toBeInTheDocument();
  });

  it("uses every matching service when ranking is off", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 5,
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 3,
      streamingTopService: "Netflix",
      streamingTopServiceCount: 2,
      isPrioritized: true,
      useServiceRank: false,
    });

    expect(pool()).toHaveTextContent("Drawing from 3");
    expect(pool()).not.toHaveTextContent("Netflix");
  });

  it("keeps the eligible pool when prioritization matches nothing", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 4,
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 0,
      isPrioritized: true,
    });

    expect(pool()).toHaveTextContent("Drawing from 4");
  });

  it("ignores an unprioritized streaming tally, which narrows nothing", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 4,
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 3,
      isPrioritized: false,
    });

    expect(pool()).toHaveTextContent("Drawing from 4");
    expect(screen.queryByText(/on your services/i)).not.toBeInTheDocument();
  });

  it("warns rather than reporting a pool of nothing", () => {
    renderLine({ poolStatus: DRAW_POOL_STATUS.ready, poolCount: 0 });

    const segment = screen.getByRole("button", { name: /nothing is eligible/i });
    expect(segment).toHaveTextContent("Nothing to draw");
    expect(segment).toHaveAttribute("data-tone", "warning");
  });

  it("shows excluded people as a ratio that opens the explanation", () => {
    const { onOpenMethodInfo } = renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 3,
      showContributorReach: true,
      contributorReach: SHORT_REACH,
    });

    const reach = screen.getByRole("button", { name: /only 1 of 2 people have a movie in the draw/i });
    expect(reach).toHaveTextContent("1/2");
    expect(reach).toHaveAttribute("data-tone", "warning");
    // The pool turns amber too: the count is honest but the draw is not reaching
    // everyone, which is the thing worth stopping for.
    expect(pool()).toHaveAttribute("data-tone", "warning");
    fireEvent.click(reach);
    expect(onOpenMethodInfo).toHaveBeenCalled();
  });

  it("says nothing about people when everyone is represented", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 3,
      showContributorReach: true,
      contributorReach: FULL_REACH,
    });

    expect(screen.queryByRole("button", { name: /people have a movie/i })).not.toBeInTheDocument();
    expect(pool()).toHaveAttribute("data-tone", "active");
  });

  it("keeps the manual filter preview as an action", () => {
    const { onRunPoolLookups } = renderLine({ poolStatus: DRAW_POOL_STATUS.manual });

    fireEvent.click(screen.getByRole("button", { name: /preview filter matches/i }));
    expect(onRunPoolLookups).toHaveBeenCalled();
  });



  it("always offers the explanation", () => {
    const { onOpenMethodInfo } = renderLine();

    fireEvent.click(screen.getByRole("button", { name: /how this bowl picks/i }));
    expect(onOpenMethodInfo).toHaveBeenCalled();
  });
});
