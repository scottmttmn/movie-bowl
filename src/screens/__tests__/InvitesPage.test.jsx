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
    receivedLoadError: null,
    reloadInvites: vi.fn(async () => null),
    bowlsLoading: false,
    bowlsError: null,
    acceptInvite: vi.fn(async () => ({ error: null })),
    declineInvite: vi.fn(async () => ({ error: null })),
    sentInvitations: [],
    sentLoadError: null,
    isSending: false,
    send: vi.fn(async () => ({ ok: true, message: "Sent 1 invitation to Friday Night." })),
    revoke: vi.fn(async () => ({ ok: true, message: "Invitation revoked for friend@example.com." })),
    refreshSent: vi.fn(),
    people: { status: "idle", members: [], invites: [], names: {} },
    peopleBowlIds: [],
  },
}));

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ session: { user: { id: "user-1", email: mocks.state.accountEmail } } }),
}));
vi.mock("../../hooks/useBowlPeople", () => ({
  default: (bowlId, { enabled } = {}) => {
    if (enabled) mocks.state.peopleBowlIds.push(bowlId);
    return enabled ? mocks.state.people : { status: "idle", members: [], invites: [], names: {} };
  },
}));
vi.mock("../../hooks/useUserBowls", () => ({
  default: () => ({
    bowls: mocks.state.bowls,
    loading: mocks.state.bowlsLoading,
    error: mocks.state.bowlsError,
    refresh: vi.fn(async () => null),
  }),
}));
vi.mock("../../hooks/usePendingInvites", () => ({
  default: () => ({
    invites: mocks.state.received,
    isLoading: mocks.state.isReceivedLoading,
    error: mocks.state.receivedLoadError,
    reloadInvites: mocks.state.reloadInvites,
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
      receivedLoadError: null,
      bowlsLoading: false,
      bowlsError: null,
      people: { status: "idle", members: [], invites: [], names: {} },
      peopleBowlIds: [],
    });
    mocks.state.reloadInvites.mockReset().mockResolvedValue(null);
    mocks.state.navigate.mockReset();
    mocks.state.acceptInvite.mockReset().mockResolvedValue({ error: null });
    mocks.state.declineInvite.mockReset().mockResolvedValue({ error: null });
    mocks.state.send.mockReset().mockResolvedValue({ ok: true, message: "Sent 1 invitation to Friday Night." });
    mocks.state.revoke.mockReset().mockResolvedValue({ ok: true, message: "Invitation revoked for friend@example.com." });
    mocks.state.refreshSent.mockReset();
  });

  afterEach(cleanup);

  it("has two jobs: invitations for you, then inviting people", () => {
    renderHub();

    expect(screen.getByRole("heading", { level: 1, name: "Invitations" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent))
      .toEqual(["Invitations for you", "Invite people"]);
  });

  it("leaves out the bowl's people for someone who owns no bowls", () => {
    mocks.state.bowls = [SHARED];
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-9", invited_email: "friend@example.com", token: "t", created_at: null },
    ];

    renderHub();

    expect(screen.queryByRole("heading", { name: "Invited" })).not.toBeInTheDocument();
    expect(mocks.state.peopleBowlIds).toEqual([]);
  });

  it("names the account in the received empty state", () => {
    renderHub();

    expect(screen.getByText("Nothing waiting for user@example.com right now.")).toBeInTheDocument();
  });

  it("accepts a received invitation and opens the joined bowl", async () => {
    mocks.state.received = [{ id: "inv-1", bowl_id: "bowl-7", bowl_name: "Film Club", invited_by_name: "Alex" }];

    renderHub();
    const slip = screen.getByRole("article", { name: "Film Club" });
    expect(within(slip).getByText("Alex")).toBeInTheDocument();
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

  function bowlChoices() {
    return within(screen.getByRole("group", { name: "Invite to" })).getAllByRole("radio");
  }

  it("preselects the only owned bowl and offers shared bowls to nobody", () => {
    renderHub();

    const choices = bowlChoices();
    expect(choices).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Friday Night/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Work Crew/ })).not.toBeInTheDocument();
  });

  it("shows the chosen bowl's people: members, then who is still invited", () => {
    mocks.state.bowls = [OWNED, OWNED_2];
    mocks.state.search = "bowl=bowl-1";
    mocks.state.people = {
      status: "ready",
      members: [
        { userId: "user-1", role: "Owner", displayName: "Scott" },
        { userId: "user-2", role: "Member", displayName: "Casey" },
      ],
      invites: [],
      names: { "user-1": "Scott", "user-2": "Casey" },
    };
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-1", invited_email: "maria@example.com", token: "t1", created_at: null },
      { id: "s2", bowl_id: "bowl-2", invited_email: "grandma@example.com", token: "t2", created_at: null },
    ];

    renderHub();

    expect(mocks.state.peopleBowlIds.at(-1)).toBe("bowl-1");
    const members = screen.getByRole("heading", { level: 3, name: "In the bowl" }).parentElement;
    expect(within(members).getAllByRole("listitem").map((node) => node.textContent)).toEqual(["SYou", "CCasey"]);
    const invited = screen.getByRole("heading", { level: 3, name: "Invited" }).parentElement;
    // Another bowl's invitation is that bowl's business.
    expect(within(invited).getAllByRole("listitem").map((node) => node.textContent)).toEqual(["Mmaria"]);

    const maria = screen.getByRole("button", { name: "maria@example.com, invited" });
    expect(maria).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(maria);
    expect(maria).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Copy invitation link for maria@example.com" })).toBeInTheDocument();
    fireEvent.click(maria);
    expect(screen.queryByRole("button", { name: /revoke invitation for maria/i })).not.toBeInTheDocument();
  });

  it("leaves an unfinished address alone when a person is tapped", () => {
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-1", invited_email: "maria@example.com", token: "t1", created_at: null },
    ];
    renderHub();
    const field = screen.getByLabelText("Email addresses");
    const maria = screen.getByRole("button", { name: "maria@example.com, invited" });

    // Committing would grow the field and move the circle out from under the tap.
    fireEvent.change(field, { target: { value: "sam@example.com" } });
    fireEvent.blur(field, { relatedTarget: maria });
    expect(field).toHaveValue("sam@example.com");

    fireEvent.blur(field);
    expect(screen.getByRole("button", { name: "Remove sam@example.com" })).toBeInTheDocument();
  });

  it("keeps Invite off until there is an address to send", () => {
    renderHub();
    const invite = screen.getByRole("button", { name: "Invite" });
    expect(invite).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email addresses"), { target: { value: "one@example.com" } });
    expect(invite).toBeEnabled();
  });

  it("refuses to guess between several owned bowls", async () => {
    mocks.state.bowls = [OWNED, OWNED_2, SHARED];

    renderHub();

    expect(bowlChoices().every((choice) => !choice.checked)).toBe(true);
    fireEvent.change(screen.getByLabelText("Email addresses"), { target: { value: "one@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Choose a bowl to invite people to."));
    expect(mocks.state.send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Family Movies/ }));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(mocks.state.send).toHaveBeenCalledWith(expect.objectContaining({ bowlId: "bowl-2" })));
  });

  it("honours a bowl the caller still owns and ignores one they do not", () => {
    mocks.state.bowls = [OWNED, OWNED_2];
    mocks.state.search = "bowl=bowl-2";
    const { unmount } = renderHub();
    expect(screen.getByRole("radio", { name: /Family Movies/ })).toBeChecked();
    unmount();

    mocks.state.search = "bowl=bowl-9";
    renderHub();
    expect(bowlChoices().every((choice) => !choice.checked)).toBe(true);
  });

  it("sends the pending-count shortcut to sent, not to the form", () => {
    mocks.state.bowls = [OWNED, OWNED_2];
    mocks.state.search = "bowl=bowl-2";
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-2", invited_email: "friend@example.com", token: "t", created_at: null },
    ];

    render(
      <MemoryRouter initialEntries={["/invites?bowl=bowl-2#sent"]}>
        <InvitesPage />
      </MemoryRouter>
    );

    // The shortcut is bowl-specific: it picks that bowl and lands on the
    // people it is still waiting on.
    expect(screen.getByRole("radio", { name: /Family Movies/ })).toBeChecked();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 3, name: "Invited" }));
  });

  it("waits for the requested group before moving focus to it", async () => {
    mocks.state.bowls = [OWNED, OWNED_2];
    mocks.state.search = "bowl=bowl-2";
    mocks.state.sentInvitations = [];

    const { rerender } = render(
      <MemoryRouter initialEntries={["/invites?bowl=bowl-2#sent"]}>
        <InvitesPage />
      </MemoryRouter>
    );
    expect(screen.queryByRole("heading", { level: 3, name: "Invited" })).not.toBeInTheDocument();

    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-2", invited_email: "friend@example.com", token: "t", created_at: null },
    ];
    rerender(
      <MemoryRouter initialEntries={["/invites?bowl=bowl-2#sent"]}>
        <InvitesPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 3, name: "Invited" })
    ));
  });

  it("sends the invite shortcut to the form", () => {
    mocks.state.bowls = [OWNED, OWNED_2];
    mocks.state.search = "bowl=bowl-2";

    render(
      <MemoryRouter initialEntries={["/invites?bowl=bowl-2#invite-people"]}>
        <InvitesPage />
      </MemoryRouter>
    );

    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Invite people" }));
  });

  it("sends parsed addresses and reports the outcome", async () => {
    mocks.state.send.mockResolvedValue({ ok: true, message: "Sent 2 invitations to Friday Night." });

    renderHub();
    fireEvent.change(screen.getByLabelText("Email addresses"), {
      target: { value: "one@example.com, two@example.com" },
    });
    expect(screen.getByRole("button", { name: "Invite 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invite 2" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid email(s): nope"));
    expect(mocks.state.send).not.toHaveBeenCalled();
  });

  it("turns addresses into chips and flags a bad one before Send", () => {
    renderHub();
    const field = screen.getByLabelText("Email addresses");

    fireEvent.change(field, { target: { value: "One@Example.com, alex@exmaple two@example.com" } });

    // Everything before the last separator is committed; the rest is still typing.
    expect(screen.getByRole("button", { name: "Remove one@example.com" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove alex@exmaple" })).toBeInTheDocument();
    expect(field).toHaveValue("two@example.com");
    expect(screen.getByText("(not a valid address)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("1 address needs fixing before you send.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite 2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove alex@exmaple" }));
    expect(screen.queryByText(/needs fixing/)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(field);
  });

  it("commits on Enter and takes the last chip back on Backspace", () => {
    renderHub();
    const field = screen.getByLabelText("Email addresses");

    fireEvent.change(field, { target: { value: "one@example.com" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field).toHaveValue("");
    expect(screen.getByRole("button", { name: "Remove one@example.com" })).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "one@example.com " } });
    expect(screen.getAllByRole("button", { name: "Remove one@example.com" })).toHaveLength(1);

    fireEvent.keyDown(field, { key: "Backspace" });
    expect(screen.queryByRole("button", { name: "Remove one@example.com" })).not.toBeInTheDocument();
  });

  it("tells a member with no owned bowls that only owners can invite", () => {
    mocks.state.bowls = [SHARED];

    renderHub();

    expect(screen.getByText(/only an owner can invite new members/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Invite to" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create a bowl/i })).toBeInTheDocument();
  });

  it("confirms before revoking an invitation and closes it once revoked", async () => {
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-1", invited_email: "friend@example.com", token: "tok-1", created_at: null },
    ];

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "friend@example.com, invited" }));
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /revoke invitation for friend@example.com/i }));
    expect(screen.getByRole("dialog", { name: /revoke friend@example.com's invitation to Friday Night/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^revoke invitation$/i }));

    await waitFor(() => expect(mocks.state.revoke).toHaveBeenCalledWith(expect.objectContaining({
      bowlId: "bowl-1",
      invitationId: "s1",
    })));
    await waitFor(() => expect(screen.getByText("Invitation revoked for friend@example.com.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /revoke invitation for/i })).not.toBeInTheDocument();
  });

  it("does not turn a failed inbox read into an empty inbox", async () => {
    mocks.state.received = [{ id: "inv-1", bowl_id: "bowl-7", bowl_name: "Film Club" }];
    mocks.state.receivedLoadError = "Could not check for invitations. Try again.";

    renderHub();

    expect(screen.getByText("Film Club")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing waiting for/)).not.toBeInTheDocument();
    const retry = within(screen.getByRole("heading", { level: 2, name: "Invitations for you" }).closest("section"))
      .getByRole("button", { name: /try again/i });
    mocks.state.reloadInvites.mockClear();
    fireEvent.click(retry);
    expect(mocks.state.reloadInvites).toHaveBeenCalled();
  });

  it("re-reads the inbox on entry so a later visit sees new invitations", async () => {
    renderHub();
    await waitFor(() => expect(mocks.state.reloadInvites).toHaveBeenCalled());
  });

  it("announces a completed decline", async () => {
    mocks.state.received = [{ id: "inv-1", bowl_id: "bowl-7", bowl_name: "Film Club" }];

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: /decline invitation to Film Club/i }));
    fireEvent.click(screen.getByRole("button", { name: /^decline invitation$/i }));

    await waitFor(() => expect(screen.getByText("Invitation to Film Club declined.")).toBeInTheDocument());
  });

  it("reports a failed revoke as an error and keeps the row revocable", async () => {
    mocks.state.sentInvitations = [
      { id: "s1", bowl_id: "bowl-1", invited_email: "friend@example.com", token: "tok-1", created_at: null },
    ];
    mocks.state.revoke.mockResolvedValue({ ok: false, message: "Could not revoke that invitation. Try again." });

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "friend@example.com, invited" }));
    fireEvent.click(screen.getByRole("button", { name: /revoke invitation for friend@example.com/i }));
    fireEvent.click(screen.getByRole("button", { name: /^revoke invitation$/i }));

    await waitFor(() => expect(
      screen.getAllByRole("alert").some((node) => node.textContent.includes("Could not revoke that invitation."))
    ).toBe(true));
    expect(screen.queryByText(/invitation revoked for/i)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /revoke friend@example.com/i })).toBeInTheDocument();
  });

  it("waits for bowl ownership before offering to create or send", () => {
    mocks.state.bowls = [];
    mocks.state.bowlsLoading = true;

    renderHub();

    expect(screen.getByText("Loading your bowls…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create a bowl/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Invite to" })).not.toBeInTheDocument();
  });

  it("treats a bowl-context failure as unknown ownership, not as owning nothing", () => {
    mocks.state.bowls = [];
    mocks.state.bowlsError = "Could not load your bowls. Please try again.";

    renderHub();

    expect(screen.getByText("Could not load your bowls.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create a bowl/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invited" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("offers a retry when sent invitations could not load", () => {
    mocks.state.sentLoadError = "Could not load the invitations you sent. Try again.";

    renderHub();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(mocks.state.refreshSent).toHaveBeenCalled();
  });
});
