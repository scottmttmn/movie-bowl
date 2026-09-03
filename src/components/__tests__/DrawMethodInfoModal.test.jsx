import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DrawMethodInfoModal from "../DrawMethodInfoModal";
import { getDrawMethod } from "../../utils/drawMethods";

const FULL_REACH = { totalCount: 3, reachedCount: 3, excludedNames: [] };

describe("DrawMethodInfoModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the method as ordered steps rather than a paragraph", () => {
    render(<DrawMethodInfoModal drawMethod="person_first" onClose={() => {}} />);

    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent("A person, at random");
    expect(steps[1]).toHaveTextContent("One of their movies");
    // Pins live under step two, which is what makes "pinning never changes who
    // is selected" visible without a sentence saying so.
    expect(steps[0]).not.toHaveTextContent(/pinned/i);
    expect(steps[1]).toHaveTextContent(/pinned/i);
  });

  it("carries a footnote only where the method needs one", () => {
    const { unmount } = render(<DrawMethodInfoModal drawMethod="person_first" onClose={() => {}} />);
    expect(screen.queryByText(getDrawMethod("title_first").footnote)).not.toBeInTheDocument();
    unmount();

    render(<DrawMethodInfoModal drawMethod="title_first" onClose={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(getDrawMethod("title_first").footnote)).toBeInTheDocument();
  });

  it("stays quiet when every contributor is still reachable", () => {
    render(
      <DrawMethodInfoModal drawMethod="person_first" contributorReach={FULL_REACH} onClose={() => {}} />
    );

    expect(screen.getByText("How this bowl picks")).toBeInTheDocument();
    expect(screen.queryByText(/left out/i)).not.toBeInTheDocument();
  });

  it("names who the filters shut out and qualifies the equal-odds promise", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="person_first"
        contributorReach={{ totalCount: 3, reachedCount: 1, excludedNames: ["alex", "sam"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/alex and sam are left out — your filters removed every movie they added\./)).toBeInTheDocument();
  });

  it("falls back to a count when the excluded contributors have no display name", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="person_first"
        contributorReach={{ totalCount: 3, reachedCount: 1, excludedNames: [] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/2 people are left out — your filters removed every movie they added\./)).toBeInTheDocument();
  });

  it("reports the extra contributors it could not name", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="person_first"
        contributorReach={{ totalCount: 4, reachedCount: 1, excludedNames: ["alex"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/alex and 2 more are left out — your filters removed every movie they added\./)).toBeInTheDocument();
  });

  // The shared sentence already says why someone is out. Only rotation needs to
  // add anything, because for it the exclusion is temporary.
  it("adds nothing beyond the shared sentence for title-first", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="title_first"
        contributorReach={{ totalCount: 2, reachedCount: 1, excludedNames: ["sam"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/sam is left out — your filters removed every movie they added\./)).toBeInTheDocument();
  });

  it("says the exclusion is temporary in a rotation bowl", () => {
    render(
      <DrawMethodInfoModal
        drawMethod="rotation"
        contributorReach={{ totalCount: 2, reachedCount: 1, excludedNames: ["sam"] }}
        onClose={() => {}}
      />
    );

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Whoever has waited longest");
    expect(screen.getByText(/They rejoin when one of their movies is eligible again\./)).toBeInTheDocument();
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
