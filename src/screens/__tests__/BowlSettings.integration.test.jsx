import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    insertedAddLinks: [],
    insertedDrawPermissions: [],
    updatedBowls: [],
    errors: {
      loadBowl: null,
      loadMembers: null,
      loadInvites: null,
      loadDrawPermissions: null,
      loadAddLinks: null,
      insertInvite: null,
      insertAddLink: null,
      insertDrawPermissions: null,
      updateBowl: null,
      updateDrawAccessMode: null,
      revokeAddLink: null,
      deleteInvite: null,
      deleteMember: null,
      deleteDrawPermissions: null,
      deleteMovies: null,
      deleteBowlInvites: null,
      deleteBowlMembers: null,
      deleteBowl: null,
      verifyMembership: null,
      refreshQueuePromotions: null,
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
          profiles: { email: m.email },
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
      const rows = state.invites.filter((i) => i.bowl_id === bowlId);
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
      if (state.errors.revokeAddLink) {
        return { data: null, error: state.errors.revokeAddLink };
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
    rpc: vi.fn(async (fnName) => {
      if (fnName === "refresh_bowl_queue_promotions") {
        if (state.errors.refreshQueuePromotions) {
          return { data: null, error: state.errors.refreshQueuePromotions };
        }
        return { data: 0, error: null };
      }
      return { data: null, error: null };
    }),
  };

  return { state, supabase };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/inviteEmails", () => ({
  sendInviteEmails: vi.fn(async () => mocks.state.sendInviteEmailsResult),
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
  });

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
    mocks.state.insertedAddLinks = [];
    mocks.state.insertedDrawPermissions = [];
    mocks.state.updatedBowls = [];
    mocks.state.errors = {
      loadBowl: null,
      loadMembers: null,
      loadInvites: null,
      loadDrawPermissions: null,
      loadAddLinks: null,
      insertInvite: null,
      insertAddLink: null,
      insertDrawPermissions: null,
      updateBowl: null,
      updateDrawAccessMode: null,
      revokeAddLink: null,
      deleteInvite: null,
      deleteMember: null,
      deleteDrawPermissions: null,
      deleteMovies: null,
      deleteBowlInvites: null,
      deleteBowlMembers: null,
      deleteBowl: null,
      verifyMembership: null,
      refreshQueuePromotions: null,
    };
    mocks.supabase.rpc.mockClear();
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
      expect(mocks.state.navigate).toHaveBeenCalledWith("/", { replace: true });
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
      expect(mocks.state.navigate).toHaveBeenCalledWith("/", { replace: true });
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

    expect(mocks.state.insertedInvites).toHaveLength(1);
    expect(mocks.state.insertedInvites[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      invited_email: "newfriend@example.com",
      invited_by: "owner-1",
    });
    expect(screen.getByText("newfriend@example.com")).toBeInTheDocument();
  });

  it("allows a member to create and revoke an add link", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));

    await waitFor(() => {
      expect(screen.getByText(/add link revoked\./i)).toBeInTheDocument();
    });
  });

  it("allows updating an add link contributor label without mutating prior rows", async () => {
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

    const labelInputs = screen.getAllByDisplayValue("Dad");
    fireEvent.change(labelInputs[labelInputs.length - 1], {
      target: { value: "Grandpa" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save label/i }));

    await waitFor(() => {
      expect(screen.getByText(/add link label updated/i)).toBeInTheDocument();
    });

    expect(
      mocks.state.addLinks.find((link) => link.id === "link-1")?.default_contributor_name
    ).toBe("Grandpa");
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

  it("allows owner to update bowl name and contribution lead", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      max_contribution_lead: 1,
      draw_access_mode: "all_members",
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Bowl 1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("Bowl 1"), {
      target: { value: "Renamed Bowl" },
    });
    fireEvent.change(screen.getByLabelText(/max contribution lead/i), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/bowl settings updated\./i)).toBeInTheDocument();
    });

    expect(mocks.state.updatedBowls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Renamed Bowl",
          max_contribution_lead: 3,
        }),
      ])
    );
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("refresh_bowl_queue_promotions", {
      p_bowl_id: "bowl-1",
    });
  });

  it("shows a non-blocking warning when queue refresh rpc is missing", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      max_contribution_lead: 2,
      draw_access_mode: "all_members",
    };
    mocks.state.errors.refreshQueuePromotions = {
      code: "42883",
      message: 'function refresh_bowl_queue_promotions(uuid) does not exist',
    };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Bowl 1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/max contribution lead/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/queue refresh is unavailable until the latest database migration is applied/i)
      ).toBeInTheDocument();
    });
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

  it("owner can switch to selected members and save draw permissions", async () => {
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

    fireEvent.click(screen.getByLabelText(/only selected members/i));
    fireEvent.click(screen.getByLabelText(/member@example.com/i));
    fireEvent.click(screen.getByRole("button", { name: /save draw access/i }));

    await waitFor(() => {
      expect(
        mocks.state.updatedBowls.some((row) => row.draw_access_mode === "selected_members")
      ).toBe(true);
    });

    expect(mocks.state.updatedBowls).toEqual(
      expect.arrayContaining([expect.objectContaining({ draw_access_mode: "selected_members" })])
    );
    expect(mocks.state.insertedDrawPermissions).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ bowl_id: "bowl-1", user_id: "member-1" })],
      ])
    );
  });

  it("owner can switch back to everyone and clear selected draw permissions", async () => {
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

    fireEvent.click(screen.getByLabelText(/everyone in bowl/i));
    fireEvent.click(screen.getByRole("button", { name: /save draw access/i }));

    await waitFor(() => {
      expect(
        mocks.state.updatedBowls.some((row) => row.draw_access_mode === "all_members")
      ).toBe(true);
    });

    expect(mocks.state.updatedBowls).toEqual(
      expect.arrayContaining([expect.objectContaining({ draw_access_mode: "all_members" })])
    );
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

  it("shows error when saving draw access fails", async () => {
    mocks.state.bowl = {
      id: "bowl-1",
      name: "Bowl 1",
      owner_id: "owner-1",
      draw_access_mode: "all_members",
    };
    mocks.state.errors.updateDrawAccessMode = { message: "rls" };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save draw access/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /save draw access/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to update draw access mode\./i)).toBeInTheDocument();
    });
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

  it("prevents deleting a bowl without the DELETE confirmation text", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete bowl/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete bowl$/i }));

    expect(screen.getByText('Type "DELETE" to confirm bowl deletion.')).toBeInTheDocument();
    expect(mocks.state.navigate).not.toHaveBeenCalled();
  });

  it("deletes the bowl and related rows when confirmed by the owner", async () => {
    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete bowl$/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Type "DELETE"'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete bowl$/i }));

    await waitFor(() => {
      expect(mocks.state.navigate).toHaveBeenCalledWith("/", { replace: true });
    });

    const deleteOps = mocks.state.operations.filter((op) => op.action === "delete");
    expect(deleteOps.some((op) => op.table === "bowl_movies")).toBe(true);
    expect(deleteOps.some((op) => op.table === "bowl_invites")).toBe(true);
    expect(deleteOps.some((op) => op.table === "bowl_members")).toBe(true);
    expect(deleteOps.some((op) => op.table === "bowls")).toBe(true);
  });

  it("shows an error when bowl deletion fails partway through", async () => {
    mocks.state.errors.deleteBowlMembers = { message: "rls" };

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete bowl$/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Type "DELETE"'), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^delete bowl$/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to delete bowl members\./i)).toBeInTheDocument();
    });
    expect(mocks.state.navigate).not.toHaveBeenCalled();
  });
});
