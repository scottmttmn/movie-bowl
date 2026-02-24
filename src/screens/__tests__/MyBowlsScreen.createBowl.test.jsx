import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(),
    authCallCount: 0,
    insertedBowls: [],
    insertedMembers: [],
    insertedInvites: [],
  };

  const supabase = {
    auth: {
      getUser: vi.fn(async () => {
        state.authCallCount += 1;

        // First call is from initial load effect; skip DB fetch branch by returning no user.
        if (state.authCallCount === 1) {
          return { data: { user: null }, error: new Error("Not authenticated") };
        }

        return { data: { user: { id: "u1" } }, error: null };
      }),
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
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
          then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
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
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
  };
});

import MyBowlsScreen from "../MyBowlsScreen";

describe("MyBowlsScreen create bowl", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.authCallCount = 0;
    mocks.state.insertedBowls = [];
    mocks.state.insertedMembers = [];
    mocks.state.insertedInvites = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("creates a bowl with optional contribution limit and invites", async () => {
    render(<MyBowlsScreen />);

    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));

    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), {
      target: { value: "Weekend Bowl" },
    });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), {
      target: { value: "friend@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/max contribution lead \(optional\)/i), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText("Weekend Bowl")).toBeInTheDocument();
    });

    expect(mocks.state.insertedBowls).toHaveLength(1);
    expect(mocks.state.insertedBowls[0][0]).toMatchObject({
      owner_id: "u1",
      name: "Weekend Bowl",
      max_contribution_lead: 2,
    });

    expect(mocks.state.insertedMembers).toHaveLength(1);
    expect(mocks.state.insertedMembers[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      user_id: "u1",
      role: "Owner",
    });

    expect(mocks.state.insertedInvites).toHaveLength(1);
    expect(mocks.state.insertedInvites[0][0]).toMatchObject({
      bowl_id: "bowl-1",
      invited_email: "friend@example.com",
      invited_by: "u1",
    });
  });
});

