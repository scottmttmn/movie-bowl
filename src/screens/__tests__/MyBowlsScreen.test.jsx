import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(),
    authCallCount: 0,
    initialAuthenticated: false,
    sessionUser: { id: "u1", email: "user@example.com" },
    rpcRows: [],
    memberRows: [],
    pendingInvites: [],
    profileRows: [],
    insertedBowls: [],
    insertedMembers: [],
    insertedInvites: [],
    inviteRpcCalls: [],
    updatedInvites: [],
    deletedInvites: [],
    acceptedTokens: [],
    acceptInviteError: null,
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
    rpc: vi.fn(async (name, params) => {
      if (name === "get_my_bowl_context" || name === "set_my_default_bowl") {
        const rows = [...state.rpcRows, ...state.insertedBowls.flat().map((row) => ({ ...row, id: "bowl-1" }))]
          .filter((row) => row.owner_id === state.sessionUser.id || [...state.memberRows, ...state.insertedMembers.flat()]
            .some((member) => member.bowl_id === row.id));
        if (params?.p_bowl_id) state.defaultBowlId = params.p_bowl_id;
        return { data: { bowls: rows, default_bowl_id: state.defaultBowlId || rows[0]?.id || null }, error: null };
      }
      if (name === "accept_bowl_invite") {
        if (state.acceptInviteError) return { data: null, error: state.acceptInviteError };
        state.acceptedTokens.push(params?.p_token);
        return { data: state.pendingInvites.find((row) => row.token === params?.p_token)?.bowl_id || null, error: null };
      }
      if (name === "create_bowl_invites") {
        state.inviteRpcCalls.push(params);
        return {
          data: {
            bowl_id: params.p_bowl_id,
            request_id: params.p_request_id,
            invitations: params.p_emails.map((email, index) => ({
              invited_email: email,
              status: "created",
              invitation_id: `invite-${index + 1}`,
              token: `token-${index + 1}`,
            })),
          },
          error: null,
        };
      }
      if (name === "get_my_invite_sender_directory") {
        return {
          data: state.profileRows.map((row) => ({
            user_id: row.id,
            email: row.email,
          })),
          error: null,
        };
      }
      return { data: state.rpcRows, error: null };
    }),
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
                const rows = mocks.state.memberRows
                  .filter((row) => key !== "user_id" || row.user_id === value)
                  .map((row) => ({ bowl_id: row.bowl_id }));
                return Promise.resolve({ data: rows, error: null });
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

import { UserBowlsProvider } from "../../hooks/useUserBowls";
import MyBowlsScreen from "../MyBowlsScreen";
import { PendingInvitesProvider } from "../../hooks/usePendingInvites";

// Invites live in a shared provider so the top nav and this screen agree.
function renderMyBowls() {
  return render(
    <PendingInvitesProvider>
      <UserBowlsProvider userId="u1"><MyBowlsScreen /></UserBowlsProvider>
    </PendingInvitesProvider>
  );
}

describe("MyBowlsScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-25T18:00:00.000Z"));
    mocks.state.navigate.mockReset();
    mocks.state.authCallCount = 0;
    mocks.state.initialAuthenticated = false;
    mocks.state.sessionUser = { id: "u1", email: "user@example.com" };
    mocks.state.rpcRows = [];
    mocks.state.defaultBowlId = null;
    mocks.state.memberRows = [];
    mocks.state.pendingInvites = [];
    mocks.state.profileRows = [];
    mocks.state.insertedBowls = [];
    mocks.state.insertedMembers = [];
    mocks.state.insertedInvites = [];
    mocks.state.inviteRpcCalls = [];
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

    renderMyBowls();

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

    renderMyBowls();

    await waitFor(() => expect(screen.getByText("Owned Bowl")).toBeInTheDocument());

    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();
    expect(screen.getByText(/owned by you/i)).toBeInTheDocument();
    expect(screen.getByText(/shared with you/i)).toBeInTheDocument();
  });

  it("orders owned and shared bowls by most recent activity", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.memberRows = [
      { bowl_id: "shared-old", user_id: "u1" },
      { bowl_id: "shared-new", user_id: "u1" },
    ];
    mocks.state.rpcRows = [
      {
        id: "owned-old",
        name: "Owned Old",
        remaining_count: 3,
        member_count: 2,
        owner_id: "u1",
        last_activity_at: "2026-04-20T12:00:00.000Z",
      },
      {
        id: "shared-old",
        name: "Shared Old",
        remaining_count: 1,
        member_count: 2,
        owner_id: "owner-1",
        last_activity_at: "2026-04-19T12:00:00.000Z",
      },
      {
        id: "owned-new",
        name: "Owned New",
        remaining_count: 5,
        member_count: 3,
        owner_id: "u1",
        last_activity_at: "2026-04-24T12:00:00.000Z",
      },
      {
        id: "shared-new",
        name: "Shared New",
        remaining_count: 7,
        member_count: 4,
        owner_id: "owner-2",
        last_activity_at: "2026-04-25T12:00:00.000Z",
      },
    ];

    renderMyBowls();

    await waitFor(() => expect(screen.getByText("Owned New")).toBeInTheDocument());

    const ownedSection = screen.getByRole("heading", { name: /owned by you/i }).closest("section");
    const sharedSection = screen.getByRole("heading", { name: /shared with you/i }).closest("section");

    expect(Array.from(ownedSection.querySelectorAll(".bowl-card h3")).map((el) => el.textContent)).toEqual([
      "Owned New",
      "Owned Old",
    ]);
    expect(Array.from(sharedSection.querySelectorAll(".bowl-card h3")).map((el) => el.textContent)).toEqual([
      "Shared New",
      "Shared Old",
    ]);
  });

  it("uses the bowl name as a stable fallback when activity timestamps match", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.rpcRows = [
      {
        id: "bowl-2",
        name: "Zulu Bowl",
        remaining_count: 3,
        member_count: 2,
        owner_id: "u1",
        last_activity_at: "2026-04-20T12:00:00.000Z",
      },
      {
        id: "bowl-1",
        name: "Alpha Bowl",
        remaining_count: 1,
        member_count: 2,
        owner_id: "u1",
        last_activity_at: "2026-04-20T12:00:00.000Z",
      },
    ];

    renderMyBowls();

    await waitFor(() => expect(screen.getByText("Alpha Bowl")).toBeInTheDocument());

    const ownedSection = screen.getByRole("heading", { name: /owned by you/i }).closest("section");
    expect(Array.from(ownedSection.querySelectorAll(".bowl-card h3")).map((el) => el.textContent)).toEqual([
      "Alpha Bowl",
      "Zulu Bowl",
    ]);
  });

  it("deep-links to streaming services from guided setup", async () => {
    mocks.state.initialAuthenticated = true;

    renderMyBowls();

    await waitFor(() => expect(screen.getByRole("button", { name: /set up streaming services/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /set up streaming services/i }));

    expect(mocks.state.navigate).toHaveBeenCalledWith("/settings#streaming-services");
  });

  it("opens the create bowl modal from the guided setup CTA", async () => {
    mocks.state.initialAuthenticated = true;

    renderMyBowls();

    await waitFor(() => expect(screen.getByRole("button", { name: /create your first bowl/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /create your first bowl/i }));

    expect(screen.getByText(/create new bowl/i)).toBeInTheDocument();
  });

  it("shows the streaming services step as complete when services exist", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.streamingServices = ["Netflix", "Max"];

    renderMyBowls();

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());

    expect(screen.getByText(/^done$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create bowl$/i })).toBeInTheDocument();
  });

  it("waits for streaming services to finish loading before showing the guided setup", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.streamingServicesLoading = true;

    const { rerender } = renderMyBowls();

    await waitFor(() => expect(screen.getByText(/loading bowls/i)).toBeInTheDocument());
    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();

    mocks.state.streamingServicesLoading = false;
    rerender(
      <PendingInvitesProvider>
        <UserBowlsProvider userId="u1"><MyBowlsScreen /></UserBowlsProvider>
      </PendingInvitesProvider>
    );

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
  });

  it("removes the guided setup after creating the first bowl", async () => {
    mocks.state.initialAuthenticated = true;

    renderMyBowls();

    await waitFor(() => expect(screen.getByRole("button", { name: /create your first bowl/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /create your first bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText("Weekend Bowl")).toBeInTheDocument());

    expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument();
    expect(screen.getByText(/owned by you/i)).toBeInTheDocument();
  });

  it("creates a bowl with invites", async () => {
    mocks.state.initialAuthenticated = true;

    renderMyBowls();

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), {
      target: { value: "friend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.queryByText(/start your first movie bowl/i)).not.toBeInTheDocument());
    expect(screen.getByText(/bowl created and 1 invite email sent\./i)).toBeInTheDocument();

    expect(mocks.state.insertedBowls[0][0]).toMatchObject({
      owner_id: "u1",
      name: "Weekend Bowl",
    });
    expect(Object.keys(mocks.state.insertedBowls[0][0])).toEqual([
      "owner_id",
      "name",
      "draw_access_mode",
    ]);
    expect(mocks.state.insertedMembers[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      user_id: "u1",
      role: "Owner",
    });
    expect(mocks.state.inviteRpcCalls[0]).toMatchObject({
      p_bowl_id: "bowl-1",
      p_emails: ["friend@example.com"],
    });
    expect(mocks.state.insertedInvites).toHaveLength(0);
  });

  it("shows creation errors inside the open dialog", async () => {
    mocks.state.initialAuthenticated = true;

    renderMyBowls();

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), {
      target: { value: "friend@" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    const dialog = screen.getByRole("dialog", { name: /create new bowl/i });
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Invalid email(s): friend@"));
    expect(screen.getAllByText("Invalid email(s): friend@")).toHaveLength(1);
  });

  it("shows a partial failure message when invite emails cannot be sent", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.sendInviteEmailsResult = {
      sent: 0,
      failed: 1,
      results: [{ email: "friend@example.com", ok: false, error: "resend down" }],
      error: "resend down",
    };

    renderMyBowls();

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

    renderMyBowls();

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

    renderMyBowls();

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

    renderMyBowls();

    await waitFor(() => expect(screen.getByText(/2 pending invites waiting for your response/i)).toBeInTheDocument());
    expect(screen.getByText(/^today$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it("does not render invite panel when there are no pending invites", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [];

    renderMyBowls();

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
    expect(screen.queryByText(/^invites$/i)).not.toBeInTheDocument();
  });

  it("accepts an invite through one atomic call and navigates to bowl", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        token: "invite-token-1",
        accepted_at: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    renderMyBowls();

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowl/bowl-2"));
    // Membership and finalization belong to the RPC now, not to two client writes.
    expect(mocks.state.acceptedTokens).toEqual(["invite-token-1"]);
    expect(mocks.state.insertedMembers).toEqual([]);
    expect(mocks.state.updatedInvites).toEqual([]);
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("keeps a refused invite listed and explains why", async () => {
    mocks.state.initialAuthenticated = true;
    mocks.state.acceptInviteError = { code: "P0001", message: "This invite is no longer available." };
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        token: "invite-token-1",
        accepted_at: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];
    mocks.state.rpcRows = [{ id: "bowl-2", name: "Friday Bowl", remaining_count: 0, member_count: 1, owner_id: "owner-1" }];

    renderMyBowls();

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await screen.findByText("This invite is no longer available.");
    expect(mocks.state.navigate).not.toHaveBeenCalledWith("/bowl/bowl-2");
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
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

    renderMyBowls();

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

    renderMyBowls();

    await waitFor(() => expect(screen.getByText(/start your first movie bowl/i)).toBeInTheDocument());
    expect(screen.queryByText("Friday Bowl")).not.toBeInTheDocument();
    expect(screen.queryByText(/^invites$/i)).not.toBeInTheDocument();
  });
});
