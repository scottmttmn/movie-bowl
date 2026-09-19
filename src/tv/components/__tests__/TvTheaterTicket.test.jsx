import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TvTheaterTicket from "../TvTheaterTicket";

describe("TvTheaterTicket", () => {
  afterEach(() => cleanup());

  it("is a switch that reports whether tonight has previews", () => {
    render(<TvTheaterTicket enabled={false} previewCount={3} onToggle={vi.fn()} />);

    const ticket = screen.getByRole("switch", { name: "Theater mode" });
    expect(ticket).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: /previews/i })).not.toBeInTheDocument();
  });

  // Both halves have to be reachable by remote, and neither may be held inside
  // a nav group: the switch is how the count is left again.
  it("gives the remote the count as its own focusable once it is on", () => {
    render(<TvTheaterTicket enabled previewCount={2} onToggle={vi.fn()} />);

    const count = screen.getByRole("button", { name: "Up to 2 previews, change" });
    expect(count).toHaveAttribute("data-tv-focusable");
    expect(screen.getByRole("switch", { name: "Theater mode on" })).toHaveAttribute(
      "data-tv-focusable"
    );
    expect(count.closest("[data-tv-nav-group]")).toBeNull();
  });

  it("walks the count with the one gesture a remote has", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <TvTheaterTicket enabled previewCount={3} onToggle={onToggle} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Up to 3 previews, change" }));
    expect(onToggle).toHaveBeenLastCalledWith("theaterTrailerCount", 4);

    rerender(<TvTheaterTicket enabled previewCount={4} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Up to 4 previews, change" }));
    expect(onToggle).toHaveBeenLastCalledWith("theaterTrailerCount", 1);
  });

  // The mark is a dot, and a dot inside a button that carries an aria-label is
  // silent: the whole accessible name comes from the label, so the divergence
  // has to be said there or not at all.
  it("says in the label what the divergence mark shows", () => {
    const { rerender } = render(
      <TvTheaterTicket enabled previewCount={1} onToggle={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Up to 1 previews, change" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Theater mode on" })).toBeInTheDocument();

    rerender(
      <TvTheaterTicket enabled previewCount={1} isOverridden isCountOverridden onToggle={vi.fn()} />
    );
    expect(
      screen.getByRole("button", { name: "Up to 1 previews, change, set on this TV" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Theater mode on, set on this TV" })
    ).toBeInTheDocument();
    expect(screen.queryAllByText("set on this TV")).toHaveLength(0);
  });
});
