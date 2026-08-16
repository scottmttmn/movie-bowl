import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DrawMethodDisclosure from "../DrawMethodDisclosure";
import { getDrawMethod } from "../../utils/drawMethods";

const FULL_REACH = { totalCount: 3, reachedCount: 3, excludedNames: [] };

describe("DrawMethodDisclosure", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the method's own disclosure copy", () => {
    render(<DrawMethodDisclosure drawMethod="person_first" />);
    expect(screen.getByText(getDrawMethod("person_first").disclosure)).toBeInTheDocument();
  });

  it("stays quiet when every contributor is still reachable", () => {
    render(<DrawMethodDisclosure drawMethod="person_first" contributorReach={FULL_REACH} />);

    expect(screen.getByText("How this bowl picks")).toBeInTheDocument();
    expect(screen.queryByText(/no movies from/i)).not.toBeInTheDocument();
  });

  it("names who the filters shut out and qualifies the equal-odds promise", () => {
    render(
      <DrawMethodDisclosure
        drawMethod="person_first"
        contributorReach={{ totalCount: 3, reachedCount: 1, excludedNames: ["alex", "sam"] }}
      />
    );

    expect(screen.getByText(/some people are filtered out/i)).toBeInTheDocument();
    expect(screen.getByText(/No movies from alex or sam are in the pool\./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(getDrawMethod("person_first").reachCaveat))).toBeInTheDocument();
  });

  it("falls back to a count when the excluded contributors have no display name", () => {
    render(
      <DrawMethodDisclosure
        drawMethod="person_first"
        contributorReach={{ totalCount: 3, reachedCount: 1, excludedNames: [] }}
      />
    );

    expect(screen.getByText(/2 people have no movies left in the pool\./)).toBeInTheDocument();
  });

  it("reports the extra contributors it could not name", () => {
    render(
      <DrawMethodDisclosure
        drawMethod="person_first"
        contributorReach={{ totalCount: 4, reachedCount: 1, excludedNames: ["alex"] }}
      />
    );

    expect(screen.getByText(/No movies from alex \(and 2 more\) are in the pool\./)).toBeInTheDocument();
  });

  // Title-first makes no equality promise, but "cannot be drawn at all" is
  // still worth saying, so it carries its own caveat rather than borrowing one.
  it("uses the title-first caveat for a title-first bowl", () => {
    render(
      <DrawMethodDisclosure
        drawMethod="title_first"
        contributorReach={{ totalCount: 2, reachedCount: 1, excludedNames: ["sam"] }}
      />
    );

    expect(screen.getByText(new RegExp(getDrawMethod("title_first").reachCaveat))).toBeInTheDocument();
  });
});
