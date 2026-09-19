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

  // The switch itself still prints no number: buildTrailerQueue resolves up to
  // the count, so the promise stays on the stub beside it, where the label says
  // "up to".
  it("keeps the count off the switch and on its own stub", () => {
    render(<TheaterTicket enabled previewCount={3} onToggle={vi.fn()} onPreviewCountChange={vi.fn()} />);

    expect(screen.getByRole("switch").textContent).not.toMatch(/\d/);
    expect(screen.getByRole("button", { name: "Up to 3 previews, change" })).toHaveTextContent("3");
  });

  it("offers no count while it is off, because nothing will play", () => {
    render(<TheaterTicket enabled={false} previewCount={3} onToggle={vi.fn()} onPreviewCountChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /previews/i })).not.toBeInTheDocument();
  });

  it("walks the count and comes back round to one", () => {
    const onPreviewCountChange = vi.fn();
    const { rerender } = render(
      <TheaterTicket enabled previewCount={3} onToggle={vi.fn()} onPreviewCountChange={onPreviewCountChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Up to 3 previews, change" }));
    expect(onPreviewCountChange).toHaveBeenLastCalledWith(4);

    rerender(
      <TheaterTicket enabled previewCount={4} onToggle={vi.fn()} onPreviewCountChange={onPreviewCountChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Up to 4 previews, change" }));
    expect(onPreviewCountChange).toHaveBeenLastCalledWith(1);
  });

  // A device that stored a count before the options changed, or never stored
  // one at all, still has to land on a real option rather than cycling from
  // nothing.
  it("starts from the default when the stored count is unusable", () => {
    render(<TheaterTicket enabled previewCount={undefined} onToggle={vi.fn()} onPreviewCountChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Up to 3 previews, change" })).toBeInTheDocument();
  });
});
