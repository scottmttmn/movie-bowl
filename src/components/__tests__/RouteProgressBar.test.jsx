import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import RouteProgressBar from "../RouteProgressBar";
import { resetRouteLoading, trackRouteLoad } from "../../utils/routeLoading";

describe("RouteProgressBar", () => {
  // vite.config.js does not set `globals`, so @testing-library/react registers
  // no automatic cleanup and a render survives into the next test. Both of
  // these render the same component, so without this the second one finds two.
  afterEach(() => {
    cleanup();
    act(() => resetRouteLoading());
  });

  it("shows nothing while no screen is loading", () => {
    render(<RouteProgressBar />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // Navigation runs inside a transition, so the previous screen stays on the
  // page while the next screen's code downloads. Without this the tap has no
  // visible answer at all.
  it("appears while a screen's code is in flight and leaves when it lands", async () => {
    render(<RouteProgressBar />);

    let arrive;
    let inFlight;
    act(() => {
      inFlight = trackRouteLoad(new Promise((resolve) => { arrive = resolve; }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading page…");

    await act(async () => {
      arrive();
      await inFlight;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
