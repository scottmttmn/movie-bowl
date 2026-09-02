import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    auth: {
      session: { user: { id: "user-1", email: "invitee@example.com" } },
      loading: false,
      signOut: vi.fn(),
    },
    navigateCalls: [],
    acceptedTokens: [],
    acceptResult: { data: "bowl-1", error: null },
  };

  const supabase = {
    auth: {
      // The pending-invites provider reads auth directly; these tests drive the
      // route through the mocked useAuth hook instead.
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
    rpc: vi.fn(async (name, params) => {
      if (name !== "accept_bowl_invite") return { data: null, error: null };
      state.acceptedTokens.push(params?.p_token);
      return state.acceptResult;
    }),
    from: vi.fn((table) => {
      const queryState = { table, action: "select", filters: [], payload: null };
      const query = {
        select: vi.fn(() => {
          queryState.action = "select";
          return query;
        }),
        insert: vi.fn((payload) => {
          queryState.action = "insert";
          queryState.payload = payload;
          return query;
        }),
        update: vi.fn((payload) => {
          queryState.action = "update";
          queryState.payload = payload;
          return query;
        }),
        eq: vi.fn((key, value) => {
          queryState.filters.push({ key, value });
          return query;
        }),
        single: vi.fn(async () => ({ data: null, error: null })),
        then: (resolve, reject) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
      };
      return query;
    }),
  };

  return { state, supabase };
});

vi.mock("../hooks/useAuth", () => ({
  default: () => mocks.state.auth,
}));

vi.mock("../lib/supabase", () => ({
  supabase: mocks.supabase,
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

import App from "../App";

describe("App accept invite route", () => {
  beforeEach(() => {
    mocks.state.auth = {
      session: { user: { id: "user-1", email: "invitee@example.com" } },
      loading: false,
      signOut: vi.fn(),
    };
    mocks.state.acceptedTokens = [];
    mocks.state.acceptResult = { data: "bowl-1", error: null };
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects unauthenticated users to login from the invite route", async () => {
    mocks.state.auth = {
      session: null,
      loading: false,
      signOut: vi.fn(),
    };
    window.history.pushState({}, "", "/accept-invite/token-123");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
  });

  it("accepts a valid invite in one call and navigates to the bowl", async () => {
    window.history.pushState({}, "", "/accept-invite/token-123");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Bowl Dashboard Screen")).toBeInTheDocument();
    });

    // Membership and finalization are the RPC's business, not two client writes.
    expect(mocks.state.acceptedTokens).toEqual(["token-123"]);
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("bowl_members");
  });

  it("reports a refused invite instead of claiming success", async () => {
    mocks.state.acceptResult = {
      data: null,
      error: { code: "P0001", message: "This invite is no longer available." },
    };
    window.history.pushState({}, "", "/accept-invite/token-123");

    render(<App />);

    await screen.findByText("This invite is no longer available.");
    expect(screen.queryByText("Bowl Dashboard Screen")).not.toBeInTheDocument();
  });
});
