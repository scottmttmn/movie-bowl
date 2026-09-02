import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS } from "../../hooks/useAutosave";

const mocks = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(),
    params: { bowlId: "bowl-1" },
    authUser: { id: "owner-1", email: "owner@example.com" },
    bowl: { id: "bowl-1", name: "Bowl 1", owner_id: "owner-1" },
    members: [],
    invites: [],
    addLinks: [],
    drawPermissions: [],
    operations: [],
    insertedInvites: [],
    inviteRpcCalls: [],
    revokeRpcCalls: [],
    createInviteOutcome: null,
    revokeInviteOutcome: null,
    insertedAddLinks: [],
    insertedDrawPermissions: [],
    updatedBowls: [],
    errors: {
      loadBowl: null,
      loadMembers: null,
      loadProfileDirectory: null,
      loadInvites: null,
      loadDrawPermissions: null,
      loadAddLinks: null,
      insertInvite: null,
      createInvite: null,
      insertAddLink: null,
      insertDrawPermissions: null,
      updateBowl: null,
      updateAddLink: null,
      updateDrawAccessMode: null,
      deleteAddLink: null,
      deleteInvite: null,
      revokeInvite: null,
      deleteMember: null,
      deleteDrawPermissions: null,
      deleteMovies: null,
      deleteBowlInvites: null,
      deleteBowlMembers: null,
      deleteBowl: null,
      deleteOwnedBowl: null,
      saveDrawAccess: null,
      saveDrawMethod: null,
      verifyMembership: null,
    },
    sendInviteEmailsResult: { sent: 1, failed: 0, results: [{ email: "newfriend@example.com", ok: true }], error: null },
  };

  function getEq(filters, key) {
    const hit = filters.find((f) => f.type === "eq" && f.key === key);
    return hit ? hit.value : undefined;
  }

  function resolveQuery(table, queryState, terminal) {
    if (queryState.action === "select" && table === "bowls" && terminal === "single") {
      if (state.errors.loadBowl) return { data: null, error: state.errors.loadBowl };
      const requestedId = getEq(queryState.filters, "id");
      const data = requestedId === state.bowl.id ? state.bowl : null;
      return { data, error: data ? null : { message: "Not found" } };
    }

    if (queryState.action === "select" && table === "bowl_members" && terminal === "order") {
      if (state.errors.loadMembers) return { data: null, error: state.errors.loadMembers };
      const bowlId = getEq(queryState.filters, "bowl_id");
      const rows = state.members
        .filter((m) => m.bowl_id === bowlId)
        .map((m) => ({
          user_id: m.user_id,
          role: m.role,
        }));
      return { data: rows, error: null };
    }

    if (queryState.action === "select" && table === "bowl_members" && terminal === "maybeSingle") {
      if (state.errors.verifyMembership) return { data: null, error: state.errors.verifyMembership };
      const bowlId = getEq(queryState.filters, "bowl_id");
      const userId = getEq(queryState.filters, "user_id");
      const row = state.members.find((m) => m.bowl_id === bowlId && m.user_id === userId);
      return { data: row ? { user_id: row.user_id } : null, error: null };
    }

    if (queryState.action === "select" && table === "bowl_invites" && terminal === "order") {
      if (state.errors.loadInvites) return { data: null, error: state.errors.loadInvites };
      const bowlId = getEq(queryState.filters, "bowl_id");
      const pendingOnly = queryState.filters.some(
        (filter) => filter.type === "is" && filter.key === "accepted_at" && filter.value === null
      );
      const rows = state.invites.filter(
        (invite) => invite.bowl_id === bowlId && (!pendingOnly || invite.accepted_at == null)
      );
      return { data: rows, error: null };
    }

    if (queryState.action === "select" && table === "bowl_add_links" && terminal === "order") {
      if (state.errors.loadAddLinks) return { data: null, error: state.errors.loadAddLinks };
      const bowlId = getEq(queryState.filters, "bowl_id");
      const rows = state.addLinks.filter((link) => link.bowl_id === bowlId);
      return { data: rows, error: null };
    }

    if (queryState.action === "select" && table === "bowl_draw_permissions" && terminal === "then") {
      if (state.errors.loadDrawPermissions) return { data: null, error: state.errors.loadDrawPermissions };
      const bowlId = getEq(queryState.filters, "bowl_id");
      const rows = state.drawPermissions
        .filter((permission) => permission.bowl_id === bowlId)
        .map((permission) => ({ user_id: permission.user_id }));
      return { data: rows, error: null };
    }

    if (queryState.action === "delete" && table === "bowl_invites" && terminal === "then") {
      const id = getEq(queryState.filters, "id");
      const bowlId = getEq(queryState.filters, "bowl_id");
      const invitedEmail = getEq(queryState.filters, "invited_email");
      if (id && bowlId && state.errors.deleteInvite) {
        return { data: null, error: state.errors.deleteInvite };
      }
      if (!id && bowlId && invitedEmail && state.errors.deleteBowlInvites) {
        return { data: null, error: state.errors.deleteBowlInvites };
      }

      if (id && bowlId) {
        state.invites = state.invites.filter((i) => !(i.id === id && i.bowl_id === bowlId));
      } else if (bowlId && invitedEmail) {
        state.invites = state.invites.filter(
          (i) =>
            !(
              i.bowl_id === bowlId &&
              String(i.invited_email || "").toLowerCase() === String(invitedEmail).toLowerCase()
            )
        );
      }

      return { data: [], error: null };
    }

    if (queryState.action === "delete" && table === "bowl_add_links" && terminal === "then") {
      const linkId = getEq(queryState.filters, "id");
      const link = state.addLinks.find((entry) => entry.id === linkId);
      const isOwner = state.bowl.owner_id === state.authUser.id;
      const isCreator = link?.created_by === state.authUser.id;

      if (state.errors.deleteAddLink) {
        return { data: null, error: state.errors.deleteAddLink };
      }

      if (!link || (!isOwner && !isCreator)) {
        return { data: null, error: { message: "rls" } };
      }

      state.addLinks = state.addLinks.filter((entry) => entry.id !== linkId);
      return { data: [], error: null };
    }

    if (queryState.action === "delete" && table === "bowl_members" && terminal === "then") {
      const bowlId = getEq(queryState.filters, "bowl_id");
      const userId = getEq(queryState.filters, "user_id");
      if (userId && state.errors.deleteMember) {
        return { data: null, error: state.errors.deleteMember };
      }
      if (!userId && state.errors.deleteBowlMembers) {
        return { data: null, error: state.errors.deleteBowlMembers };
      }
      state.members = state.members.filter((m) => !(m.bowl_id === bowlId && m.user_id === userId));
      return { data: [], error: null };
    }

    if (queryState.action === "delete" && table === "bowl_draw_permissions" && terminal === "then") {
      if (state.errors.deleteDrawPermissions) {
        return { data: null, error: state.errors.deleteDrawPermissions };
      }
      const bowlId = getEq(queryState.filters, "bowl_id");
      state.drawPermissions = state.drawPermissions.filter((permission) => permission.bowl_id !== bowlId);
      return { data: [], error: null };
    }

    if (queryState.action === "delete" && table === "bowl_movies" && terminal === "then") {
      if (state.errors.deleteMovies) {
        return { data: null, error: state.errors.deleteMovies };
      }
      return { data: [], error: null };
    }

    if (queryState.action === "delete" && table === "bowls" && terminal === "then") {
      if (state.errors.deleteBowl) {
        return { data: null, error: state.errors.deleteBowl };
      }
      return { data: [], error: null };
    }

    if (queryState.action === "insert" && table === "bowl_invites" && terminal === "then") {
      if (state.errors.insertInvite) {
        return { data: null, error: state.errors.insertInvite };
      }
      const rows = queryState.payload || [];
      state.insertedInvites.push(rows);
      state.invites = [
        ...rows.map((row, index) => ({
          id: `inv-new-${index + 1}`,
          bowl_id: row.bowl_id,
          invited_email: row.invited_email,
          token: row.token,
          accepted_at: null,
          created_at: "2026-02-24T00:00:00.000Z",
        })),
        ...state.invites,
      ];
      return { data: rows, error: null };
    }

    if (queryState.action === "insert" && table === "bowl_add_links" && terminal === "then") {
      if (state.errors.insertAddLink) {
        return { data: null, error: state.errors.insertAddLink };
      }
      const rows = queryState.payload || [];
      state.insertedAddLinks.push(rows);
      state.addLinks = [
        ...rows.map((row, index) => ({
          id: `link-${index + 1}`,
          bowl_id: row.bowl_id,
          token: row.token,
          max_adds: row.max_adds,
          adds_used: 0,
          default_contributor_name: row.default_contributor_name || null,
          revoked_at: null,
          created_at: "2026-04-06T00:00:00.000Z",
          created_by: row.created_by,
        })),
        ...state.addLinks,
      ];
      return { data: rows, error: null };
    }

    if (queryState.action === "insert" && table === "bowl_draw_permissions" && terminal === "then") {
      if (state.errors.insertDrawPermissions) {
        return { data: null, error: state.errors.insertDrawPermissions };
      }
      const rows = queryState.payload || [];
      state.insertedDrawPermissions.push(rows);
      state.drawPermissions = [...state.drawPermissions, ...rows];
      return { data: rows, error: null };
    }

    if (queryState.action === "update" && table === "bowls" && terminal === "then") {
      if (
        queryState.payload &&
        Object.prototype.hasOwnProperty.call(queryState.payload, "draw_access_mode") &&
        state.errors.updateDrawAccessMode
      ) {
        return { data: null, error: state.errors.updateDrawAccessMode };
      }
      if (state.errors.updateBowl) {
        return { data: null, error: state.errors.updateBowl };
      }
      const requestedId = getEq(queryState.filters, "id");
      if (requestedId === state.bowl.id) {
        state.updatedBowls.push(queryState.payload);
        state.bowl = {
          ...state.bowl,
          ...queryState.payload,
        };
      }
      return { data: [], error: null };
    }

    if (queryState.action === "update" && table === "bowl_add_links" && terminal === "then") {
      if (state.errors.updateAddLink) {
        return { data: null, error: state.errors.updateAddLink };
      }
      const linkId = getEq(queryState.filters, "id");
      state.addLinks = state.addLinks.map((link) =>
        link.id === linkId ? { ...link, ...queryState.payload } : link
      );
      return { data: [], error: null };
    }

    return { data: null, error: null };
  }

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: state.authUser } },
        error: null,
      })),
    },
    from: vi.fn((table) => {
      const queryState = { table, action: "select", filters: [] };
      state.operations.push(queryState);

      const query = {
        select: vi.fn(() => {
          queryState.action = "select";
          return query;
        }),
        delete: vi.fn(() => {
          queryState.action = "delete";
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
          queryState.filters.push({ type: "eq", key, value });
          return query;
        }),
        is: vi.fn((key, value) => {
          queryState.filters.push({ type: "is", key, value });
          return query;
        }),
        order: vi.fn(async () => resolveQuery(table, queryState, "order")),
        single: vi.fn(async () => resolveQuery(table, queryState, "single")),
        maybeSingle: vi.fn(async () => resolveQuery(table, queryState, "maybeSingle")),
        then: (resolve, reject) =>
          Promise.resolve(resolveQuery(table, queryState, "then")).then(resolve, reject),
      };

      return query;
    }),
    rpc: vi.fn(async (name, args) => {
      if (name === "create_bowl_invites") {
        state.inviteRpcCalls.push(args);
        if (state.errors.createInvite) {
          return { data: null, error: state.errors.createInvite };
        }

        const email = args?.p_emails?.[0];
        const existing = state.invites.find(
          (invite) =>
            invite.bowl_id === args?.p_bowl_id &&
            String(invite.invited_email || "").toLowerCase() === String(email || "").toLowerCase() &&
            invite.accepted_at == null
        );
        const outcome = state.createInviteOutcome || (existing
          ? {
              invited_email: email,
              status: "already_pending",
              invitation_id: existing.id,
              token: existing.token,
            }
          : {
              invited_email: email,
              status: "created",
              invitation_id: `inv-new-${state.inviteRpcCalls.length}`,
              token: `rpc-token-${state.inviteRpcCalls.length}`,
            });

        if (outcome.status === "created") {
          state.invites = [
            {
              id: outcome.invitation_id,
              bowl_id: args.p_bowl_id,
              invited_email: outcome.invited_email,
              token: outcome.token,
              accepted_at: null,
              created_at: "2026-09-02T00:00:00.000Z",
            },
            ...state.invites,
          ];
        }

        return {
          data: {
            bowl_id: args.p_bowl_id,
            request_id: args.p_request_id,
            invitations: [outcome],
          },
          error: null,
        };
      }
      if (name === "revoke_bowl_invite") {
        state.revokeRpcCalls.push(args);
        if (state.errors.revokeInvite) {
          return { data: null, error: state.errors.revokeInvite };
        }

        const outcome = state.revokeInviteOutcome || "revoked";
        if (outcome === "revoked") {
          state.invites = state.invites.filter(
            (invite) =>
              !(invite.id === args?.p_invitation_id && invite.bowl_id === args?.p_bowl_id)
          );
        } else if (outcome === "already_accepted") {
          state.invites = state.invites.map((invite) =>
            invite.id === args?.p_invitation_id && invite.bowl_id === args?.p_bowl_id
              ? { ...invite, accepted_at: "2026-09-02T12:00:00.000Z" }
              : invite
          );
        }
        return { data: outcome, error: null };
      }
      if (name === "get_bowl_profile_directory") {
        return {
          data: state.members.map((member) => ({
            user_id: member.user_id,
            email: member.email,
          })),
          error: state.errors.loadProfileDirectory,
        };
      }
      if (name === "delete_owned_bowl") {
        if (state.errors.deleteOwnedBowl) {
          return { data: null, error: state.errors.deleteOwnedBowl };
        }

        if (
          args?.p_bowl_id !== state.bowl.id ||
          state.bowl.owner_id !== state.authUser.id
        ) {
          return {
            data: null,
            error: {
              code: "42501",
              message: "Only the bowl owner can delete this bowl.",
            },
          };
        }

        state.members = state.members.filter(
          (member) => member.bowl_id !== args.p_bowl_id
        );
        state.invites = state.invites.filter(
          (invite) => invite.bowl_id !== args.p_bowl_id
        );
        state.addLinks = state.addLinks.filter(
          (link) => link.bowl_id !== args.p_bowl_id
        );
        state.drawPermissions = state.drawPermissions.filter(
          (permission) => permission.bowl_id !== args.p_bowl_id
        );

        return { data: args.p_bowl_id, error: null };
      }
      if (name === "save_bowl_draw_access") {
        if (state.errors.saveDrawAccess) {
          return { data: null, error: state.errors.saveDrawAccess };
        }

        const isOwner =
          args?.p_bowl_id === state.bowl.id &&
          state.bowl.owner_id === state.authUser.id;
        if (!isOwner) {
          return {
            data: null,
            error: {
              code: "42501",
              message: "Only the bowl owner can update draw access.",
            },
          };
        }

        const validModes = ["all_members", "selected_members"];
        if (!validModes.includes(args?.p_mode)) {
          return {
            data: null,
            error: { code: "P0001", message: "Invalid draw access mode." },
          };
        }

        const selectedUserIds = [
          ...new Set(
            args.p_mode === "selected_members"
              ? (args.p_allowed_user_ids || []).filter(Boolean)
              : []
          ),
        ];
        const memberIds = new Set(
          state.members
            .filter(
              (member) =>
                member.bowl_id === args.p_bowl_id &&
                member.user_id !== state.bowl.owner_id
            )
            .map((member) => member.user_id)
        );
        if (selectedUserIds.some((userId) => !memberIds.has(userId))) {
          return {
            data: null,
            error: {
              code: "P0001",
              message: "Draw access can only be granted to current bowl members.",
            },
          };
        }

        state.bowl = {
          ...state.bowl,
          draw_access_mode: args.p_mode,
        };
        state.drawPermissions = selectedUserIds.map((userId) => ({
          bowl_id: args.p_bowl_id,
          user_id: userId,
        }));

        return { data: args.p_mode, error: null };
      }
      if (name === "save_bowl_draw_method") {
        if (state.errors.saveDrawMethod) {
          return { data: null, error: state.errors.saveDrawMethod };
        }

        const isOwner =
          args?.p_bowl_id === state.bowl.id &&
          state.bowl.owner_id === state.authUser.id;
        if (!isOwner) {
          return {
            data: null,
            error: {
              code: "42501",
              message: "Only the bowl owner can update the draw method.",
            },
          };
        }

        if (!["person_first", "title_first", "rotation"].includes(args?.p_method)) {
          return {
            data: null,
            error: { code: "P0001", message: "Invalid draw method." },
          };
        }

        state.bowl = {
          ...state.bowl,
          draw_method: args.p_method,
        };

        return { data: args.p_method, error: null };
      }
      return { data: null, error: null };
    }),
  };

  const sendInviteEmails = vi.fn(async () => state.sendInviteEmailsResult);

  return { state, supabase, sendInviteEmails };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/inviteEmails", () => ({
  sendInviteEmails: mocks.sendInviteEmails,
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useParams: () => mocks.state.params,
  };
});

import BowlSettings from "../BowlSettings";

describe("BowlSettings integration", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const settleAutosave = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 50);
    });
  };

  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.params = { bowlId: "bowl-1" };
    mocks.state.bowl = { id: "bowl-1", name: "Bowl 1", owner_id: "owner-1" };
    mocks.state.authUser = { id: "owner-1", email: "owner@example.com" };
    mocks.state.members = [
      { bowl_id: "bowl-1", user_id: "owner-1", role: "Owner", email: "owner@example.com" },
      { bowl_id: "bowl-1", user_id: "member-1", role: "Member", email: "member@example.com" },
    ];
    mocks.state.addLinks = [];
    mocks.state.drawPermissions = [];
    mocks.state.invites = [
      {
        id: "inv-1",
        bowl_id: "bowl-1",
        invited_email: "friend@example.com",
        token: "token-1",
        accepted_at: null,
        created_at: "2026-02-23T00:00:00.000Z",
      },
    ];
    mocks.state.operations = [];
    mocks.state.insertedInvites = [];
    mocks.state.inviteRpcCalls = [];
    mocks.state.revokeRpcCalls = [];
    mocks.state.createInviteOutcome = null;
    mocks.state.revokeInviteOutcome = null;
    mocks.state.insertedAddLinks = [];
    mocks.state.insertedDrawPermissions = [];
    mocks.state.updatedBowls = [];
    mocks.state.errors = {
      loadBowl: null,
      loadMembers: null,
      loadProfileDirectory: null,
      loadInvites: null,
      loadDrawPermissions: null,
      loadAddLinks: null,
      insertInvite: null,
      createInvite: null,
      insertAddLink: null,
      insertDrawPermissions: null,
      updateBowl: null,
      updateAddLink: null,
      updateDrawAccessMode: null,
      deleteAddLink: null,
      deleteInvite: null,
      revokeInvite: null,
      deleteMember: null,
      deleteDrawPermissions: null,
      deleteMovies: null,
      deleteBowlInvites: null,
      deleteBowlMembers: null,
      deleteBowl: null,
      deleteOwnedBowl: null,
      saveDrawAccess: null,
      saveDrawMethod: null,
      verifyMembership: null,
      refreshQueuePromotions: null,
    };
    mocks.supabase.rpc.mockClear();
    mocks.sendInviteEmails.mockClear();
    mocks.state.sendInviteEmailsResult = {
      sent: 1,
      failed: 0,
      results: [{ email: "newfriend@example.com", ok: true }],
      error: null,
    };
  });

  it("allows owner to revoke a pending invite", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByText("friend@example.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));

    await waitFor(() => {
      expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument();
    expect(mocks.state.revokeRpcCalls).toEqual([{
      p_bowl_id: "bowl-1",
      p_invitation_id: "inv-1",
    }]);
    expect(
      mocks.state.operations.some(
        (operation) => operation.table === "bowl_invites" && operation.action === "delete"
      )
    ).toBe(false);
  });

  it("allows non-owner member to leave and navigates home", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave bowl/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /leave bowl/i }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true });
    }, { timeout: 3000 });

    confirmSpy.mockRestore();
  });

  it("leaving a bowl does not delete bowl movies", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave bowl/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /leave bowl/i }));

    await waitFor(() => {
      expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true });
    }, { timeout: 8000 });

    const deleteOps = mocks.state.operations.filter((op) => op.action === "delete");
    expect(deleteOps.some((op) => op.table === "bowl_members")).toBe(true);
    expect(deleteOps.some((op) => op.table === "bowl_movies")).toBe(false);

    confirmSpy.mockRestore();
  });

  it("allows owner to create an invite link and sends email", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("friend@example.com")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("friend@example.com"), {
      target: { value: "newfriend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/accept-invite\//i)).toBeInTheDocument();
    });
    expect(screen.getByText(/invite created and email sent\./i)).toBeInTheDocument();

    expect(mocks.state.inviteRpcCalls).toHaveLength(1);
    expect(mocks.state.inviteRpcCalls[0]).toMatchObject({
      p_bowl_id: "bowl-1",
      p_emails: ["newfriend@example.com"],
    });
    expect(mocks.state.insertedInvites).toHaveLength(0);
    expect(screen.getByText("newfriend@example.com")).toBeInTheDocument();
    expect(mocks.sendInviteEmails).toHaveBeenCalledWith([{
      bowlId: "bowl-1",
      bowlName: "Bowl 1",
      invitedEmail: "newfriend@example.com",
      invitedByEmail: "owner@example.com",
      token: "rpc-token-1",
    }]);
  });

  it("reuses an already-pending invite without sending another email", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("friend@example.com")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("friend@example.com"), {
      target: { value: "friend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(screen.getByText(/an invite is already pending for friend@example\.com\./i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/accept-invite\/token-1/i)).toBeInTheDocument();
    expect(mocks.state.invites).toHaveLength(1);
    expect(mocks.sendInviteEmails).not.toHaveBeenCalled();
  });

  it("reports when an invite was accepted before revoke", async () => {
    mocks.state.revokeInviteOutcome = "already_accepted";

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByText("friend@example.com")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/was accepted before it could be revoked\./i)
      ).toBeInTheDocument();
    });
    expect(mocks.state.invites).toHaveLength(1);
    expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument();
  });

  it("allows a member to create and delete their own add link", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/allowed adds/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/allowed adds/i), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(/default contributor label/i), {
      target: { value: "Dad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create add link/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/add-to-bowl\//i)).toBeInTheDocument();
    });

    expect(mocks.state.insertedAddLinks[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      created_by: "member-1",
      max_adds: 4,
      default_contributor_name: "Dad",
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByText(/add link deleted\./i)).toBeInTheDocument();
    });
  });

  it("prevents a member from deleting another member's add link", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };
    mocks.state.addLinks = [
      {
        id: "link-1",
        bowl_id: "bowl-1",
        token: "token-1",
        max_adds: 3,
        adds_used: 0,
        default_contributor_name: null,
        revoked_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
        created_by: "owner-1",
      },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to delete add link\./i)).toBeInTheDocument();
    });

    expect(screen.getByText(/3 of 3 adds remaining/i)).toBeInTheDocument();
  });

  it("allows deleting an exhausted add link", async () => {
    mocks.state.addLinks = [
      {
        id: "link-1",
        bowl_id: "bowl-1",
        token: "token-1",
        max_adds: 3,
        adds_used: 3,
        default_contributor_name: "Dad",
        revoked_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
        created_by: "owner-1",
      },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByText(/exhausted/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByText(/no add links yet\./i)).toBeInTheDocument();
    });
  });

  it("autosaves an add link contributor label without mutating prior rows", async () => {
    mocks.state.addLinks = [
      {
        id: "link-1",
        bowl_id: "bowl-1",
        token: "token-1",
        max_adds: 3,
        adds_used: 1,
        default_contributor_name: "Dad",
        revoked_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
        created_by: "owner-1",
      },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Dad")).toBeInTheDocument();
    });

    vi.useFakeTimers();
    const labelInputs = screen.getAllByDisplayValue("Dad");
    fireEvent.change(labelInputs[labelInputs.length - 1], {
      target: { value: "Grandpa" },
    });
    expect(screen.queryByRole("button", { name: /save label/i })).not.toBeInTheDocument();
    await settleAutosave();

    expect(
      mocks.state.addLinks.find((link) => link.id === "link-1")?.default_contributor_name
    ).toBe("Grandpa");
    // The label input is the only place the label is shown, so it is also the
    // readout that has to survive the save.
    expect(screen.getByLabelText(/^contributor label$/i)).toHaveValue("Grandpa");
  });

  it("keeps the invite link available when invite email sending fails", async () => {
    mocks.state.sendInviteEmailsResult = {
      sent: 0,
      failed: 1,
      results: [{ email: "newfriend@example.com", ok: false, error: "smtp down" }],
      error: "smtp down",
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("friend@example.com")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("friend@example.com"), {
      target: { value: "newfriend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/accept-invite\//i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/invite created, but email could not be sent\. you can still copy the link\./i)
    ).toBeInTheDocument();
  });

  it("autosaves an updated bowl name without a save button", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "all_members",
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Bowl 1")).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.change(screen.getByDisplayValue("Bowl 1"), {
      target: { value: "Renamed Bowl" },
    });
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    await settleAutosave();

    expect(mocks.state.updatedBowls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Renamed Bowl",
        }),
      ])
    );
    expect(mocks.supabase.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "get_bowl_profile_directory",
      { p_bowl_id: "bowl-1" }
    );
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
  });

  it("shows draw access controls for owner and defaults to everyone", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "all_members",
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /draw access/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/everyone in bowl/i)).toBeChecked();
  });

  it("owner can switch to selected members and autosave draw permissions", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "all_members",
    };
    mocks.state.members = [
      { bowl_id: "bowl-1", user_id: "owner-1", role: "Owner", email: "owner@example.com" },
      { bowl_id: "bowl-1", user_id: "member-1", role: "Member", email: "member@example.com" },
      { bowl_id: "bowl-1", user_id: "member-2", role: "Member", email: "member2@example.com" },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/only selected members/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/only selected members/i));
    fireEvent.click(screen.getByLabelText(/member@example.com/i));
    expect(screen.queryByRole("button", { name: /save draw access/i })).not.toBeInTheDocument();
    await settleAutosave();

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("save_bowl_draw_access", {
      p_bowl_id: "bowl-1",
      p_mode: "selected_members",
      p_allowed_user_ids: ["member-1"],
    });
    expect(mocks.state.bowl.draw_access_mode).toBe("selected_members");
    expect(mocks.state.drawPermissions).toEqual([
      { bowl_id: "bowl-1", user_id: "member-1" },
    ]);
  });

  it("owner can switch back to everyone and autosave cleared draw permissions", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "selected_members",
    };
    mocks.state.drawPermissions = [{ bowl_id: "bowl-1", user_id: "member-1" }];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/everyone in bowl/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/everyone in bowl/i));
    await settleAutosave();

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("save_bowl_draw_access", {
      p_bowl_id: "bowl-1",
      p_mode: "all_members",
      p_allowed_user_ids: [],
    });
    expect(mocks.state.bowl.draw_access_mode).toBe("all_members");
    expect(mocks.state.drawPermissions).toEqual([]);
  });

  it("hides draw access controls for non-owner", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "selected_members",
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByText("Bowl 1")).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: /draw access/i })).not.toBeInTheDocument();
  });

  it("keeps draw access unchanged when atomic saving fails", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "selected_members",
    };
    mocks.state.drawPermissions = [{ bowl_id: "bowl-1", user_id: "member-1" }];
    mocks.state.errors.saveDrawAccess = { message: "database unavailable" };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/everyone in bowl/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/everyone in bowl/i));
    await settleAutosave();

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to update draw access\./i);
    expect(mocks.state.bowl.draw_access_mode).toBe("selected_members");
    expect(mocks.state.drawPermissions).toEqual([
      { bowl_id: "bowl-1", user_id: "member-1" },
    ]);
  });

  it("shows the draw method control for owner and defaults to person-first", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/person-first/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/person-first/i)).toBeChecked();
    expect(screen.getByLabelText(/title-first/i)).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /save draw method/i })).not.toBeInTheDocument();
  });

  it("owner can switch the bowl to title-first with autosave", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/title-first/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/title-first/i));
    await settleAutosave();

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("save_bowl_draw_method", {
      p_bowl_id: "bowl-1",
      p_method: "title_first",
    });
    expect(mocks.state.bowl.draw_method).toBe("title_first");
    expect(screen.getByLabelText(/title-first/i)).toBeChecked();
  });

  it("owner can switch the bowl to rotation with autosave", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^rotation/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/^rotation/i));
    await settleAutosave();

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("save_bowl_draw_method", {
      p_bowl_id: "bowl-1",
      p_method: "rotation",
    });
    expect(mocks.state.bowl.draw_method).toBe("rotation");
    expect(screen.getByLabelText(/^rotation/i)).toBeChecked();
  });

  it("keeps the draw method unchanged when saving fails", async () => {
    mocks.state.errors.saveDrawMethod = { message: "database unavailable" };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/title-first/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText(/title-first/i));
    await settleAutosave();

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to update the draw method\./i);
    expect(mocks.state.bowl.draw_method).toBeUndefined();
  });

  it("shows rotation to a non-owner as read-only", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "all_members",
      draw_method: "rotation",
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /draw method/i })).toBeInTheDocument();
    });

    // Scoped to the section: the header tile names the method too.
    const drawingSection = screen.getByRole("region", { name: "Drawing" });
    expect(within(drawingSection).getByText("Rotation")).toBeInTheDocument();
    expect(screen.getByText(/only the bowl owner can change this/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/person-first/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save draw method/i })).not.toBeInTheDocument();
  });

  it("validates invite input errors before creating an invite", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("friend@example.com")).toBeInTheDocument();
    });

    const inviteInput = screen.getByPlaceholderText("friend@example.com");
    const inviteForm = inviteInput.closest("form");

    fireEvent.change(inviteInput, {
      target: { value: "bad-email" },
    });
    fireEvent.submit(inviteForm);
    expect(screen.getByText(/invalid email:/i)).toBeInTheDocument();

    fireEvent.change(inviteInput, {
      target: { value: "a@example.com, b@example.com" },
    });
    fireEvent.submit(inviteForm);
    expect(screen.getByText(/please enter one email at a time\./i)).toBeInTheDocument();

    expect(mocks.state.insertedInvites).toHaveLength(0);
  });

  it("allows owner to remove a member", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
    });
  });

  it("keeps Delete Bowl disabled until the confirmation text matches exactly", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete bowl$/i })).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /^delete bowl$/i });
    const confirmInput = screen.getByPlaceholderText('Type "DELETE"');

    expect(deleteButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: "delete" } });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: "  DELETE  " } });
    expect(deleteButton).toBeEnabled();
  });

  // The disabled button is the affordance; this is the guard behind it, so it
  // is exercised by submitting the form directly.
  it("prevents deleting a bowl without the DELETE confirmation text", async () => {
    const { container } = render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete bowl$/i })).toBeInTheDocument();
    });

    fireEvent.submit(container.querySelector("#delete-bowl-confirm").closest("form"));

    expect(screen.getByText('Type "DELETE" to confirm bowl deletion.')).toBeInTheDocument();
    expect(mocks.supabase.rpc).not.toHaveBeenCalledWith("delete_owned_bowl", expect.anything());
    expect(mocks.state.navigate).not.toHaveBeenCalled();
  });

  it("deletes the bowl atomically when confirmed by the owner", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete bowl$/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Type "DELETE"'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete bowl$/i }));

    await waitFor(() => {
      expect(mocks.state.navigate).toHaveBeenCalledWith("/bowls", { replace: true });
    });

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("delete_owned_bowl", {
      p_bowl_id: "bowl-1",
    });

    const deleteOps = mocks.state.operations.filter((op) => op.action === "delete");
    expect(deleteOps.some((op) => op.table === "bowl_movies")).toBe(false);
    expect(deleteOps.some((op) => op.table === "bowl_invites")).toBe(false);
    expect(deleteOps.some((op) => op.table === "bowl_members")).toBe(false);
    expect(deleteOps.some((op) => op.table === "bowls")).toBe(false);
  });

  it("keeps the bowl intact when atomic deletion fails", async () => {
    mocks.state.errors.deleteOwnedBowl = { message: "database unavailable" };
    const membersBefore = [...mocks.state.members];
    const invitesBefore = [...mocks.state.invites];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete bowl$/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Type "DELETE"'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete bowl$/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to delete bowl\./i)).toBeInTheDocument();
    });
    expect(mocks.state.navigate).not.toHaveBeenCalled();
    expect(mocks.state.members).toEqual(membersBefore);
    expect(mocks.state.invites).toEqual(invitesBefore);
  });

  it("summarizes drawing, people, and add links in the header nav", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "selected_members",
      draw_method: "rotation",
    };
    mocks.state.members = [
      { bowl_id: "bowl-1", user_id: "owner-1", role: "Owner", email: "owner@example.com" },
      { bowl_id: "bowl-1", user_id: "member-1", role: "Member", email: "member@example.com" },
    ];
    mocks.state.drawPermissions = [{ bowl_id: "bowl-1", user_id: "member-1" }];
    mocks.state.invites = [
      {
        id: "invite-1",
        bowl_id: "bowl-1",
        invited_email: "friend@example.com",
        token: "token-1",
        accepted_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
      },
    ];
    mocks.state.addLinks = [
      {
        id: "link-1",
        bowl_id: "bowl-1",
        token: "token-1",
        max_adds: 3,
        adds_used: 3,
        default_contributor_name: "Dad",
        revoked_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
        created_by: "owner-1",
      },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /settings sections/i })).toBeInTheDocument();
    });

    const links = within(
      screen.getByRole("navigation", { name: /settings sections/i })
    ).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#drawing",
      "#people",
      "#add-links",
    ]);
    // Owner is always allowed, plus the one selected member.
    expect(links[0]).toHaveTextContent("Rotation • 2 can draw");
    expect(links[1]).toHaveTextContent("2 members • 1 pending");
    expect(links[2]).toHaveTextContent("0 active of 1");
  });

  it("keeps owner-only state out of a member's header nav", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "selected_members",
      draw_method: "rotation",
    };
    mocks.state.members = [
      { bowl_id: "bowl-1", user_id: "owner-1", role: "Owner", email: "owner@example.com" },
      { bowl_id: "bowl-1", user_id: "member-1", role: "Member", email: "member@example.com" },
    ];
    mocks.state.invites = [
      {
        id: "invite-1",
        bowl_id: "bowl-1",
        invited_email: "friend@example.com",
        token: "token-1",
        accepted_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
      },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /settings sections/i })).toBeInTheDocument();
    });

    const links = within(
      screen.getByRole("navigation", { name: /settings sections/i })
    ).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Rotation");
    expect(links[0]).not.toHaveTextContent("can draw");
    expect(links[1]).toHaveTextContent("2 members");
    expect(links[1]).not.toHaveTextContent("pending");
  });

  it("confirms on the copy button itself, not only in the page banner", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    mocks.state.addLinks = [
      {
        id: "link-1",
        bowl_id: "bowl-1",
        token: "token-1",
        max_adds: 3,
        adds_used: 0,
        default_contributor_name: "Dad",
        revoked_at: null,
        created_at: "2026-04-06T00:00:00.000Z",
        created_by: "owner-1",
      },
    ];

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy add link/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy add link/i }));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/add-to-bowl/token-1"));
    expect(screen.getByRole("button", { name: /copy add link/i })).toHaveTextContent("Copied");
    expect(screen.getByText(/add link copied\./i)).toBeInTheDocument();
  });
});
