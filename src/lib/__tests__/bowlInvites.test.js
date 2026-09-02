import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn() }));
vi.mock("../supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../bowlChanges", () => ({ notifyBowlChange: mocks.notify }));
import {
  acceptBowlInvite,
  createBowlInvitations,
  revokeBowlInvitation,
} from "../bowlInvites";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("shared invite acceptance", () => {
  it("joins in one call and publishes a single change", async () => {
    mocks.rpc.mockResolvedValue({ data: "bowl-9", error: null });
    expect(await acceptBowlInvite("tok")).toMatchObject({ ok: true, bowlId: "bowl-9" });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_bowl_invite", { p_token: "tok" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith({ bowlId: "bowl-9" });
  });

  it("sends a missing token as null and reports the refusal", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "This invite is no longer available." } });
    expect(await acceptBowlInvite(undefined)).toMatchObject({
      ok: false, code: "invite_unavailable", message: "This invite is no longer available.",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_bowl_invite", { p_token: null });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("keeps the function's own authentication refusal as the message", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "You must be signed in to accept an invite." } });
    expect(await acceptBowlInvite("tok")).toMatchObject({
      ok: false, code: "not_authenticated", message: "You must be signed in to accept an invite.",
    });
  });

  it("does not pass an unexpected failure through to the person", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "stack trace leak" } });
    const result = await acceptBowlInvite("tok");
    expect(result).toMatchObject({ ok: false, code: "accept_failed" });
    expect(result.message).toBe("Could not accept this invite. Please try again.");
  });
});

describe("owner invitation mutations", () => {
  it("passes batch identity and addresses to the creation RPC", async () => {
    const response = {
      data: { bowl_id: "bowl-9", request_id: "request-1", invitations: [] },
      error: null,
    };
    mocks.rpc.mockResolvedValue(response);

    await expect(createBowlInvitations({
      bowlId: "bowl-9",
      emails: ["friend@example.com"],
      requestId: "request-1",
    })).resolves.toBe(response);
    expect(mocks.rpc).toHaveBeenCalledWith("create_bowl_invites", {
      p_bowl_id: "bowl-9",
      p_emails: ["friend@example.com"],
      p_request_id: "request-1",
    });
  });

  it("passes bowl and invitation identity to guarded revoke", async () => {
    const response = { data: "revoked", error: null };
    mocks.rpc.mockResolvedValue(response);

    await expect(revokeBowlInvitation({
      bowlId: "bowl-9",
      invitationId: "invite-1",
    })).resolves.toBe(response);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_bowl_invite", {
      p_bowl_id: "bowl-9",
      p_invitation_id: "invite-1",
    });
  });
});
