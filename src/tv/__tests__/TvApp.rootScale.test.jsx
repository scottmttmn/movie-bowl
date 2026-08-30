import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ session: { user: { id: "user-1", email: "viewer@example.com" } } }),
}));

vi.mock("../screens/TvBowlPicker", () => ({ default: () => <div>Picker</div> }));
vi.mock("../screens/TvTonightScreen", () => ({ default: () => <div>Tonight</div> }));

import TvApp from "../TvApp";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("tv-root");
});

describe("TV root scale marker", () => {
  // The type ramp is sized from the document root, which the TV stylesheet
  // cannot reach from inside .tv-app. Losing this class silently returns the
  // whole ramp to the browser default, which reads as unusably small on a
  // television, so it is pinned here rather than left to the markup.
  it("marks the document root while the TV experience is mounted", () => {
    const view = render(
      <MemoryRouter initialEntries={["/tv/bowls"]}>
        <TvApp />
      </MemoryRouter>
    );

    expect(document.documentElement).toHaveClass("tv-root");

    view.unmount();

    expect(document.documentElement).not.toHaveClass("tv-root");
  });
});
