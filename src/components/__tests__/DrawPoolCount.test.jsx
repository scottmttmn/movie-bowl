import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DrawPoolCount from "../DrawPoolCount";
import { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";

const FULL_REACH = { totalCount: 2, reachedCount: 2, excludedNames: [] };
const PARTIAL_REACH = { totalCount: 3, reachedCount: 1, excludedNames: ["sam"] };

function renderChip(props = {}) {
  return render(
    <DrawPoolCount
      status={DRAW_POOL_STATUS.ready}
      poolCount={6}
      totalCount={40}
      contributorReach={FULL_REACH}
      {...props}
    />
  );
}

describe("DrawPoolCount", () => {
  afterEach(() => {
    cleanup();
  });

  // Unfiltered bowls should look exactly as they did before this chip existed.
  it("renders nothing when the filters remove nothing", () => {
    const { container } = renderChip({ status: DRAW_POOL_STATUS.unfiltered });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the pool the draw can actually reach", () => {
    renderChip();
    expect(screen.getByRole("button")).toHaveTextContent("Drawing from 6");
  });

  it("opens the filters when tapped", () => {
    const onOpenFilters = vi.fn();
    renderChip({ onOpenFilters });

    fireEvent.click(screen.getByRole("button"));
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it("asks for a tap before running lookups on a large bowl", () => {
    const onRunLookups = vi.fn();
    renderChip({ status: DRAW_POOL_STATUS.manual, onRunLookups });

    fireEvent.click(screen.getByRole("button", { name: /count titles your filters allow/i }));
    expect(onRunLookups).toHaveBeenCalledTimes(1);
  });

  it("warns when the filters have emptied the pool", () => {
    renderChip({ poolCount: 0, contributorReach: { totalCount: 2, reachedCount: 0, excludedNames: [] } });
    expect(screen.getByRole("button")).toHaveAttribute("data-tone", "warning");
  });

  // The whole point of the readout: a person-first bowl that silently cannot
  // reach someone should not look like a normal narrowed draw.
  it("warns and counts people when contributor bucketing is in play", () => {
    renderChip({ contributorReach: PARTIAL_REACH, showContributorReach: true });

    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("data-tone", "warning");
    expect(chip).toHaveTextContent("1 of 3 people");
  });

  it("omits the people count for methods that do not bucket by contributor", () => {
    renderChip({ contributorReach: PARTIAL_REACH, showContributorReach: false });

    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("data-tone", "active");
    expect(chip).not.toHaveTextContent("people");
  });
});
