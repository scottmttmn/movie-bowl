import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BowlIllustration from "../BowlIllustration";

describe("BowlIllustration", () => {
  afterEach(() => {
    cleanup();
  });

  const stageFor = (props) => render(<BowlIllustration {...props} />).container.firstChild;

  it("sits still by default", () => {
    const stage = stageFor();
    expect(stage).not.toHaveClass("is-holding");
    expect(stage).not.toHaveClass("is-nudged");
  });

  it("shakes while the draw button is held", () => {
    expect(stageFor({ holdState: "holding" })).toHaveClass("is-holding");
  });

  it("wobbles once for a tap", () => {
    const stage = stageFor({ holdState: "tap" });
    expect(stage).toHaveClass("is-nudged");
    expect(stage).not.toHaveClass("is-holding");
  });
});
