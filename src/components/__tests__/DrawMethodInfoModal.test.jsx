import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DrawMethodInfoModal from "../DrawMethodInfoModal";
import { getDrawMethod } from "../../utils/drawMethods";

const FULL_REACH = { totalCount: 3, reachedCount: 3, excludedNames: [] };

describe("DrawMethodInfoModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the method's own disclosure copy", () => {
    render(<DrawMethodInfoModal drawMethod="person_first" onClose={() => {}} />);
    expect(screen.getByText(getDrawMethod("person_first").disclosure)).toBeInTheDocument();
  });

  it("stays quiet when every contributor is still reachable", () => {
    render(
      <DrawMethodInfoModal drawMethod="person_first" contributorReach={FULL_REACH} onClose={() => {}} />
    );

    expect(screen.getByText("How this bowl picks")).toBeInTheDocument();
    expect(screen.queryByText(/no movies from/i)).not.toBeInTheDocument();
  });

  it("names who the filters shut out and qualifies the equal-odds promise", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="person_first"
        contributorReach={{ totalCount: 3, reachedCount: 1, excludedNames: ["alex", "sam"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/No movies from alex or sam are in the pool\./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(getDrawMethod("person_first").reachCaveat))).toBeInTheDocument();
  });

  it("falls back to a count when the excluded contributors have no display name", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="person_first"
        contributorReach={{ totalCount: 3, reachedCount: 1, excludedNames: [] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/2 people have no movies left in the pool\./)).toBeInTheDocument();
  });

  it("reports the extra contributors it could not name", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="person_first"
        contributorReach={{ totalCount: 4, reachedCount: 1, excludedNames: ["alex"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/No movies from alex \(and 2 more\) are in the pool\./)).toBeInTheDocument();
  });

  // Title-first makes no equality promise, but "cannot be drawn at all" is
  // still worth saying, so it carries its own caveat rather than borrowing one.
  it("uses the title-first caveat for a title-first bowl", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="title_first"
        contributorReach={{ totalCount: 2, reachedCount: 1, excludedNames: ["sam"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(new RegExp(getDrawMethod("title_first").reachCaveat))).toBeInTheDocument();
  });

  it("explains rotation and uses its eligible-contributor caveat", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="rotation"
        contributorReach={{ totalCount: 2, reachedCount: 1, excludedNames: ["sam"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(getDrawMethod("rotation").disclosure)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(getDrawMethod("rotation").reachCaveat))).toBeInTheDocument();
  });

  it("closes from the button and the backdrop, but not the surface", () => {
    const onClose = vi.fn();
    render(<DrawMethodInfoModal drawMethod="person_first" onClose={onClose} />);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
