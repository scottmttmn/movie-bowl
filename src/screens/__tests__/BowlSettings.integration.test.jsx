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
    operations: [],
    insertedInvites: [],
    updatedBowls: [],
    errors: {
      loadBowl: null,
      loadMembers: null,
      loadInvites: null,
      insertInvite: null,
      updateBowl: null,
      deleteInvite: null,
      deleteMember: null,
      deleteMovies: null,
      deleteBowlInvites: null,
      deleteBowlMembers: null,
      deleteBowl: null,
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

    if (queryState.action === "update" && table === "bowls" && terminal === "then") {
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
    mocks.state.updatedBowls = [];
    mocks.state.errors = {
      loadBowl: null,
      loadMembers: null,
      loadInvites: null,
      insertInvite: null,
      updateBowl: null,
      deleteInvite: null,
      deleteMember: null,
      deleteMovies: null,
      deleteBowlInvites: null,
      deleteBowlMembers: null,
      deleteBowl: null,
      verifyMembership: null,
    };
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

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave bowl/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /leave bowl/i }));

    await waitFor(() => {
      expect(mocks.state.navigate).toHaveBeenCalledWith("/", { replace: true });
    }, { timeout: 3000 });

    window.confirm = originalConfirm;
  });

  it("leaving a bowl does not delete bowl movies", async () => {
    mocks.state.authUser = { id: "member-1", email: "member@example.com" };

    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(<BowlSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave bowl/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /leave bowl/i }));

    await waitFor(() => {
      expect(mocks.state.navigate).toHaveBeenCalledWith("/", { replace: true });
    }, { timeout: 3000 });

    const deleteOps = mocks.state.operations.filter((op) => op.action === "delete");
    expect(deleteOps.some((op) => op.table === "bowl_members")).toBe(true);
    expect(deleteOps.some((op) => op.table === "bowl_movies")).toBe(false);

    window.confirm = originalConfirm;
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
