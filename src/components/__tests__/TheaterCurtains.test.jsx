import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TheaterCurtains, { TheaterRevealCurtains } from "../TheaterCurtains";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stageOf = (container) => container.querySelector(".theater-curtains");
const screenCurtains = () => document.body.querySelector(".theater-curtains-screen");

function mockReducedMotion(reduce) {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("TheaterCurtains", () => {
  it("frames the bowl while theater mode is on, and is decoration only", () => {
    const { container } = render(<TheaterCurtains enabled />);
    const stage = stageOf(container);

    expect(stage).toHaveAttribute("aria-hidden", "true");
    expect(stage).toHaveAttribute("data-open");
    expect(stage.querySelectorAll(".theater-curtain")).toHaveLength(2);
  });

  it("keeps the curtains lifted while theater mode is off", () => {
    const { container } = render(<TheaterCurtains enabled={false} />);

    expect(stageOf(container)).not.toHaveAttribute("data-open");
  });

  // A page that loads with theater mode on shows the curtains already open;
  // only a change made while watching plays the drop and the part.
  it("animates a change, never the first paint", () => {
    const { container, rerender } = render(<TheaterCurtains enabled />);
    expect(stageOf(container)).not.toHaveAttribute("data-animated");

    rerender(<TheaterCurtains enabled={false} />);
    expect(stageOf(container)).toHaveAttribute("data-animated");
    expect(stageOf(container)).not.toHaveAttribute("data-open");

    rerender(<TheaterCurtains enabled />);
    expect(stageOf(container)).toHaveAttribute("data-open");
  });

  // The television swaps the page for its draw screen, so the page's own pair
  // is gone by then; the screen-wide pair has to stand on its own, starting
  // where the page's curtains stood.
  it("draws the screen-wide pair on its own for the television", () => {
    mockReducedMotion(false);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    const { unmount } = render(
      <TheaterRevealCurtains origin={{ left: 100, top: 200, width: 600, height: 300 }} />
    );

    expect(screenCurtains()).toHaveAttribute("aria-hidden", "true");
    expect(screenCurtains().querySelector(".theater-curtains-grow").style.getPropertyValue("--curtain-from"))
      .toBe("translate(100px, 200px) scale(0.5, 0.5)");
    unmount();
    expect(screenCurtains()).toBeNull();
  });

  it("leaves the screen-wide pair out under reduced motion", () => {
    mockReducedMotion(true);
    render(<TheaterRevealCurtains origin={null} />);

    expect(screenCurtains()).toBeNull();
  });
});
