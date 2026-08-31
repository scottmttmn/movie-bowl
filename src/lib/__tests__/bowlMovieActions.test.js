import { describe, expect, it, vi } from "vitest";
import { createBowlMovieActions } from "../bowlMovieActions";

function harness() {
  const response = { data: [{ id: "movie-a" }], error: null };
  const query = {
    delete: vi.fn(() => query), eq: vi.fn(() => query), is: vi.fn(() => query),
    select: vi.fn(async () => response),
  };
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: "user-a" } } } })) },
    from: vi.fn(() => query),
    rpc: vi.fn(async (_name, args) => ({ data: { id: args.p_bowl_movie_id, note: args.p_note }, error: null })),
  };
  const publish = vi.fn();
  const offline = vi.fn(() => false);
  const actions = createBowlMovieActions({ client, publish, offline });
  const operation = { accountId: "user-a", bowlId: "bowl-a", movieId: "movie-a", note: "  Remember this  " };
  return { client, query, response, publish, offline, actions, operation };
}

describe("bowl movie actions", () => {
  it("saves and clears comments through the existing RPC and publishes the captured bowl", async () => {
    const h = harness();
    expect(await h.actions.updateNote(h.operation)).toMatchObject({ ok: true, movie: { note: "Remember this" } });
    expect(h.client.rpc).toHaveBeenCalledWith("update_own_bowl_movie_note", { p_bowl_movie_id: "movie-a", p_note: "Remember this" });
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "movie", action: "comment", userId: "user-a", bowlId: "bowl-a", movieId: "movie-a" }));
    expect(await h.actions.updateNote({ ...h.operation, note: " \n " })).toMatchObject({ ok: true, movie: { note: null } });
  });

  it("removes only the captured user's undrawn movie and requires a returned row", async () => {
    const h = harness();
    expect(await h.actions.remove(h.operation)).toMatchObject({ ok: true });
    expect(h.client.from).toHaveBeenCalledWith("bowl_movies");
    expect(h.query.eq.mock.calls).toEqual([["id", "movie-a"], ["bowl_id", "bowl-a"], ["added_by", "user-a"]]);
    expect(h.query.is).toHaveBeenCalledWith("drawn_at", null);
    expect(h.query.select).toHaveBeenCalledWith("id");
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "movie", action: "remove", movieId: "movie-a" }));
  });

  it("does not report a zero-row deletion as success", async () => {
    const h = harness(); h.response.data = [];
    expect(await h.actions.remove(h.operation)).toMatchObject({ ok: false, code: "movie_unavailable" });
    expect(h.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: "movie" }));
  });

  it("rejects oversized comments and offline actions before dispatch", async () => {
    const h = harness();
    expect(await h.actions.updateNote({ ...h.operation, note: "x".repeat(501) })).toMatchObject({ code: "comment_too_long" });
    h.offline.mockReturnValue(true);
    expect(await h.actions.updateNote(h.operation)).toMatchObject({ code: "offline" });
    expect(await h.actions.remove(h.operation)).toMatchObject({ code: "offline" });
    expect(h.client.rpc).not.toHaveBeenCalled(); expect(h.query.delete).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "P0001", message: "This movie comment is no longer available to edit." }, "movie_unavailable"],
    [{ code: "42501", message: "permission denied" }, "access_lost"],
    [new Error("server unavailable"), "update_failed"],
  ])("surfaces a failed comment without publishing a successful mutation (%s)", async (error, code) => {
    const h = harness(); h.client.rpc.mockResolvedValue({ data: null, error });
    expect(await h.actions.updateNote(h.operation)).toMatchObject({ ok: false, code });
    expect(h.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: "movie" }));
  });

  it("blocks dispatch after an account switch or session disposal", async () => {
    const h = harness();
    h.client.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: "user-b" } } } });
    expect(await h.actions.remove(h.operation)).toMatchObject({ code: "not_authenticated" });
    expect(await h.actions.updateNote({ ...h.operation, isCurrent: () => false })).toMatchObject({ code: "not_authenticated" });
    expect(h.client.rpc).not.toHaveBeenCalled(); expect(h.query.delete).not.toHaveBeenCalled();
  });

  it("does not publish an old account's completion after a dispatched save", async () => {
    const h = harness(); let current = true;
    h.client.rpc.mockImplementationOnce(async () => { current = false; return { data: { id: "movie-a", note: "Saved" } }; });
    expect(await h.actions.updateNote({ ...h.operation, isCurrent: () => current })).toMatchObject({ code: "not_authenticated" });
    expect(h.publish).not.toHaveBeenCalled();
  });
});
