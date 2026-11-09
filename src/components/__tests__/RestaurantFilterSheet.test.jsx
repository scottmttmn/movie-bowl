import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RestaurantFilterSheet from "../RestaurantFilterSheet";

const choices = ["Pizza", "Thai", "Mexican", "Other"];

function renderSheet(excluded, onChange = vi.fn()) {
  render(
    <RestaurantFilterSheet choices={choices} excluded={excluded} onChange={onChange} summary="" onClose={vi.fn()} />
  );
  return onChange;
}

describe("RestaurantFilterSheet", () => {
  afterEach(cleanup);

  it("says what is in the draw the shorter way round", () => {
    renderSheet([]);
    expect(screen.getByText("All", { selector: "p" })).toBeInTheDocument();
    cleanup();
    renderSheet(["Thai"]);
    expect(screen.getByText("All but Thai", { selector: "p" })).toBeInTheDocument();
    cleanup();
    renderSheet(["Thai", "Mexican", "Other"]);
    expect(screen.getByText("Pizza", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Only Thai" })).not.toBeInTheDocument();
    cleanup();
    renderSheet(choices);
    expect(screen.getByText("None", { selector: "p" })).toBeInTheDocument();
  });

  it("toggles one cuisine, keeps only one, or takes them all in or out", () => {
    const onChange = renderSheet(["Thai"]);
    fireEvent.click(screen.getByRole("button", { name: "Thai", pressed: false }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: "Pizza", pressed: true }));
    expect(onChange).toHaveBeenLastCalledWith(["Thai", "Pizza"]);
    fireEvent.click(screen.getByRole("button", { name: "Only Mexican" }));
    expect(onChange).toHaveBeenLastCalledWith(["Pizza", "Thai", "Other"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith(choices);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
