import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TheaterTicket from "../TheaterTicket";

describe("TheaterTicket", () => {
  afterEach(() => cleanup());

  // A switch reports state; a button performs an action. The whole argument for
  // putting this on the bowl page rests on it being the former, so the role is
  // load-bearing rather than decoration.
  it("is a switch that reports whether tonight has previews", () => {
    render(<TheaterTicket enabled={false} onToggle={vi.fn()} />);

    const ticket = screen.getByRole("switch", { name: "Theater mode" });
    expect(ticket).toHaveAttribute("aria-checked", "false");
  });

  it("says so when it is armed", () => {
    render(<TheaterTicket enabled onToggle={vi.fn()} />);

    const ticket = screen.getByRole("switch", { name: "Theater mode on" });
    expect(ticket).toHaveAttribute("aria-checked", "true");
  });

  it("asks for the opposite of what it currently is", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<TheaterTicket enabled={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(<TheaterTicket enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  // The count is the account's and lives in Settings. buildTrailerQueue resolves
  // up to that many, so a ticket printing three could precede a pre-roll
  // announcing one.
  it("never prints a preview count it cannot promise", () => {
    render(<TheaterTicket enabled onToggle={vi.fn()} />);

    expect(screen.getByRole("switch").textContent).not.toMatch(/\d/);
  });
});
