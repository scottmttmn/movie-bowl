import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBowlCreationService } from "../createBowl";

function createClient({
  authResponse = {
    data: { session: { user: { id: "user-1", email: "owner@example.com" } } },
    error: null,
  },
  bowlResponses = [{ data: { id: "bowl-1", name: "Weekend Bowl" }, error: null }],
  inviteError = null,
  inviteDataFactory = (args) => ({
    request_id: args.p_request_id,
    bowl_id: args.p_bowl_id,
    invitations: args.p_emails.map((email, index) => ({
      invited_email: email,
      status: "created",
      invitation_id: `invite-${index + 1}`,
      token: `token-${index + 1}`,
    })),
  }),
} = {}) {
  const createBowlCalls = [];
  const inviteRpcCalls = [];
  const responses = [...bowlResponses];
  const client = {
    auth: { getSession: vi.fn(async () => authResponse) },
    // Bowl creation is one RPC now; a direct table write would be the old
    // two-write path coming back.
    from: vi.fn((table) => {
      throw new Error(`Unexpected table write: ${table}`);
    }),
    rpc: vi.fn(async (name, args) => {
      if (name === "create_owned_bowl") {
        createBowlCalls.push(args);
        return responses.shift();
      }
      if (name !== "create_bowl_invites") {
        throw new Error(`Unexpected RPC: ${name}`);
      }
      inviteRpcCalls.push(args);
      return {
        data: inviteError ? null : inviteDataFactory(args),
        error: inviteError,
      };
    }),
  };

  return { client, createBowlCalls, inviteRpcCalls };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("create bowl service", () => {
  it("rejects limit, name, and invitation validation failures before authentication", async () => {
    const { client } = createClient();
    const service = createBowlCreationService({ client, maxOwnedBowls: 2 });

    await expect(service.create({ bowlName: "A", ownedBowlCount: 2 })).resolves.toMatchObject({
      ok: false,
      code: "limit_reached",
      errorMessage: "You can create up to 2 bowls.",
    });
    await expect(service.create({ bowlName: "   ", ownedBowlCount: 0 })).resolves.toMatchObject({
      ok: false,
      code: "name_required",
      errorMessage: "Bowl name is required.",
    });
    await expect(service.create({ bowlName: "A", inviteEmails: "not-an-email" })).resolves.toMatchObject({
      ok: false,
      code: "invalid_invites",
      errorMessage: "Invalid email(s): not-an-email",
    });
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("reports an authentication failure without writing", async () => {
    const { client } = createClient({
      authResponse: { data: { session: null }, error: new Error("expired") },
    });
    const service = createBowlCreationService({ client });

    await expect(service.create({ bowlName: "Weekend Bowl" })).resolves.toMatchObject({
      ok: false,
      code: "not_authenticated",
      errorMessage: "You must be signed in to create a bowl.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("creates the bowl, invitations, and email payloads once", async () => {
    const { client, createBowlCalls, inviteRpcCalls } = createClient();
    const publish = vi.fn();
    const sendEmails = vi.fn(async () => ({ sent: 1, failed: 1, error: "one failed" }));
    const requestIdFactory = vi.fn(() => "request-1");
    const service = createBowlCreationService({ client, publish, sendEmails, requestIdFactory });

    const result = await service.create({
      bowlName: "  Weekend Bowl  ",
      inviteEmails: "Friend@example.com, friend@example.com\nsecond@example.com",
      bowlId: "bowl-id-1",
    });

    expect(result).toMatchObject({
      ok: true,
      bowl: { id: "bowl-1", name: "Weekend Bowl" },
      actionMessage: "Bowl created, but only 1 of 2 invite emails sent.",
    });
    expect(createBowlCalls).toEqual([{ p_bowl_id: "bowl-id-1", p_name: "Weekend Bowl" }]);
    expect(inviteRpcCalls).toEqual([{
      p_bowl_id: "bowl-1",
      p_emails: ["friend@example.com", "second@example.com"],
      p_request_id: "request-1",
    }]);
    expect(sendEmails).toHaveBeenCalledWith([
      {
        bowlId: "bowl-1",
        bowlName: "Weekend Bowl",
        invitedEmail: "friend@example.com",
        invitedByEmail: "owner@example.com",
        token: "token-1",
      },
      {
        bowlId: "bowl-1",
        bowlName: "Weekend Bowl",
        invitedEmail: "second@example.com",
        invitedByEmail: "owner@example.com",
        token: "token-2",
      },
    ]);
    expect(publish).toHaveBeenCalledWith({ userId: "user-1", bowlId: "bowl-1" });
  });

  it("mints a bowl id when the caller has none", async () => {
    const { client, createBowlCalls } = createClient();
    const service = createBowlCreationService({ client, bowlIdFactory: () => "minted-id" });

    await expect(service.create({ bowlName: "Weekend Bowl" })).resolves.toMatchObject({ ok: true });
    expect(createBowlCalls).toEqual([{ p_bowl_id: "minted-id", p_name: "Weekend Bowl" }]);
  });

  it("reports a rolled-back creation as a failure without publishing", async () => {
    const { client } = createClient({
      bowlResponses: [{ data: null, error: { code: "P0001", message: "write failed" } }],
    });
    const publish = vi.fn();
    const service = createBowlCreationService({ client, publish });

    await expect(service.create({ bowlName: "Weekend Bowl" })).resolves.toMatchObject({
      ok: false,
      code: "create_failed",
      errorMessage: "Failed to create bowl.",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("calls a creation that got no answer unknown, not failed", async () => {
    const { client, inviteRpcCalls } = createClient({
      bowlResponses: [{ data: null, error: { code: "", message: "TypeError: Failed to fetch" } }],
    });
    const publish = vi.fn();
    const service = createBowlCreationService({ client, publish });

    await expect(service.create({
      bowlName: "Weekend Bowl",
      inviteEmails: "friend@example.com",
    })).resolves.toMatchObject({
      ok: false,
      code: "outcome_unknown",
      errorMessage: "Could not finish creating the bowl. Check your bowls before trying again.",
    });
    expect(publish).not.toHaveBeenCalled();
    expect(inviteRpcCalls).toEqual([]);
  });

  it("maps the server's bowl limit to the limit message", async () => {
    const { client } = createClient({
      bowlResponses: [{
        data: null,
        error: { code: "P0001", hint: "limit_reached", message: "You can create up to 10 bowls." },
      }],
    });
    const service = createBowlCreationService({ client, maxOwnedBowls: 10 });

    await expect(service.create({ bowlName: "Eleventh", ownedBowlCount: 3 })).resolves.toMatchObject({
      ok: false,
      code: "limit_reached",
      errorMessage: "You can create up to 10 bowls.",
    });
  });

  it("says so when a retry returns a bowl an earlier attempt named differently", async () => {
    const { client } = createClient({
      bowlResponses: [{ data: { id: "bowl-1", name: "Friday Films" }, error: null }],
    });
    const service = createBowlCreationService({ client });

    await expect(service.create({ bowlName: "Saturday Films", bowlId: "bowl-1" })).resolves.toMatchObject({
      ok: true,
      bowl: { id: "bowl-1", name: "Friday Films" },
      actionMessage: "Your earlier attempt had already created “Friday Films”.",
    });
  });

  it("treats failed invitation rows as partial success", async () => {
    const { client } = createClient({ inviteError: { message: "invite failed" } });
    const sendEmails = vi.fn();
    const service = createBowlCreationService({ client, sendEmails });

    await expect(service.create({
      bowlName: "Weekend Bowl",
      inviteEmails: "friend@example.com",
    })).resolves.toMatchObject({
      ok: true,
      code: "invites_failed",
      errorMessage: "Bowl created, but invites could not be created.",
      bowl: { id: "bowl-1" },
    });
    expect(sendEmails).not.toHaveBeenCalled();
  });

  it("treats a malformed invitation RPC response as partial success", async () => {
    const { client } = createClient({ inviteDataFactory: () => null });
    const sendEmails = vi.fn();
    const service = createBowlCreationService({ client, sendEmails });

    await expect(service.create({
      bowlName: "Weekend Bowl",
      inviteEmails: "friend@example.com",
    })).resolves.toMatchObject({
      ok: true,
      code: "invites_failed",
      errorMessage: "Bowl created, but invites could not be created.",
    });
    expect(sendEmails).not.toHaveBeenCalled();
  });

  it("does not email an address the server reports as already a member", async () => {
    const { client } = createClient({
      inviteDataFactory: (args) => ({
        request_id: args.p_request_id,
        bowl_id: args.p_bowl_id,
        invitations: [{
          invited_email: "owner@example.com",
          status: "already_member",
          invitation_id: null,
          token: null,
        }],
      }),
    });
    const sendEmails = vi.fn();
    const service = createBowlCreationService({
      client,
      sendEmails,
      requestIdFactory: () => "request-member",
    });

    await expect(service.create({
      bowlName: "Weekend Bowl",
      inviteEmails: "owner@example.com",
    })).resolves.toMatchObject({
      ok: true,
      actionMessage: "Bowl created. No new invitations were needed.",
    });
    expect(sendEmails).not.toHaveBeenCalled();
  });
});
