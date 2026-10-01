import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TheaterCurtains from "../TheaterCurtains";

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

  // The page's pair steps aside and a screen-wide pair opens on the reveal,
  // which sits above the draw stage and is gone once the movie opens.
  it("hands over to curtains across the whole screen for the draw", async () => {
    const { container, rerender } = render(<TheaterCurtains enabled isDrawing={false} />);
    expect(screenCurtains()).toBeNull();

    rerender(<TheaterCurtains enabled isDrawing />);
    await waitFor(() => expect(screenCurtains()).toHaveAttribute("aria-hidden", "true"));
    expect(container.querySelector(".theater-curtains svg")).toBeNull();

    rerender(<TheaterCurtains enabled isDrawing={false} />);
    expect(screenCurtains()).toBeNull();
    expect(container.querySelector(".theater-curtains svg")).not.toBeNull();
  });

  it("leaves the draw to the reveal alone when theater mode is off", () => {
    render(<TheaterCurtains enabled={false} isDrawing />);

    expect(screenCurtains()).toBeNull();
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
});
