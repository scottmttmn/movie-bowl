import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "../AppErrorBoundary";

function Boom({ message }) {
  throw new Error(message);
}

function setOnLine(value) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

beforeEach(() => {
  setOnLine(true);
  // The boundary logs the failure on purpose; React logs it again itself.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("AppErrorBoundary", () => {
  it("renders its children while nothing is wrong", () => {
    render(
      <AppErrorBoundary>
        <p>Bowl contents</p>
      </AppErrorBoundary>
    );

    expect(screen.getByText("Bowl contents")).toBeInTheDocument();
    expect(screen.queryByTestId("app-error-boundary")).not.toBeInTheDocument();
  });

  it("reloads once when a screen's chunk went missing under a deploy", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload });

    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/BowlDashboard-a1b2c3.js" />
      </AppErrorBoundary>
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("app-error-boundary")).toHaveTextContent(
      "Movie Bowl was just updated. Reload to pick up the new version."
    );
  });

  it("explains an ordinary failure instead of leaving a blank page", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload });

    render(
      <AppErrorBoundary>
        <Boom message="Cannot read properties of undefined" />
      </AppErrorBoundary>
    );

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong loading this page."
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload Movie Bowl" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a second time inside the guard window", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload });
    window.sessionStorage.setItem("movie-bowl:build-reload", String(Date.now()));

    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module" />
      </AppErrorBoundary>
    );

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByTestId("app-error-boundary")).toBeInTheDocument();
  });
});
