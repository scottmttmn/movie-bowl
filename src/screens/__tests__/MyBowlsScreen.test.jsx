import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(),
    authCallCount: 0,
    initialAuthenticated: false,
    sessionUser: { id: "u1", email: "user@example.com" },
    rpcRows: [],
    pendingInvites: [],
    profileRows: [],
    insertedBowls: [],
    insertedMembers: [],
    insertedInvites: [],
    updatedInvites: [],
    deletedInvites: [],
    memberInsertError: null,
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
        return { data: { session: { user: state.sessionUser } }, error: null };
      }),
    },
    rpc: vi.fn(async () => ({ data: state.rpcRows, error: null })),
    from: vi.fn((table) => {
      if (table === "bowls") {
        const ctx = { insertRows: null, selectMode: false, eqFilters: [], inFilter: null };
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
          eq: vi.fn((key, value) => {
            ctx.eqFilters.push({ key, value });
            return query;
          }),
          in: vi.fn((key, values) => {
            ctx.inFilter = { key, values };
            return query;
          }),
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
            if (ctx.selectMode && ctx.inFilter?.key === "id") {
              const values = new Set(ctx.inFilter.values || []);
              const bowlRows = mocks.state.rpcRows
                .filter((row) => values.has(row.id))
                .map((row) => ({ id: row.id, name: row.name }));
              return Promise.resolve({ data: bowlRows, error: null }).then(resolve, reject);
            }
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
        const ctx = { selectMode: false, eqFilters: [] };
        return {
          insert: vi.fn(async (rows) => {
            mocks.state.insertedMembers.push(rows);
            return { error: mocks.state.memberInsertError };
          }),
          select: vi.fn(() => {
            ctx.selectMode = true;
            return {
              eq: vi.fn((key, value) => {
                ctx.eqFilters.push({ key, value });
                return Promise.resolve({ data: [], error: null });
              }),
            };
          }),
        };
      }

      if (table === "bowl_invites") {
        const ctx = { mode: null, filters: [] };
        return {
          insert: vi.fn(async (rows) => {
            mocks.state.insertedInvites.push(rows);
            return { error: null };
          }),
          select: vi.fn(() => {
            ctx.mode = "select";
            return {
              is: vi.fn((key, value) => {
                ctx.filters.push({ type: "is", key, value });
                return {
                  ilike: vi.fn((field, email) => {
                    ctx.filters.push({ type: "ilike", key: field, value: email });
                    return {
                      order: vi.fn(async () => {
                        const target = String(email || "").toLowerCase();
                        const rows = mocks.state.pendingInvites.filter(
                          (invite) =>
                            String(invite.invited_email || "").toLowerCase() === target &&
                            invite.accepted_at == null
                        );
                        return { data: rows, error: null };
                      }),
                    };
                  }),
                };
              }),
            };
          }),
          update: vi.fn((payload) => {
            ctx.mode = "update";
            ctx.payload = payload;
            return {
              eq: vi.fn((key, value) => {
                ctx.filters.push({ type: "eq", key, value });
                return {
                  ilike: vi.fn((field, email) => {
                    ctx.filters.push({ type: "ilike", key: field, value: email });
                    const row = { payload, filters: [...ctx.filters] };
                    mocks.state.updatedInvites.push(row);
                    return Promise.resolve({ data: null, error: null });
                  }),
                };
              }),
            };
          }),
          delete: vi.fn(() => {
            ctx.mode = "delete";
            return {
              eq: vi.fn((key, value) => {
                ctx.filters.push({ type: "eq", key, value });
                return {
                  ilike: vi.fn((field, email) => {
                    ctx.filters.push({ type: "ilike", key: field, value: email });
                    const row = { filters: [...ctx.filters] };
                    mocks.state.deletedInvites.push(row);
                    return Promise.resolve({ data: null, error: null });
                  }),
                };
              }),
            };
          }),
        };
      }

      if (table === "profiles") {
        const ctx = { inFilter: null };
        const query = {
          select: vi.fn(() => query),
          in: vi.fn((key, values) => {
            ctx.inFilter = { key, values };
            return query;
          }),
          then: (resolve, reject) => {
            if (ctx.inFilter?.key === "id") {
              const values = new Set(ctx.inFilter.values || []);
              const rows = mocks.state.profileRows.filter((row) => values.has(row.id));
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return query;
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-25T18:00:00.000Z"));
    mocks.state.navigate.mockReset();
    mocks.state.authCallCount = 0;
    mocks.state.initialAuthenticated = false;
    mocks.state.sessionUser = { id: "u1", email: "user@example.com" };
    mocks.state.rpcRows = [];
    mocks.state.pendingInvites = [];
    mocks.state.profileRows = [];
    mocks.state.insertedBowls = [];
    mocks.state.insertedMembers = [];
    mocks.state.insertedInvites = [];
    mocks.state.updatedInvites = [];
    mocks.state.deletedInvites = [];
    mocks.state.memberInsertError = null;
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
    vi.useRealTimers();
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

  it("renders invite panel when pending invites exist for signed-in user", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-04-24T12:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("heading", { name: /^invites$/i })).toBeInTheDocument());
    expect(screen.getByText("Friday Bowl")).toBeInTheDocument();
    expect(screen.getByText(/invited by owner@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/1 pending invite waiting for your response/i)).toBeInTheDocument();
    expect(screen.getAllByText(/yesterday/i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("shows a plural invite summary and absolute date badge for older invites", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-04-20T00:00:00.000Z",
      },
      {
        id: "inv-2",
        bowl_id: "bowl-3",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-04-25T12:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [
      { id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" },
      { id: "bowl-3", name: "Saturday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" },
    ];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/2 pending invites waiting for your response/i)).toBeInTheDocument());
    expect(screen.getByText(/^today$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it("does not render invite panel when there are no pending invites", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
    expect(screen.queryByText(/^invites$/i)).not.toBeInTheDocument();
  });

  it("accepts invite, inserts membership, marks accepted, and navigates to bowl", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowl/bowl-2"));
    expect(mocks.state.insertedMembers).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ bowl_id: "bowl-2", user_id: "u1", role: "Member" })],
      ])
    );
    expect(mocks.state.updatedInvites).toHaveLength(1);
    expect(screen.queryByText("Friday Bowl")).not.toBeInTheDocument();
  });

  it("accept invite tolerates duplicate-member error and still marks accepted", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.memberInsertError = { message: "duplicate key value violates unique constraint" };
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(mocks.state.updatedInvites).toHaveLength(1));
    expect(mocks.state.navigate).toHaveBeenCalledWith("/bowl/bowl-2");
  });

  it("declines invite by deleting row and removes it from UI", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));

    await waitFor(() => expect(mocks.state.deletedInvites).toHaveLength(1));
    expect(screen.queryByText("Friday Bowl")).not.toBeInTheDocument();
  });

  it("scopes invite inbox to current signed-in email", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "other@example.com",
        invited_by: "owner-1",
        accepted_at: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    render(<MyBowlsScreen />);

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
    expect(screen.queryByText("Friday Bowl")).not.toBeInTheDocument();
    expect(screen.queryByText(/^invites$/i)).not.toBeInTheDocument();
  });
});
