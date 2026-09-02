import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBowlCreationService } from "../createBowl";

function createClient({
  authResponse = {
    data: { session: { user: { id: "user-1", email: "owner@example.com" } } },
    error: null,
  },
  bowlResponses = [{ data: { id: "bowl-1", name: "Weekend Bowl" }, error: null }],
  memberError = null,
  inviteError = null,
} = {}) {
  const insertedBowls = [];
  const insertedMembers = [];
  const insertedInvites = [];
  const responses = [...bowlResponses];
  const client = {
    auth: { getSession: vi.fn(async () => authResponse) },
    from: vi.fn((table) => {
      if (table === "bowls") {
        return {
          insert: vi.fn((rows) => {
            insertedBowls.push(rows);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => responses.shift()),
              })),
            };
          }),
        };
      }
      if (table === "bowl_members") {
        return {
          insert: vi.fn(async (rows) => {
            insertedMembers.push(rows);
            return { error: memberError };
          }),
        };
      }
      if (table === "bowl_invites") {
        return {
          insert: vi.fn(async (rows) => {
            insertedInvites.push(rows);
            return { error: inviteError };
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client, insertedBowls, insertedMembers, insertedInvites };
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
    expect(client.from).not.toHaveBeenCalled();
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
    expect(client.from).not.toHaveBeenCalled();
  });

  it("creates the bowl, owner membership, invitations, and email payloads once", async () => {
    const { client, insertedBowls, insertedMembers, insertedInvites } = createClient();
    const publish = vi.fn();
    const sendEmails = vi.fn(async () => ({ sent: 1, failed: 1, error: "one failed" }));
    const tokenFactory = vi.fn()
      .mockReturnValueOnce("token-1")
      .mockReturnValueOnce("token-2");
    const service = createBowlCreationService({ client, publish, sendEmails, tokenFactory });

    const result = await service.create({
      bowlName: "  Weekend Bowl  ",
      inviteEmails: "Friend@example.com, friend@example.com\nsecond@example.com",
    });

    expect(result).toMatchObject({
      ok: true,
      bowl: { id: "bowl-1", name: "Weekend Bowl" },
      actionMessage: "Bowl created, but only 1 of 2 invite emails sent.",
    });
    expect(insertedBowls).toEqual([[{
      owner_id: "user-1",
      name: "Weekend Bowl",
      draw_access_mode: "all_members",
    }]]);
    expect(insertedMembers).toEqual([[
      { bowl_id: "bowl-1", user_id: "user-1", role: "Owner" },
    ]]);
    expect(insertedInvites).toEqual([[
      { bowl_id: "bowl-1", invited_email: "friend@example.com", invited_by: "user-1", token: "token-1" },
      { bowl_id: "bowl-1", invited_email: "second@example.com", invited_by: "user-1", token: "token-2" },
    ]]);
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

  it("retries without draw access mode for an older schema", async () => {
    const { client, insertedBowls, insertedMembers } = createClient({
      bowlResponses: [
        { data: null, error: { message: "column draw_access_mode does not exist" } },
        { data: { id: "bowl-2", name: "Fallback Bowl" }, error: null },
      ],
    });
    const publish = vi.fn();
    const sendEmails = vi.fn();
    const service = createBowlCreationService({ client, publish, sendEmails });

    await expect(service.create({ bowlName: "Fallback Bowl" })).resolves.toMatchObject({
      ok: true,
      bowl: { id: "bowl-2" },
    });
    expect(insertedBowls).toEqual([
      [{ owner_id: "user-1", name: "Fallback Bowl", draw_access_mode: "all_members" }],
      [{ owner_id: "user-1", name: "Fallback Bowl" }],
    ]);
    expect(insertedMembers).toEqual([[
      { bowl_id: "bowl-2", user_id: "user-1", role: "Owner" },
    ]]);
    expect(sendEmails).not.toHaveBeenCalled();
  });

  it("does not continue when the bowl insert fails", async () => {
    const { client, insertedMembers } = createClient({
      bowlResponses: [{ data: null, error: { message: "write failed" } }],
    });
    const publish = vi.fn();
    const service = createBowlCreationService({ client, publish });

    await expect(service.create({ bowlName: "Weekend Bowl" })).resolves.toMatchObject({
      ok: false,
      code: "create_failed",
      errorMessage: "Failed to create bowl.",
    });
    expect(publish).not.toHaveBeenCalled();
    expect(insertedMembers).toEqual([]);
  });

  it("keeps owner membership failure fatal after publishing the bowl change", async () => {
    const { client, insertedInvites } = createClient({ memberError: { message: "member failed" } });
    const publish = vi.fn();
    const sendEmails = vi.fn();
    const service = createBowlCreationService({ client, publish, sendEmails });

    await expect(service.create({
      bowlName: "Weekend Bowl",
      inviteEmails: "friend@example.com",
    })).resolves.toMatchObject({
      ok: false,
      code: "owner_membership_failed",
      errorMessage: "Failed to add owner membership.",
      bowl: { id: "bowl-1" },
    });
    expect(publish).toHaveBeenCalledWith({ userId: "user-1", bowlId: "bowl-1" });
    expect(insertedInvites).toEqual([]);
    expect(sendEmails).not.toHaveBeenCalled();
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
});
