import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DrawAnimationModal from "../DrawAnimationModal";

describe("DrawAnimationModal", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the draw status announcement", () => {
    render(<DrawAnimationModal />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/drawing a title from the bowl/i)).toBeInTheDocument();
    expect(screen.getByText(/movie bowl/i)).toBeInTheDocument();
  });

  it("progresses through the in-place draw phases over time", () => {
    vi.useFakeTimers();
    render(<DrawAnimationModal />);

    const overlay = screen.getByRole("status");
    expect(overlay).toHaveAttribute("data-phase", "enter");

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(overlay).toHaveAttribute("data-phase", "shake");

    act(() => {
      vi.advanceTimersByTime(620);
    });
    expect(overlay).toHaveAttribute("data-phase", "pop");

    act(() => {
      vi.advanceTimersByTime(420);
    });
    expect(overlay).toHaveAttribute("data-phase", "finish");
  });
});
