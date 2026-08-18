import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  poll: vi.fn(),
  complete: vi.fn(),
  toDataUrl: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: mocks.toDataUrl },
}));

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ completeTvPairing: mocks.complete }),
}));

vi.mock("../../lib/tvPairing", () => ({
  TvPairingError: class TvPairingError extends Error {
    constructor(message, { status = 0 } = {}) {
      super(message);
      this.status = status;
    }
  },
  startTvPairing: mocks.start,
  pollTvPairing: mocks.poll,
}));

import TvPairingPage from "../screens/TvPairingPage";

describe("TvPairingPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.start.mockReset().mockResolvedValue({
      deviceId: "device-1",
      deviceSecret: "device-secret",
      userCode: "ABCD-2345",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verificationUri: "https://moviebowl.app/activate-tv",
      verificationUriComplete: "https://moviebowl.app/activate-tv?code=ABCD-2345",
      pollIntervalSeconds: 2,
    });
    mocks.poll.mockReset().mockResolvedValue({
      status: "approved",
      tokenHash: "single-use-token-hash",
      verificationType: "magiclink",
    });
    mocks.complete.mockReset().mockResolvedValue({ error: null });
    mocks.toDataUrl.mockReset().mockResolvedValue("data:image/png;base64,qr-code");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("creates one request in Strict Mode and completes pairing after approval", async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <TvPairingPage />
        </MemoryRouter>
      </StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Connect Movie Bowl" })).toBeInTheDocument();
    expect(screen.getByText("ABCD-2345")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /scan to connect/i })).toHaveAttribute(
      "src",
      "data:image/png;base64,qr-code"
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mocks.poll).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith("single-use-token-hash", "magiclink");
    expect(screen.getByText(/approved — connecting your tv/i)).toBeInTheDocument();
  });
});
