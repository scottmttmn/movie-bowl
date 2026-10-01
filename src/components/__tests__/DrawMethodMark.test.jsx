import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DrawMethodMark from "../DrawMethodMark";

describe("DrawMethodMark", () => {
  afterEach(cleanup);

  it("badges the slip with a person only for methods that pick a person first", () => {
    for (const [method, label, badged] of [
      ["person_first", "Person-first random draw", true],
      ["rotation", "Contributor rotation", true],
      ["title_first", "Title-first random draw", false],
    ]) {
      render(<DrawMethodMark drawMethod={method} />);
      const mark = screen.getByRole("img", { name: label });
      expect(Boolean(mark.querySelector("[data-person-badge]"))).toBe(badged);
      cleanup();
    }
  });

  it("falls back to the default method for a value it does not know", () => {
    render(<DrawMethodMark drawMethod="from_a_newer_deploy" />);
    expect(screen.getByRole("img", { name: "Person-first random draw" })).toHaveAttribute(
      "data-method",
      "person_first"
    );
  });
});
