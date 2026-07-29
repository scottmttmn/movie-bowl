import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    session: null,
    loading: false,
    signOut: vi.fn(),
  },
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

import App from "../App";

describe("App TV route", () => {
  beforeEach(() => {
    mocks.auth = {
      session: null,
      loading: false,
      signOut: vi.fn(),
    };
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

  it("redirects an unauthenticated television to login", async () => {
    window.history.pushState({}, "", "/tv");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
    expect(screen.queryByText("Movie Bowl TV App")).not.toBeInTheDocument();
  });
});
