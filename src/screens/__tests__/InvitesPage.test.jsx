import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: {
    navigate: vi.fn(),
    search: "",
    accountEmail: "user@example.com",
    bowls: [],
    received: [],
    isReceivedLoading: false,
    acceptInvite: vi.fn(async () => ({ error: null })),
    declineInvite: vi.fn(async () => ({ error: null })),
    sentInvitations: [],
    sentLoadError: null,
    isSending: false,
    send: vi.fn(async () => ({ ok: true, message: "Sent 1 invitation to Friday Night." })),
    revoke: vi.fn(async () => ({ ok: true, message: "Invitation revoked for friend@example.com." })),
    refreshSent: vi.fn(),
  },
}));

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ session: { user: { email: mocks.state.accountEmail } } }),
}));
vi.mock("../../hooks/useUserBowls", () => ({
  default: () => ({ bowls: mocks.state.bowls, refresh: vi.fn(async () => null) }),
}));
vi.mock("../../hooks/usePendingInvites", () => ({
  default: () => ({
    invites: mocks.state.received,
    isLoading: mocks.state.isReceivedLoading,
    acceptInvite: mocks.state.acceptInvite,
    declineInvite: mocks.state.declineInvite,
  }),
}));
vi.mock("../../hooks/useSentInvitations", () => ({
  default: () => ({
    invitations: mocks.state.sentInvitations,
    isLoading: false,
    loadError: mocks.state.sentLoadError,
    isSending: mocks.state.isSending,
    refresh: mocks.state.refreshSent,
    send: mocks.state.send,
    revoke: mocks.state.revoke,
  }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.state.navigate,
    useSearchParams: () => [new URLSearchParams(mocks.state.search), vi.fn()],
  };
});

import { MemoryRouter } from "react-router-dom";
import InvitesPage from "../InvitesPage";

const OWNED = { id: "bowl-1", name: "Friday Night", role: "Owner" };
const OWNED_2 = { id: "bowl-2", name: "Family Movies", role: "Owner" };
const SHARED = { id: "bowl-9", name: "Work Crew", role: "Member" };

function renderHub() {
  return render(<MemoryRouter><InvitesPage /></MemoryRouter>);
}

describe("InvitesPage", () => {
  beforeEach(() => {
    Object.assign(mocks.state, {
      search: "",
      accountEmail: "user@example.com",
      bowls: [OWNED, SHARED],
      received: [],
      isReceivedLoading: false,
      sentInvitations: [],
      sentLoadError: null,
      isSending: false,
    });
    mocks.state.navigate.mockReset();
    mocks.state.acceptInvite.mockReset().mockResolvedValue({ error: null });
    mocks.state.declineInvite.mockReset().mockResolvedValue({ error: null });
    mocks.state.send.mockReset().mockResolvedValue({ ok: true, message: "Sent 1 invitation to Friday Night." });
    mocks.state.revoke.mockReset().mockResolvedValue({ ok: true, message: "Invitation revoked for friend@example.com." });
    mocks.state.refreshSent.mockReset();
  });

  afterEach(cleanup);

  it("separates received, sending, and sent into their own sections", () => {
    renderHub();

    expect(screen.getByRole("heading", { level: 1, name: "Invitations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Received invitations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Invite people" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Pending invitations sent" })).toBeInTheDocument();
  });

  it("names the account in the received empty state", () => {
    renderHub();

    expect(screen.getByText("No pending invitations")).toBeInTheDocument();
    expect(screen.getByText(/sent to user@example.com/i)).toBeInTheDocument();
  });

  it("accepts a received invitation and opens the joined bowl", async () => {
    mocks.state.received = [{ id: "inv-1", bowl_id: "bowl-7", bowl_name: "Film Club", invited_by_email: "alex@example.com" }];

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: /accept invitation to Film Club/i }));

    await waitFor(() => expect(mocks.state.acceptInvite).toHaveBeenCalled());
    expect(mocks.state.navigate).toHaveBeenCalledWith("/bowl/bowl-7");
  });

  it("confirms before declining and leaves the invitation alone on cancel", async () => {
    mocks.state.received = [{ id: "inv-1", bowl_id: "bowl-7", bowl_name: "Film Club" }];

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: /decline invitation to Film Club/i }));

    expect(screen.getByRole("dialog", { name: /decline the invitation to Film Club/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep invitation/i }));
    expect(mocks.state.declineInvite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /decline invitation to Film Club/i }));
    fireEvent.click(screen.getByRole("button", { name: /^decline invitation$/i }));
    await waitFor(() => expect(mocks.state.declineInvite).toHaveBeenCalled());
  });

  it("keeps a failed decline listed and explains why", async () => {
    mocks.state.received = [{ id: "inv-1", bowl_id: "bowl-7", bowl_name: "Film Club" }];
    mocks.state.declineInvite.mockResolvedValue({ error: "This invite is no longer available." });

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: /decline invitation to Film Club/i }));
    fireEvent.click(screen.getByRole("button", { name: /^decline invitation$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This invite is no longer available."));
    expect(screen.getByRole("button", { name: /accept invitation to Film Club/i })).toBeInTheDocument();
  });

  it("preselects the only owned bowl and offers shared bowls to nobody", () => {
    renderHub();

    const select = screen.getByLabelText("Bowl");
    expect(select).toHaveValue("bowl-1");
    expect(within(select).queryByText("Work Crew")).not.toBeInTheDocument();
  });

  it("refuses to guess between several owned bowls", () => {
    mocks.state.bowls = [OWNED, OWNED_2, SHARED];

    renderHub();

    expect(screen.getByLabelText("Bowl")).toHaveValue("");
  });

  it("honours a bowl the caller still owns and ignores one they do not", () => {
    mocks.state.bowls = [OWNED, OWNED_2];
    mocks.state.search = "bowl=bowl-2";
    const { unmount } = renderHub();
    expect(screen.getByLabelText("Bowl")).toHaveValue("bowl-2");
    unmount();

    mocks.state.search = "bowl=bowl-9";
    renderHub();
    expect(screen.getByLabelText("Bowl")).toHaveValue("");
  });

  it("sends parsed addresses and reports the outcome", async () => {
    mocks.state.send.mockResolvedValue({ ok: true, message: "Sent 2 invitations to Friday Night." });

    renderHub();
    fireEvent.change(screen.getByLabelText("Email addresses"), {
      target: { value: "one@example.com, two@example.com" },
    });
    expect(screen.getByRole("button", { name: "Send 2 invitations" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send 2 invitations" }));

    await waitFor(() => expect(mocks.state.send).toHaveBeenCalledWith(expect.objectContaining({
      bowlId: "bowl-1",
      emails: ["one@example.com", "two@example.com"],
    })));
    await waitFor(() => expect(screen.getByText("Sent 2 invitations to Friday Night.")).toBeInTheDocument());
    expect(screen.getByLabelText("Email addresses")).toHaveValue("");
  });

  it("rejects invalid addresses before sending anything", async () => {
    renderHub();
    fireEvent.change(screen.getByLabelText("Email addresses"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid email(s): nope"));
    expect(mocks.state.send).not.toHaveBeenCalled();
  });

  it("tells a member with no owned bowls that only owners can invite", () => {
    mocks.state.bowls = [SHARED];

    renderHub();

    expect(screen.getByText(/only an owner can invite new members/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Bowl")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create a bowl/i })).toBeInTheDocument();
  });

  it("groups sent invitations by bowl and confirms before revoking", async () => {
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-1", invited_email: "friend@example.com", token: "tok-1", created_at: null },
    ];

    renderHub();
    expect(screen.getByRole("heading", { level: 3, name: "Friday Night" })).toBeInTheDocument();
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /revoke invitation for friend@example.com/i }));
    expect(screen.getByRole("dialog", { name: /revoke friend@example.com's invitation to Friday Night/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^revoke invitation$/i }));

    await waitFor(() => expect(mocks.state.revoke).toHaveBeenCalledWith(expect.objectContaining({
      bowlId: "bowl-1",
      invitationId: "s1",
    })));
    await waitFor(() => expect(screen.getByText("Invitation revoked for friend@example.com.")).toBeInTheDocument());
  });

  it("offers a retry when sent invitations could not load", () => {
    mocks.state.sentLoadError = "Could not load the invitations you sent. Try again.";

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(mocks.state.refreshSent).toHaveBeenCalled();
  });
});
