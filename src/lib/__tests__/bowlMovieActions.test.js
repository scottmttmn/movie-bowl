import { describe, expect, it, vi } from "vitest";
import { createBowlMovieActions } from "../bowlMovieActions";

function harness() {
  const removal = { data: { id: "movie-a", returned_to_pack: false, movie: null }, error: null };
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: "user-a" } } } })) },
    rpc: vi.fn(async (name, args) => (name === "remove_own_bowl_movie"
      ? removal
      : { data: { id: args.p_bowl_movie_id, note: args.p_note }, error: null })),
  };
  const publish = vi.fn();
  const offline = vi.fn(() => false);
  const actions = createBowlMovieActions({ client, publish, offline });
  const operation = { accountId: "user-a", bowlId: "bowl-a", movieId: "movie-a", note: "  Remember this  " };
  return { client, removal, publish, offline, actions, operation };
}

describe("bowl movie actions", () => {
  it("saves and clears comments through the existing RPC and publishes the captured bowl", async () => {
    const h = harness();
    expect(await h.actions.updateNote(h.operation)).toMatchObject({ ok: true, movie: { note: "Remember this" } });
    expect(h.client.rpc).toHaveBeenCalledWith("update_own_bowl_movie_note", { p_bowl_movie_id: "movie-a", p_note: "Remember this" });
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "movie", action: "comment", userId: "user-a", bowlId: "bowl-a", movieId: "movie-a" }));
    expect(await h.actions.updateNote({ ...h.operation, note: " \n " })).toMatchObject({ ok: true, movie: { note: null } });
  });

  it("removes the captured movie from the captured bowl through the RPC", async () => {
    const h = harness();
    expect(await h.actions.remove(h.operation)).toMatchObject({ ok: true, returnedToPack: false });
    expect(h.client.rpc).toHaveBeenCalledWith("remove_own_bowl_movie", { p_bowl_id: "bowl-a", p_bowl_movie_id: "movie-a" });
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "movie", action: "remove", movieId: "movie-a" }));
  });

  it("reports a claimed pack title that went back to its pack, and publishes the slip it became", async () => {
    const h = harness();
    const slip = { id: "movie-a", added_by: null, added_by_name: "Nolan: The '00s", starter_pack: "nolan-2000s" };
    h.removal.data = { id: "movie-a", returned_to_pack: true, movie: slip };
    expect(await h.actions.remove(h.operation)).toMatchObject({ ok: true, returnedToPack: true, movie: slip });
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "movie", action: "return_to_pack", movieId: "movie-a", movie: slip }));
  });

  it("does not report a removal the server did not confirm as success", async () => {
    const h = harness(); h.removal.data = null;
    expect(await h.actions.remove(h.operation)).toMatchObject({ ok: false, code: "movie_unavailable" });
    expect(h.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: "movie" }));
  });

  it("says a drawn or already removed movie is gone", async () => {
    const h = harness();
    h.removal.data = null;
    h.removal.error = { code: "P0001", message: "This movie is no longer available to remove." };
    expect(await h.actions.remove(h.operation)).toMatchObject({ ok: false, code: "movie_unavailable" });
  });

  it("rejects oversized comments and offline actions before dispatch", async () => {
    const h = harness();
    expect(await h.actions.updateNote({ ...h.operation, note: "x".repeat(501) })).toMatchObject({ code: "comment_too_long" });
    h.offline.mockReturnValue(true);
    expect(await h.actions.updateNote(h.operation)).toMatchObject({ code: "offline" });
    expect(await h.actions.remove(h.operation)).toMatchObject({ code: "offline" });
    expect(h.client.rpc).not.toHaveBeenCalled();
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
    expect(h.client.rpc).not.toHaveBeenCalled();
  });

  it("does not publish an old account's completion after a dispatched save", async () => {
    const h = harness(); let current = true;
    h.client.rpc.mockImplementationOnce(async () => { current = false; return { data: { id: "movie-a", note: "Saved" } }; });
    expect(await h.actions.updateNote({ ...h.operation, isCurrent: () => current })).toMatchObject({ code: "not_authenticated" });
    expect(h.publish).not.toHaveBeenCalled();
  });
});
