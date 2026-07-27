import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutDecisionSpectrum from "../AboutDecisionSpectrum";

describe("AboutDecisionSpectrum", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("opens the Movie Bowl demo by default on compact layouts", () => {
    render(<AboutDecisionSpectrum />);

    expect(screen.getByRole("tab", { name: "Movie Bowl" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("button", { name: /draw tonight's movie/i })).toBeInTheDocument();
    expect(screen.getByText(/75 movies\. two people/i)).toBeInTheDocument();
    expect(screen.getByText(/75 movies · 2 bowl members/i)).toBeInTheDocument();
    expect(screen.getByText(/every option has someone rooting for it/i)).toBeInTheDocument();
    expect(screen.queryByText(/every option is already a yes/i)).not.toBeInTheDocument();
  });

  it("supports arrow-key navigation between demo tabs", () => {
    render(<AboutDecisionSpectrum />);

    const bowlTab = screen.getByRole("tab", { name: "Movie Bowl" });
    fireEvent.keyDown(bowlTab, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "Recommendation" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("button", { name: /recommend another/i })).toBeInTheDocument();
  });

  it("advances the endless-browse demo", () => {
    render(<AboutDecisionSpectrum />);

    fireEvent.click(screen.getByRole("tab", { name: "Browse" }));
    expect(screen.getByText("12 minutes browsing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /keep browsing/i }));

    expect(screen.getByText("24 minutes browsing")).toBeInTheDocument();
    expect(screen.getByText("Mad Max: Fury Road")).toBeInTheDocument();
  });

  it("draws a contributor first and then one of their sample movies", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.1);
    render(<AboutDecisionSpectrum />);

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

  it("changes the algorithmic sample immediately", () => {
    render(<AboutDecisionSpectrum />);

    fireEvent.click(screen.getByRole("tab", { name: "Recommendation" }));
    expect(screen.getByText("Blade Runner 2049")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /recommend another/i }));

    expect(screen.getByText("Parasite")).toBeInTheDocument();
  });
});
