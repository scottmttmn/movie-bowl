import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FilterChipSelect from "../FilterChipSelect";

describe("FilterChipSelect", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders selected chips with only actions and handles quick actions", () => {
    const onToggle = vi.fn();
    const onOnly = vi.fn();
    const onSelectAll = vi.fn();
    const onClear = vi.fn();
    const onToggleUnknown = vi.fn();

    render(
      <FilterChipSelect
        ariaLabel="Draw rating controls"
        options={["PG", "PG-13", "R"]}
        selectedValues={["PG-13"]}
        optionAriaLabelPrefix="Draw rating"
        onToggle={onToggle}
        onOnly={onOnly}
        onSelectAll={onSelectAll}
        onClear={onClear}
        unknownEnabled
        unknownLabel="Unrated/Unknown"
        onToggleUnknown={onToggleUnknown}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Draw rating PG$/i }));
    expect(onToggle).toHaveBeenCalledWith("PG");

    fireEvent.click(screen.getByRole("button", { name: /only PG-13/i }));
    expect(onOnly).toHaveBeenCalledWith("PG-13");

    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));
    expect(onSelectAll).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(onClear).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /unrated\/unknown/i }));
    expect(onToggleUnknown).toHaveBeenCalledWith(false);
  });
});
