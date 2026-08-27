import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BowlStatLine from "../BowlStatLine";
import { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";
import { STREAMING_MATCH_STATUS } from "../../hooks/useBowlStreamingMatches";

const FULL_REACH = { totalCount: 2, reachedCount: 2, excludedNames: [] };

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

describe("BowlStatLine", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the plain bowl count while nothing narrows the draw", () => {
    const { onOpenFilters } = renderLine();

    const segment = screen.getByRole("button", { name: /5 movies in the bowl/i });
    expect(segment).toHaveTextContent("in the bowl");
    expect(segment).toHaveAttribute("data-tone", "idle");

    fireEvent.click(segment);
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it("reports the narrowed pool against the total", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 3,
      contributorReach: FULL_REACH,
      showContributorReach: true,
    });

    const segment = screen.getByRole("button", { name: /drawing from 3 of 5 titles/i });
    expect(segment).toHaveTextContent("of 5 eligible");
    expect(segment).toHaveAttribute("data-tone", "active");
  });

  it("warns when the filters empty the pool", () => {
    renderLine({ poolStatus: DRAW_POOL_STATUS.ready, poolCount: 0 });

    expect(screen.getByRole("button", { name: /drawing from 0 of 5 titles/i })).toHaveAttribute(
      "data-tone",
      "warning"
    );
  });

  it("turns amber when a contributor is filtered out of a person-first bowl", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 3,
      contributorReach: { totalCount: 2, reachedCount: 1, excludedNames: ["alex"] },
      showContributorReach: true,
    });

    expect(
      screen.getByRole("button", { name: /reaching 1 of 2 people/i })
    ).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText(/1 of 2 people represented/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /how this bowl picks — some people are filtered out/i })
    ).toBeInTheDocument();
  });

  it("keeps the pool tone calm for a title-first bowl with the same exclusion", () => {
    renderLine({
      poolStatus: DRAW_POOL_STATUS.ready,
      poolCount: 3,
      contributorReach: { totalCount: 2, reachedCount: 1, excludedNames: ["alex"] },
      showContributorReach: false,
    });

    expect(screen.getByRole("button", { name: /drawing from 3 of 5 titles/i })).toHaveAttribute(
      "data-tone",
      "active"
    );
    expect(screen.getByRole("button", { name: /^how this bowl picks$/i })).toBeInTheDocument();
  });

  it("offers a filter preview when the pool needs lookups", () => {
    const { onRunPoolLookups } = renderLine({ poolStatus: DRAW_POOL_STATUS.manual });

    fireEvent.click(screen.getByRole("button", { name: /preview filter matches/i }));
    expect(onRunPoolLookups).toHaveBeenCalledTimes(1);
  });

  it("keeps the bowl count visible while the filter preview updates", () => {
    const { onOpenFilters } = renderLine({ poolStatus: DRAW_POOL_STATUS.counting });

    expect(screen.getByRole("button", { name: /5 movies in the bowl/i })).toHaveTextContent(
      "5 in the bowl"
    );
    const detailsButton = screen.getByRole("button", { name: /view filter lookup progress/i });
    expect(detailsButton).toHaveTextContent("Filter details");
    expect(screen.queryByText(/counting eligible titles/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/previewing filters/i)).not.toBeInTheDocument();

    fireEvent.click(detailsButton);
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it("omits the streaming segment when the user has no services", () => {
    renderLine();
    expect(screen.queryByText(/services/i)).not.toBeInTheDocument();
  });

  it("offers a tap to scan when the bowl is over the auto-scan limit", () => {
    const { onScanStreaming } = renderLine({ streamingStatus: STREAMING_MATCH_STATUS.manual });

    fireEvent.click(screen.getByRole("button", { name: /check your services/i }));
    expect(onScanStreaming).toHaveBeenCalledTimes(1);
  });

  it("shows the unprioritized streaming count in the idle tone", () => {
    renderLine({
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 4,
      isPrioritized: false,
    });

    const segment = screen.getByRole("button", { name: /is not filtered by them/i });
    expect(segment).toHaveTextContent("on your services");
    expect(segment).toHaveAttribute("data-tone", "idle");
  });

  it("shows ranked prioritization as favoring the top service", () => {
    renderLine({
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 4,
      streamingTopService: "Netflix",
      streamingTopServiceCount: 2,
      isPrioritized: true,
      useServiceRank: true,
    });

    const segment = screen.getByRole("button", { name: /favoring the 2 eligible titles on netflix/i });
    expect(segment).toHaveTextContent("Favoring");
    expect(segment).toHaveAttribute("data-tone", "active");
  });

  it("warns when prioritization matches nothing", () => {
    renderLine({
      streamingStatus: STREAMING_MATCH_STATUS.ready,
      streamingMatchCount: 0,
      isPrioritized: true,
    });

    expect(
      screen.getByText(/no service matches — using eligible pool/i).closest("[data-tone]")
    ).toHaveAttribute("data-tone", "warning");
  });

  it("opens the method info from the ⓘ affordance", () => {
    const { onOpenMethodInfo } = renderLine();

    fireEvent.click(screen.getByRole("button", { name: /how this bowl picks/i }));
    expect(onOpenMethodInfo).toHaveBeenCalledTimes(1);
  });
});
