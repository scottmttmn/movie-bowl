import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(),
    authCallCount: 0,
    initialAuthenticated: false,
    rpcRows: [],
    insertedBowls: [],
    insertedMembers: [],
    insertedInvites: [],
    streamingServices: [],
    streamingServicesLoading: false,
    sendInviteEmailsResult: { sent: 1, failed: 0, results: [{ email: "friend@example.com", ok: true }], error: null },
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => {
        state.authCallCount += 1;
        if (state.authCallCount === 1 && !state.initialAuthenticated) {
          return { data: { session: null }, error: new Error("Not authenticated") };
        }
        return { data: { session: { user: { id: "u1" } } }, error: null };
      }),
    },
    rpc: vi.fn(async () => ({ data: state.rpcRows, error: null })),
    from: vi.fn((table) => {
      if (table === "bowls") {
        const ctx = { insertRows: null, selectMode: false };
        const query = {
          insert: vi.fn((rows) => {
            ctx.insertRows = rows;
            mocks.state.insertedBowls.push(rows);
            return query;
          }),
          select: vi.fn(() => {
            ctx.selectMode = true;
            return query;
          }),
          eq: vi.fn(() => query),
          single: vi.fn(async () => {
            if (ctx.insertRows && ctx.selectMode) {
              const row = ctx.insertRows[0];
              return {
                data: { id: "bowl-1", name: row.name },
                error: null,
              };
            }
            return { data: null, error: null };
          }),
          then: (resolve, reject) => {
            if (ctx.selectMode && !ctx.insertRows) {
              const ownedRows = mocks.state.rpcRows
                .filter((row) => row.owner_id === "u1")
                .map((row) => ({ id: row.id }));
              return Promise.resolve({ data: ownedRows, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return query;
      }

      if (table === "bowl_members") {
        return {
          insert: vi.fn(async (rows) => {
            mocks.state.insertedMembers.push(rows);
            return { error: null };
          }),
          select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
        };
      }

      if (table === "bowl_invites") {
        return {
          insert: vi.fn(async (rows) => {
            mocks.state.insertedInvites.push(rows);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { state, supabase };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/inviteEmails", () => ({
  sendInviteEmails: vi.fn(async () => mocks.state.sendInviteEmailsResult),
}));
vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.state.streamingServices,
    defaultDrawSettings: {},
    setStreamingServices: vi.fn(),
    setDefaultDrawSettings: vi.fn(),
    toggleService: vi.fn(),
    loading: mocks.state.streamingServicesLoading,
    reloadStreamingServices: vi.fn(),
    saveStreamingServices: vi.fn(),
    saveDefaultDrawSettings: vi.fn(),
  }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
  };
});

import MyBowlsScreen from "../MyBowlsScreen";

describe("MyBowlsScreen", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authCallCount = 0;
    mocks.state.initialAuthenticated = false;
    mocks.state.rpcRows = [];
    mocks.state.insertedBowls = [];
    mocks.state.insertedMembers = [];
    mocks.state.insertedInvites = [];
    mocks.state.streamingServices = [];
    mocks.state.streamingServicesLoading = false;
    mocks.state.sendInviteEmailsResult = {
      sent: 1,
      failed: 0,
      results: [{ email: "friend@example.com", ok: true }],
      error: null,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("shows guided setup when the user has no bowls", async () => {
    mocks.state.initialAuthenticated = true;

    render(<MyBowlsScreen />);

    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());

    expect(
      screen.getByText(/pick your streaming services, then create a bowl for yourself or your group/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create your first bowl/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up streaming services/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up services/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create bowl$/i })).toBeInTheDocument();
  });

  it("does not show guided setup when bowls exist", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.rpcRows = [
      {
        id: "bowl-1",
        name: "Owned Bowl",
        remaining_count: 3,
        member_count: 2,
        owner_id: "u1",
      },
    ];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText("Owned Bowl")).toBeInTheDocument());

    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();
    expect(screen.getByText(/owned by you/i)).toBeInTheDocument();
    expect(screen.getByText(/shared with you/i)).toBeInTheDocument();
  });

  it("deep-links to streaming services from guided setup", async () => {
    mocks.state.initialAuthenticated = true;

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("button", { name: /set up streaming services/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /set up streaming services/i }));

    expect(mocks.state.navigate).toHaveBeenCalledWith("/settings#streaming-services");
  });

  it("opens the create bowl modal from the guided setup CTA", async () => {
    mocks.state.initialAuthenticated = true;

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("button", { name: /create your first bowl/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /create your first bowl/i }));

    expect(screen.getByText(/create new bowl/i)).toBeInTheDocument();
  });

  it("shows the streaming services step as complete when services exist", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.streamingServices = ["Netflix", "Max"];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());

    expect(screen.getByText(/^done$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create bowl$/i })).toBeInTheDocument();
  });

  it("waits for streaming services to finish loading before showing the guided setup", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.streamingServicesLoading = true;

    const { rerender } = render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/loading bowls/i)).toBeInTheDocument());
    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();

    mocks.state.streamingServicesLoading = false;
    rerender(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
  });

  it("removes the guided setup after creating the first bowl", async () => {
    mocks.state.initialAuthenticated = true;

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("button", { name: /create your first bowl/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /create your first bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText("Weekend Bowl")).toBeInTheDocument());

    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();
    expect(screen.getByText(/owned by you/i)).toBeInTheDocument();
  });

  it("creates a bowl with optional contribution limit and invites", async () => {
    mocks.state.initialAuthenticated = true;

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), {
      target: { value: "friend@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/max contribution lead \(optional\)/i), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument());
    expect(screen.getByText(/bowl created and 1 invite email sent\./i)).toBeInTheDocument();

    expect(mocks.state.insertedBowls[0][0]).toMatchObject({
      owner_id: "u1",
      name: "Weekend Bowl",
      max_contribution_lead: 2,
    });
    expect(mocks.state.insertedMembers[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      user_id: "u1",
      role: "Owner",
    });
    expect(mocks.state.insertedInvites[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      invited_email: "friend@example.com",
      invited_by: "u1",
    });
  });

  it("shows a partial failure message when invite emails cannot be sent", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.sendInviteEmailsResult = {
      sent: 0,
      failed: 1,
      results: [{ email: "friend@example.com", ok: false, error: "resend down" }],
      error: "resend down",
    };

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), {
      target: { value: "friend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument());
    expect(
      screen.getByText(/bowl created, but invite emails could not be sent\. you can still share the invite links from bowl settings\./i)
    ).toBeInTheDocument();
  });

  it("disables creating new bowls when owner already has 10 bowls", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.rpcRows = Array.from({ length: 10 }, (_, index) => ({
      id: `b-${index + 1}`,
      name: `Bowl ${index + 1}`,
      remaining_count: 0,
      member_count: 1,
      owner_id: "u1",
    }));

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText("Bowl 1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /\+ new bowl/i })).toBeDisabled();
    expect(screen.getByText(/bowl limit reached \(10\)/i)).toBeInTheDocument();
  });
});
