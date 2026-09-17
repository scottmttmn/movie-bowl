import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const deleteUserMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: getUserMock,
      admin: { deleteUser: deleteUserMock },
    },
    rpc: rpcMock,
  }),
}));

import handler from "../account/delete.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRequest(token = "access-token") {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: {},
  };
}

describe("api/account/delete", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    deleteUserMock.mockReset();
    rpcMock.mockReset();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "person@example.com" } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: { deleted: true, removed_movies: 2 }, error: null });
    deleteUserMock.mockResolvedValue({ data: {}, error: null });
  });

  it("requires POST and authentication", async () => {
    const methodRes = createRes();
    await handler({ method: "GET", headers: {} }, methodRes);
    expect(methodRes.statusCode).toBe(405);

    const authRes = createRes();
    await handler(createRequest(null), authRes);
    expect(authRes.statusCode).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses deletion while the account still owns bowls", async () => {
    rpcMock.mockResolvedValue({
      data: {
        deleted: false,
        code: "owned_bowls",
        owned_bowls: [{ id: "bowl-1", name: "Friday Night" }],
      },
      error: null,
    });
    const res = createRes();

    await handler(createRequest(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: "owned_bowls",
      bowls: [{ id: "bowl-1", name: "Friday Night" }],
    });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("cleans app data before hard-deleting the authenticated user", async () => {
    const res = createRes();

    await handler(createRequest(), res);

    expect(getUserMock).toHaveBeenCalledWith("access-token");
    expect(rpcMock).toHaveBeenCalledWith("delete_account_data_for_user", {
      p_user_id: "user-1",
      p_email: "person@example.com",
    });
    expect(deleteUserMock).toHaveBeenCalledWith("user-1", false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it("does not delete the Auth user when cleanup fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const res = createRes();

    await handler(createRequest(), res);

    expect(res.statusCode).toBe(500);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });
});
