import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WatchedYearLine from "../WatchedYearLine";

describe("WatchedYearLine", () => {
  afterEach(cleanup);

  it("reads as one sentence with the year as its picker", () => {
    const onYearChange = vi.fn();
    render(<WatchedYearLine count={12} years={[2026, 2025]} activeYear={2026} onYearChange={onYearChange} allTimeCount={40} />);

    const year = screen.getByRole("combobox", { name: "Year watched" });
    expect(year).toHaveValue("2026");
    expect(screen.getByTestId("watched-year-line")).toHaveTextContent(/^12 watched in2026.*·40 all time$/);

    fireEvent.change(year, { target: { value: "2025" } });
    expect(onYearChange).toHaveBeenCalledWith(2025);
  });

  it("drops the picker for one year and the all-time count when it only repeats", () => {
    render(<WatchedYearLine count={68} years={[2026]} activeYear={2026} onYearChange={vi.fn()} allTimeCount={68} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("watched-year-line")).toHaveTextContent(/^68 watched in2026$/);
  });

  it("leaves the all-time count out where none is given", () => {
    render(<WatchedYearLine count={2} years={[2026, 2025]} activeYear={2025} onYearChange={vi.fn()} />);

    expect(screen.getByTestId("watched-year-line")).not.toHaveTextContent(/all time/);
  });
});
