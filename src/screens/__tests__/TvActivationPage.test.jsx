import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { session: null, loading: false },
  approve: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  default: () => mocks.auth,
}));

vi.mock("../../lib/tvPairing", () => ({
  approveTvPairing: mocks.approve,
}));

import TvActivationPage from "../TvActivationPage";

function renderPage(path = "/activate-tv?code=ABCD-2345") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/activate-tv" element={<TvActivationPage />} />
        <Route path="/login" element={<div>Login destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TvActivationPage", () => {
  beforeEach(() => {
    mocks.auth = { session: null, loading: false };
    mocks.approve.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => cleanup());

  it("preserves the code while sending signed-out users through normal login", () => {
    renderPage();

    expect(screen.getByText("ABCD-2345")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign in to connect tv/i }));
    expect(screen.getByText("Login destination")).toBeInTheDocument();
  });

  it("requires explicit approval from the signed-in account", async () => {
    mocks.auth = {
      session: {
        access_token: "access-token",
        user: { id: "user-1", email: "viewer@example.com" },
      },
      loading: false,
    };
    renderPage();

    expect(screen.getByText(/connecting as/i)).toHaveTextContent("viewer@example.com");
    fireEvent.click(screen.getByRole("button", { name: /connect this tv/i }));

    await waitFor(() => {
      expect(mocks.approve).toHaveBeenCalledWith({
        code: "ABCD-2345",
        accessToken: "access-token",
      });
      expect(screen.getByText("TV connected")).toBeInTheDocument();
    });
  });
});
