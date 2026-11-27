import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RuntimeRangeSlider from "../RuntimeRangeSlider";
import { RUNTIME_FILTER_MAX_MINUTES } from "../../utils/drawSettings";

function renderSlider(props = {}) {
  const onChange = vi.fn();
  const onToggleUnknown = vi.fn();
  const view = render(
    <RuntimeRangeSlider
      idPrefix="test"
      minMinutes={0}
      maxMinutes={RUNTIME_FILTER_MAX_MINUTES}
      includeUnknown
      onChange={onChange}
      onToggleUnknown={onToggleUnknown}
      {...props}
    />
  );
  return { ...view, onChange, onToggleUnknown };
}

describe("RuntimeRangeSlider", () => {
  it("shows an untouched range as the whole track, with no limit at the right end", () => {
    renderSlider();
    expect(screen.getByRole("slider", { name: "Shortest length" })).toHaveValue("0");
    expect(screen.getByRole("slider", { name: "Shortest length" })).toHaveAttribute("aria-valuetext", "No minimum");
    expect(screen.getByRole("slider", { name: "Longest length" })).toHaveValue("180");
    expect(screen.getByRole("slider", { name: "Longest length" })).toHaveAttribute("aria-valuetext", "No limit");
  });

  it("writes the right end back as no limit rather than three hours", () => {
    const { onChange } = renderSlider({ maxMinutes: 120 });
    fireEvent.change(screen.getByRole("slider", { name: "Longest length" }), { target: { value: "180" } });
    expect(onChange).toHaveBeenLastCalledWith({ minMinutes: 0, maxMinutes: RUNTIME_FILTER_MAX_MINUTES });
  });

  it("narrows either end and keeps the thumbs from crossing", () => {
    const { onChange } = renderSlider({ minMinutes: 60, maxMinutes: 120 });
    fireEvent.change(screen.getByRole("slider", { name: "Longest length" }), { target: { value: "105" } });
    expect(onChange).toHaveBeenLastCalledWith({ minMinutes: 60, maxMinutes: 105 });
    fireEvent.change(screen.getByRole("slider", { name: "Shortest length" }), { target: { value: "150" } });
    expect(onChange).toHaveBeenLastCalledWith({ minMinutes: 120, maxMinutes: 120 });
    fireEvent.change(screen.getByRole("slider", { name: "Longest length" }), { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith({ minMinutes: 60, maxMinutes: 60 });
  });

  it("toggles titles with no known length", () => {
    const { onToggleUnknown, rerender } = renderSlider();
    const unknown = screen.getByRole("button", { name: "Unknown length" });
    expect(unknown).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(unknown);
    expect(onToggleUnknown).toHaveBeenCalledWith(false);
    rerender(
      <RuntimeRangeSlider idPrefix="test" minMinutes={0} maxMinutes={500} includeUnknown={false} onChange={vi.fn()} onToggleUnknown={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Unknown length" })).toHaveAttribute("aria-pressed", "false");
  });

  it("lights the bowl's slips inside the range and greys the rest", () => {
    const { container } = renderSlider({ maxMinutes: 120, runtimes: [95, 110, 150, 228, null, 0] });
    const dots = [...container.querySelectorAll(".runtime-range-dot")];
    const known = dots.filter((dot) => !dot.classList.contains("is-unknown"));
    const unknown = dots.filter((dot) => dot.classList.contains("is-unknown"));
    expect(known).toHaveLength(4);
    expect(known.filter((dot) => dot.classList.contains("is-in"))).toHaveLength(2);
    // No runtime and a zero runtime are both unknown, and stay in while ? is on.
    expect(unknown).toHaveLength(2);
    expect(unknown.every((dot) => dot.classList.contains("is-in"))).toBe(true);
  });

  it("judges each slip by its own length, the way the draw does", () => {
    const { container } = renderSlider({ minMinutes: 0, maxMinutes: 120, runtimes: [115, 120, 125] });
    // All three round into the two-hour column; only the 125-minute one is cut.
    const column = container.querySelector(".runtime-range-dots .runtime-range-column");
    const dots = [...column.children];
    expect(dots).toHaveLength(3);
    expect(dots.map((dot) => dot.classList.contains("is-in"))).toEqual([true, true, false]);
  });

  it("greys a column from the bottom when a minimum cuts it", () => {
    const { container } = renderSlider({ minMinutes: 120, runtimes: [115, 120, 125] });
    const dots = [...container.querySelector(".runtime-range-dots .runtime-range-column").children];
    expect(dots.map((dot) => dot.classList.contains("is-in"))).toEqual([false, true, true]);
  });

  it("keeps an old limit past the end of the scale a limit", () => {
    const { container } = renderSlider({ maxMinutes: 200, runtimes: [190, 228] });
    const longest = screen.getByRole("slider", { name: "Longest length" });
    expect(longest).toHaveValue("180");
    expect(longest).toHaveAttribute("aria-valuetext", "3 hr 20 min");
    const dots = [...container.querySelectorAll(".runtime-range-dot")];
    expect(dots.filter((dot) => dot.classList.contains("is-in"))).toHaveLength(1);
  });

  it("puts the thumb that can still move on top where the two meet", () => {
    const { rerender } = renderSlider({ minMinutes: 0, maxMinutes: 0 });
    const zIndex = (name) => Number(screen.getByRole("slider", { name }).style.zIndex);
    expect(zIndex("Longest length")).toBeGreaterThan(zIndex("Shortest length"));
    rerender(
      <RuntimeRangeSlider idPrefix="test" minMinutes={180} maxMinutes={500} includeUnknown onChange={vi.fn()} onToggleUnknown={vi.fn()} />
    );
    expect(zIndex("Shortest length")).toBeGreaterThan(zIndex("Longest length"));
  });

  it("scales a big bowl's stacks down instead of cutting them off", () => {
    const runtimes = [...Array(30).fill(120), ...Array(3).fill(90)];
    const { container } = renderSlider({ runtimes });
    const columns = [...container.querySelectorAll(".runtime-range-dots .runtime-range-column")];
    const heights = columns.map((column) => column.children.length).sort((a, b) => a - b);
    expect(heights).toEqual([1, 6]);
  });

  it("draws no slips when it is not given the bowl's lengths", () => {
    const { container } = renderSlider();
    expect(container.querySelector(".runtime-range-dots")).toBeNull();
  });
});
