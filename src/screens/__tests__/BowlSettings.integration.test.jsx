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
  };

  function getEq(filters, key) {
    const hit = filters.find((f) => f.type === "eq" && f.key === key);
    return hit ? hit.value : undefined;
  }

  function resolveQuery(table, queryState, terminal) {
    if (queryState.action === "select" && table === "bowls" && terminal === "single") {
      const requestedId = getEq(queryState.filters, "id");
      const data = requestedId === state.bowl.id ? state.bowl : null;
      return { data, error: data ? null : { message: "Not found" } };
    }

    if (queryState.action === "select" && table === "bowl_members" && terminal === "order") {
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
      const bowlId = getEq(queryState.filters, "bowl_id");
      const userId = getEq(queryState.filters, "user_id");
      const row = state.members.find((m) => m.bowl_id === bowlId && m.user_id === userId);
      return { data: row ? { user_id: row.user_id } : null, error: null };
    }

    if (queryState.action === "select" && table === "bowl_invites" && terminal === "order") {
      const bowlId = getEq(queryState.filters, "bowl_id");
      const rows = state.invites.filter((i) => i.bowl_id === bowlId);
      return { data: rows, error: null };
    }

    if (queryState.action === "delete" && table === "bowl_invites" && terminal === "then") {
      const id = getEq(queryState.filters, "id");
      const bowlId = getEq(queryState.filters, "bowl_id");
      const invitedEmail = getEq(queryState.filters, "invited_email");

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
      state.members = state.members.filter((m) => !(m.bowl_id === bowlId && m.user_id === userId));
      return { data: [], error: null };
    }

    return { data: null, error: null };
  }

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.authUser },
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
      expect(mocks.state.navigate).toHaveBeenCalledWith("/", { replace: true });
    });

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
    });

    const deleteOps = mocks.state.operations.filter((op) => op.action === "delete");
    expect(deleteOps.some((op) => op.table === "bowl_members")).toBe(true);
    expect(deleteOps.some((op) => op.table === "bowl_movies")).toBe(false);

    confirmSpy.mockRestore();
  });
});
