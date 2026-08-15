import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StreamingMatchCount from "../StreamingMatchCount";
import { STREAMING_MATCH_STATUS } from "../../hooks/useBowlStreamingMatches";

const HUE_BY_TONE = {
  idle: "slate",
  active: "rose",
  warning: "amber",
};

function hoverClasses(element) {
  return element.className.split(/\s+/).filter((cls) => cls.startsWith("hover:"));
}

describe("StreamingMatchCount", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens preferences when the chip is tapped", () => {
    const onOpenPreferences = vi.fn();
    render(
      <StreamingMatchCount
        status={STREAMING_MATCH_STATUS.ready}
        count={4}
        onOpenPreferences={onOpenPreferences}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  // Touch browsers leave :hover applied after a tap, so a hover style from
  // another tone would read as the chip's state having changed on tap.
  it.each([
    ["idle", { isPrioritized: false, count: 4 }],
    ["active", { isPrioritized: true, count: 4, useServiceRank: false }],
    ["warning", { isPrioritized: true, count: 0 }],
  ])("keeps %s hover styling inside its own tone", (tone, props) => {
    render(<StreamingMatchCount status={STREAMING_MATCH_STATUS.ready} {...props} />);

    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("data-tone", tone);

    const classes = hoverClasses(chip);
    expect(classes.length).toBeGreaterThan(0);
    classes.forEach((cls) => {
      expect(cls).toContain(HUE_BY_TONE[tone]);
    });
  });
});
