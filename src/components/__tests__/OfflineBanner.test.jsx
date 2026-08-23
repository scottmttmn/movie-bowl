import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfflineBanner from "../OfflineBanner";

function setOnLine(value) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

function fireConnectionEvent(name) {
  act(() => {
    window.dispatchEvent(new Event(name));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("stays out of the way while online", () => {
    setOnLine(true);
    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("explains the dropped connection when the browser starts offline", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline. Nothing will save until you reconnect."
    );
  });

  it("appears when the connection drops mid-session", () => {
    setOnLine(true);
    render(<OfflineBanner />);

    setOnLine(false);
    fireConnectionEvent("offline");

    expect(screen.getByRole("status")).toHaveTextContent("You're offline.");
  });

  it("confirms recovery and then gets out of the way", () => {
    setOnLine(false);
    render(<OfflineBanner />);

    setOnLine(true);
    fireConnectionEvent("online");
    expect(screen.getByRole("status")).toHaveTextContent("Back online.");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("does not announce a recovery that never followed an outage", () => {
    setOnLine(true);
    render(<OfflineBanner />);

    fireConnectionEvent("online");

    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });
});
