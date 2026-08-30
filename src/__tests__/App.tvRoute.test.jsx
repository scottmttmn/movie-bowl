import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    session: null,
    loading: false,
    signOut: vi.fn(),
  },
  updateReady: false,
}));

vi.mock("../hooks/useAppUpdate", () => ({
  default: () => ({ updateReady: mocks.updateReady }),
}));

vi.mock("../hooks/useAuth", () => ({
  default: () => mocks.auth,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
    from: vi.fn(),
  },
}));

vi.mock("../components/TopNav", () => ({
  default: () => <div data-testid="top-nav" />,
}));

vi.mock("../screens/LoginPage", () => ({
  default: () => <div>Login Page</div>,
}));

vi.mock("../tv/TvApp", () => ({
  default: () => <div>Movie Bowl TV App</div>,
}));

vi.mock("../tv/TvAuthGate", () => ({
  default: ({ children }) =>
    mocks.auth.session ? children : <div>Connect Movie Bowl TV</div>,
}));

import App from "../App";

describe("App TV route", () => {
  beforeEach(() => {
    mocks.auth = {
      session: null,
      loading: false,
      signOut: vi.fn(),
    };
    mocks.updateReady = false;
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dedicated TV app without the standard navigation", async () => {
    mocks.auth = {
      session: { user: { id: "user-1", email: "viewer@example.com" } },
      loading: false,
      signOut: vi.fn(),
    };
    window.history.pushState({}, "", "/tv");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Movie Bowl TV App")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("top-nav")).not.toBeInTheDocument();
  });

  it("keeps the update notice off the TV, which cannot focus or fit it", async () => {
    mocks.auth = {
      session: { user: { id: "user-1", email: "viewer@example.com" } },
      loading: false,
      signOut: vi.fn(),
    };
    mocks.updateReady = true;
    window.history.pushState({}, "", "/tv");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Movie Bowl TV App")).toBeInTheDocument();
    });
    // The TV still reloads itself; it just never renders the banner.
    expect(screen.queryByTestId("update-banner")).not.toBeInTheDocument();
  });

  it("shows TV pairing instead of the standard login to an unauthenticated television", async () => {
    window.history.pushState({}, "", "/tv");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Connect Movie Bowl TV")).toBeInTheDocument();
    });
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
    expect(screen.queryByText("Movie Bowl TV App")).not.toBeInTheDocument();
  });
});
