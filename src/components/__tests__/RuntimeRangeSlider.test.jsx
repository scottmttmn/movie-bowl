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
