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
  });

  afterEach(() => {
    cleanup();
  });

  it("creates a bowl with optional contribution limit and invites", async () => {
    render(<MyBowlsScreen />);

    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), {
      target: { value: "friend@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/max contribution lead \(optional\)/i), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText("Weekend Bowl")).toBeInTheDocument());

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
