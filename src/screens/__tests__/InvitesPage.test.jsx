import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(),
    sessionUser: { id: "u1", email: "user@example.com" },
    pendingInvites: [],
    bowlNames: [],
    profileRows: [],
    updatedInvites: [],
    deletedInvites: [],
    memberInsertError: null,
    deleteError: null,
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: state.sessionUser ? { user: state.sessionUser } : null },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({
      data: state.profileRows.map((row) => ({ user_id: row.id, email: row.email })),
      error: null,
    })),
    from: vi.fn((table) => {
      if (table === "bowls") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: state.bowlNames, error: null })),
          })),
        };
      }

      if (table === "bowl_members") {
        return {
          insert: vi.fn(async () => ({ error: state.memberInsertError })),
        };
      }

      if (table === "bowl_invites") {
        return {
          select: vi.fn(() => ({
            is: vi.fn(() => ({
              ilike: vi.fn((field, email) => ({
                order: vi.fn(async () => {
                  const target = String(email || "").toLowerCase();
                  return {
                    data: state.pendingInvites.filter(
                      (invite) =>
                        String(invite.invited_email || "").toLowerCase() === target
                    ),
                    error: null,
                  };
                }),
              })),
            })),
          })),
          update: vi.fn((payload) => ({
            eq: vi.fn((key, value) => ({
              ilike: vi.fn(async () => {
                state.updatedInvites.push({ payload, id: value, key });
                return { data: null, error: null };
              }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn((key, value) => ({
              ilike: vi.fn(async () => {
                if (state.deleteError) return { data: null, error: state.deleteError };
                state.deletedInvites.push({ id: value });
                return { data: null, error: null };
              }),
            })),
          })),
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

import InvitesPage from "../InvitesPage";
import { PendingInvitesProvider } from "../../hooks/usePendingInvites";

function renderInvitesPage() {
  return render(
    <PendingInvitesProvider>
      <InvitesPage />
    </PendingInvitesProvider>
  );
}

describe("InvitesPage", () => {
  beforeEach(() => {
    mocks.state.navigate.mockReset();
    mocks.state.sessionUser = { id: "u1", email: "user@example.com" };
    mocks.state.pendingInvites = [];
    mocks.state.bowlNames = [];
    mocks.state.profileRows = [];
    mocks.state.updatedInvites = [];
    mocks.state.deletedInvites = [];
    mocks.state.memberInsertError = null;
    mocks.state.deleteError = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows an empty state when nothing is pending", async () => {
    renderInvitesPage();

    await waitFor(() =>
      expect(screen.getByText(/you have no pending invites/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/0 pending invites waiting for your response/i)).toBeInTheDocument();
  });

  it("lists pending invites with bowl and sender details", async () => {
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        created_at: "2026-04-24T12:00:00.000Z",
      },
    ];
    mocks.state.bowlNames = [{ id: "bowl-2", name: "Friday Bowl" }];
    mocks.state.profileRows = [{ id: "owner-1", email: "owner@example.com" }];

    renderInvitesPage();

    await waitFor(() => expect(screen.getByText("Friday Bowl")).toBeInTheDocument());
    expect(screen.getByText(/invited by owner@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/1 pending invite waiting for your response/i)).toBeInTheDocument();
  });

  it("accepts an invite and navigates to the bowl", async () => {
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        created_at: "2026-04-24T12:00:00.000Z",
      },
    ];
    mocks.state.bowlNames = [{ id: "bowl-2", name: "Friday Bowl" }];

    renderInvitesPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(mocks.state.navigate).toHaveBeenCalledWith("/bowl/bowl-2"));
    expect(mocks.state.updatedInvites).toHaveLength(1);
    expect(screen.queryByText("Friday Bowl")).not.toBeInTheDocument();
  });

  it("declines an invite and reports it", async () => {
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        created_at: "2026-04-24T12:00:00.000Z",
      },
    ];
    mocks.state.bowlNames = [{ id: "bowl-2", name: "Friday Bowl" }];

    renderInvitesPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));

    await waitFor(() => expect(screen.getByText(/invite declined/i)).toBeInTheDocument());
    expect(mocks.state.deletedInvites).toHaveLength(1);
    expect(screen.getByText(/you have no pending invites/i)).toBeInTheDocument();
  });

  it("surfaces an error when declining fails and keeps the invite listed", async () => {
    mocks.state.deleteError = { message: "boom" };
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "user@example.com",
        invited_by: "owner-1",
        created_at: "2026-04-24T12:00:00.000Z",
      },
    ];
    mocks.state.bowlNames = [{ id: "bowl-2", name: "Friday Bowl" }];

    renderInvitesPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));

    await waitFor(() => expect(screen.getByText(/failed to decline invite/i)).toBeInTheDocument());
    expect(screen.getByText("Friday Bowl")).toBeInTheDocument();
  });

  it("ignores invites addressed to a different account", async () => {
    mocks.state.pendingInvites = [
      {
        id: "inv-1",
        bowl_id: "bowl-2",
        invited_email: "someone-else@example.com",
        invited_by: "owner-1",
        created_at: "2026-04-24T12:00:00.000Z",
      },
    ];

    renderInvitesPage();

    await waitFor(() =>
      expect(screen.getByText(/you have no pending invites/i)).toBeInTheDocument()
    );
  });
});
