import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TheaterModeToggle from "../TheaterModeToggle";

describe("TheaterModeToggle", () => {
  afterEach(() => cleanup());

  // A switch reports state; a button performs an action. The whole argument for
  // putting this on the bowl page rests on it being the former.
  it("is a switch that reports whether tonight has previews", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<TheaterModeToggle enabled={false} onToggle={onToggle} />);

    const off = screen.getByRole("switch", { name: "Previews first" });
    expect(off).toHaveAttribute("aria-checked", "false");
    fireEvent.click(off);
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(<TheaterModeToggle enabled onToggle={onToggle} onPreviewCountChange={vi.fn()} />);
    const on = screen.getByRole("switch", { name: "Previews first" });
    expect(on).toHaveAttribute("aria-checked", "true");
    fireEvent.click(on);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  // The count is a ceiling: buildTrailerQueue resolves up to it, so each option
  // promises "up to" rather than an exact number.
  it("shows the count as a 1-4 picker and sets it with a tap", () => {
    const onPreviewCountChange = vi.fn();
    render(<TheaterModeToggle enabled previewCount={3} onToggle={vi.fn()} onPreviewCountChange={onPreviewCountChange} />);

    const dots = screen.getAllByRole("radio");
    expect(dots.map((dot) => dot.getAttribute("aria-label"))).toEqual([
      "Up to 1 preview",
      "Up to 2 previews",
      "Up to 3 previews",
      "Up to 4 previews",
    ]);
    expect(dots.map((dot) => dot.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(screen.getByRole("radio", { name: "Up to 3 previews" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Up to 1 preview" }));
    expect(onPreviewCountChange).toHaveBeenCalledWith(1);
  });

  it("offers no count while it is off, because nothing will play", () => {
    render(<TheaterModeToggle enabled={false} previewCount={3} onToggle={vi.fn()} onPreviewCountChange={vi.fn()} />);

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  // role="radio" promises one Tab stop and arrow keys between the options.
  it("is one tab stop whose arrows move the count", () => {
    const onPreviewCountChange = vi.fn();
    render(
      <TheaterModeToggle enabled previewCount={2} onToggle={vi.fn()} onPreviewCountChange={onPreviewCountChange} />
    );

    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1, -1]);

    fireEvent.keyDown(radios[1], { key: "ArrowRight" });
    expect(onPreviewCountChange).toHaveBeenLastCalledWith(3);
    expect(radios[2]).toHaveFocus();

    fireEvent.keyDown(radios[1], { key: "ArrowLeft" });
    expect(onPreviewCountChange).toHaveBeenLastCalledWith(1);
  });
});
