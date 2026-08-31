import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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

function RouterObserver() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}

function renderPage(path = "/activate-tv?code=ABCD-2345", { withPreviousEntry = false } = {}) {
  return render(
    <MemoryRouter
      initialEntries={withPreviousEntry ? ["/before-pairing", path] : [path]}
      initialIndex={withPreviousEntry ? 1 : 0}
    >
      <RouterObserver />
      <Routes>
        <Route path="/activate-tv" element={<TvActivationPage />} />
        <Route path="/login" element={<div>Login destination</div>} />
        <Route path="/before-pairing" element={<div>Previous destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TvActivationPage", () => {
  beforeEach(() => {
    mocks.auth = { session: null, loading: false };
    mocks.approve.mockReset().mockResolvedValue({ ok: true });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("preserves the code while sending signed-out users through normal login", () => {
    renderPage();

    expect(screen.getByText("ABCD-2345")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign in to connect tv/i }));
    expect(screen.getByText("Login destination")).toBeInTheDocument();
  });

  it("remembers a successful approval and replaces the code URL in browser history", async () => {
    mocks.auth = {
      session: {
        access_token: "access-token",
        user: { id: "user-1", email: "viewer@example.com" },
      },
      loading: false,
    };
    renderPage(undefined, { withPreviousEntry: true });

    expect(screen.getByText(/connecting as/i)).toHaveTextContent("viewer@example.com");
    fireEvent.click(screen.getByRole("button", { name: /connect this tv/i }));

    await waitFor(() => {
      expect(mocks.approve).toHaveBeenCalledWith({
        code: "ABCD-2345",
        accessToken: "access-token",
      });
      expect(screen.getByText("TV connected")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/activate-tv$/);
    });

    fireEvent.click(screen.getByRole("button", { name: /browser back/i }));
    expect(await screen.findByText("Previous destination")).toBeInTheDocument();
  });

  it("renders a remembered code as completed without probing or offering approval again", async () => {
    mocks.auth = {
      session: {
        access_token: "access-token",
        user: { id: "user-1", email: "viewer@example.com" },
      },
      loading: false,
    };
    const firstVisit = renderPage();

    fireEvent.click(screen.getByRole("button", { name: /connect this tv/i }));
    await screen.findByText("TV connected");
    firstVisit.unmount();
    mocks.auth = { session: null, loading: false };

    renderPage();

    expect(screen.getByText("TV pairing completed")).toBeInTheDocument();
    expect(screen.getByText(/already been completed or expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect this tv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in to connect tv/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/code shown on tv/i)).not.toBeInTheDocument();
    expect(mocks.approve).toHaveBeenCalledTimes(1);
  });
});
