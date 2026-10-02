import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TheaterCurtains, { TheaterRevealCurtains } from "../TheaterCurtains";

// jsdom lays nothing out, so the stage is given a size to paint into.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const screenCurtains = () => document.body.querySelector(".theater-curtains-screen");

describe("TheaterCurtains", () => {
  it("frames the bowl while theater mode is on, and is decoration only", () => {
    const { container } = render(<TheaterCurtains enabled />);
    const stage = container.querySelector(".theater-curtains");

    expect(stage).toHaveAttribute("aria-hidden", "true");
    expect(stage.querySelectorAll("polygon").length).toBeGreaterThan(0);
  });

  it("hangs nothing while theater mode is off", () => {
    const { container } = render(<TheaterCurtains enabled={false} />);

    expect(container.querySelector(".theater-curtains svg")).toBeNull();
  });

  it("lifts the curtains away once turned off", async () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<TheaterCurtains enabled />);
      rerender(<TheaterCurtains enabled={false} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(container.querySelector(".theater-curtains svg")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Turning it back on mid-close interrupts the close; the lift that was queued
  // behind it must not run anyway and take the curtains off a switch that is on.
  it("keeps the curtains when turned back on before they finish closing", async () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<TheaterCurtains enabled />);
      rerender(<TheaterCurtains enabled={false} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      rerender(<TheaterCurtains enabled />);
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(container.querySelector(".theater-curtains svg")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The television swaps the page for its draw screen, so the page's own pair
  // is gone by then; the screen-wide pair has to stand on its own.
  it("draws the screen-wide pair on its own for the television", () => {
    const { unmount } = render(
      <TheaterRevealCurtains origin={{ left: 100, top: 200, width: 600, height: 300 }} />
    );

    expect(screenCurtains()).not.toBeNull();
    expect(screenCurtains()).toHaveAttribute("aria-hidden", "true");
    unmount();
    expect(screenCurtains()).toBeNull();
  });
});
