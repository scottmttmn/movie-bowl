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
    invite: {
      id: "invite-1",
      bowl_id: "bowl-1",
      invited_email: "invitee@example.com",
      accepted_at: null,
    },
    memberInsertError: null,
    inviteUpdateError: null,
  };

  const supabase = {
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
        single: vi.fn(async () => {
          if (table === "bowl_invites" && queryState.action === "select") {
            return { data: state.invite, error: state.invite ? null : { message: "Not found" } };
          }
          return { data: null, error: null };
        }),
        then: (resolve, reject) => {
          if (table === "bowl_members" && queryState.action === "insert") {
            return Promise.resolve({ data: queryState.payload, error: state.memberInsertError }).then(resolve, reject);
          }
          if (table === "bowl_invites" && queryState.action === "update") {
            return Promise.resolve({ data: queryState.payload, error: state.inviteUpdateError }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
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
    mocks.state.invite = {
      id: "invite-1",
      bowl_id: "bowl-1",
      invited_email: "invitee@example.com",
      accepted_at: null,
    };
    mocks.state.memberInsertError = null;
    mocks.state.inviteUpdateError = null;
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

  it("accepts a valid invite and navigates to the bowl", async () => {
    window.history.pushState({}, "", "/accept-invite/token-123");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Bowl Dashboard Screen")).toBeInTheDocument();
    });

    expect(mocks.supabase.from).toHaveBeenCalledWith("bowl_invites");
    expect(mocks.supabase.from).toHaveBeenCalledWith("bowl_members");
  });
});
