import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function Marker() {
  return <p>only mine</p>;
}

/**
 * Guards the cleanup registered in setup.js.
 *
 * Without it every render stays mounted for the rest of the file, and the
 * damage is not a red test -- it is a query that should have been ambiguous
 * resolving against DOM an earlier test left behind, so the suite goes green
 * for the wrong reason. That is invisible by construction, which is why it
 * gets a test of its own rather than being left to show up somewhere else.
 */
describe("renders do not leak between tests", () => {
  it("mounts one", () => {
    render(<Marker />);
    expect(screen.getAllByText("only mine")).toHaveLength(1);
  });

  it("sees its own render and not the previous one", () => {
    render(<Marker />);
    expect(screen.getAllByText("only mine")).toHaveLength(1);
  });
});
