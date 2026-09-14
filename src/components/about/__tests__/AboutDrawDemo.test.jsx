import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutDrawDemo from "../AboutDrawDemo";

describe("AboutDrawDemo", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("presents the sample bowl before anything is drawn", () => {
    render(<AboutDrawDemo />);

    expect(screen.getByRole("button", { name: /draw tonight's movie/i })).toBeInTheDocument();
    expect(screen.getByText(/75 movies · 2 members/i)).toBeInTheDocument();
    expect(screen.getByText(/every option has someone rooting for it/i)).toBeInTheDocument();
    expect(screen.getByText("You · 47")).toBeInTheDocument();
    expect(screen.getByText("Significant other · 28")).toBeInTheDocument();
  });

  it("draws a contributor first and then one of their sample movies", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.1);
    render(<AboutDrawDemo />);

    fireEvent.click(screen.getByRole("button", { name: /draw tonight's movie/i }));
    expect(screen.getByRole("button", { name: /drawing/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1280);
    });

    expect(screen.getAllByText("Arrival")).toHaveLength(2);
    expect(screen.getByText(/your significant other was selected first/i)).toBeInTheDocument();
    expect(
      screen.getByText(/arrival was drawn from your significant other's picks/i)
    ).toBeInTheDocument();
  });

  it("offers another draw once a result is on screen", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    render(<AboutDrawDemo />);

    fireEvent.click(screen.getByRole("button", { name: /draw tonight's movie/i }));
    act(() => {
      vi.advanceTimersByTime(1280);
    });

    expect(screen.getByRole("button", { name: /draw again/i })).toBeInTheDocument();
    expect(screen.queryByText(/every option has someone rooting for it/i)).not.toBeInTheDocument();
  });
});
