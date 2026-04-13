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
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

vi.mock("../components/TopNav", () => ({
  default: () => <div data-testid="top-nav" />,
}));

vi.mock("../screens/MyBowlsScreen", () => ({
  default: () => <div>My Bowls Screen</div>,
}));

vi.mock("../screens/BowlDashboard", () => ({
  default: () => <div>Bowl Dashboard Screen</div>,
}));

vi.mock("../screens/LoginPage", () => ({
  default: () => <div>Login Page</div>,
}));

vi.mock("../screens/UserSettings", () => ({
  default: () => <div>User Settings</div>,
}));

vi.mock("../screens/BowlSettings", () => ({
  default: () => <div>Bowl Settings</div>,
}));

vi.mock("../screens/RokuPocScreen", () => ({
  default: () => <div>Roku POC</div>,
}));

vi.mock("../screens/WatchListPage", () => ({
  default: () => <div>Watch List Page</div>,
}));

import App from "../App";

describe("App watch list route", () => {
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

  it("renders /watch-list when authenticated", async () => {
    mocks.auth = {
      session: { user: { id: "user-1", email: "user@example.com" } },
      loading: false,
      signOut: vi.fn(),
    };

    window.history.pushState({}, "", "/watch-list");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Watch List Page")).toBeInTheDocument();
    });
  });

  it("redirects /watch-list to /login when unauthenticated", async () => {
    window.history.pushState({}, "", "/watch-list");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
    expect(screen.queryByText("Watch List Page")).not.toBeInTheDocument();
  });
});
