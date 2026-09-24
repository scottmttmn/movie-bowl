import { describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: {} }));
import { createBowlMovieService, getDuplicateMovieMessage } from "../addBowlMovie";

function harness() {
  const state = { user: "u1", bowls: [{ id: "a" }, { id: "b" }], rows: [], readError: null };
  const insert = vi.fn(async (payload) => {
    const row = { ...payload, added_at: "2026-08-31T12:00:00Z", drawn_at: null };
    state.rows.push(row);
    return { data: row, error: null };
  });
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: state.user }, access_token: "token" } } })) },
    rpc: vi.fn(async (name) => ({ data: name === "get_my_bowl_context" ? { bowls: state.bowls } : [{ user_id: "u2", display_name: "Friend" }], error: null })),
    from: vi.fn(() => {
      const filters = {}; let payload;
      const query = {
        select: () => query, eq: (key, value) => { filters[key] = value; return query; },
        is: () => query,
        order: async () => ({ data: state.rows.filter((row) => row.bowl_id === filters.bowl_id && !row.drawn_at), error: state.readError }),
        insert: (rows) => { payload = rows[0]; return query; },
        single: () => insert(payload),
        maybeSingle: async () => ({ data: state.rows.find((row) => row.id === filters.id) || null, error: state.readError }),
      };
      return query;
    }),
  };
  const publish = vi.fn(); const offline = vi.fn(() => false);
  const service = createBowlMovieService({ client, publish, offline, warmProviders: vi.fn(), warmMetadata: vi.fn() });
  const operation = (movie = { id: 101, title: "Movie" }, bowlId = "a") => ({
    accountId: "u1", bowlId, bowlName: "Friday Night", movie,
    submissionId: crypto.randomUUID(),
  });
  return { state, insert, client, publish, offline, service, operation };
}

describe("shared bowl add service", () => {
  it("refuses offline writes before optimistic state or reads", async () => {
    const h = harness(); h.offline.mockReturnValue(true);
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "offline" });
    expect(h.publish).not.toHaveBeenCalled(); expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it("checks current access without relying on a mounted dashboard", async () => {
    const h = harness(); h.state.bowls = [{ id: "b" }];
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "access_lost" });
    expect(h.insert).not.toHaveBeenCalled();
  });
  it("asks for access and the bowl's rows together, not one after the other", async () => {
    const h = harness();
    let releaseContext;
    h.client.rpc.mockImplementationOnce(() => new Promise((resolve) => {
      releaseContext = () => resolve({ data: { bowls: h.state.bowls }, error: null });
    }));
    const pending = h.service.add(h.operation());
    await vi.waitFor(() => expect(h.client.rpc).toHaveBeenCalledWith("get_my_bowl_context"));
    expect(h.client.from).toHaveBeenCalledWith("bowl_movies");
    releaseContext();
    expect(await pending).toMatchObject({ ok: true });
  });
  it("uses fresh persisted rows for the undrawn limit", async () => {
    const h = harness(); h.state.rows = Array.from({ length: 500 }, (_, id) => ({ id, bowl_id: "a" }));
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "limit_reached" });
    expect(h.insert).not.toHaveBeenCalled();
  });
  it("preserves duplicate attribution and does not insert", async () => {
    const h = harness(); h.state.rows = [{ id: "row", tmdb_id: 101, bowl_id: "a", added_by: "u2" }];
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "duplicate_movie", message: expect.stringContaining("Friend added it") });
    expect(h.insert).not.toHaveBeenCalled();
  });
  // A starter pack title belongs to nobody. Adding it makes it yours, in place.
  it("claims a starter pack slip instead of reporting a duplicate, and skips the warm", async () => {
    const warmProviders = vi.fn(); const warmMetadata = vi.fn();
    const h = harness();
    const service = createBowlMovieService({ client: h.client, publish: h.publish, offline: h.offline, warmProviders, warmMetadata });
    h.state.rows = [{ id: "slip", tmdb_id: 101, bowl_id: "a", added_by: null, added_by_name: "Spielberg: The '80s", starter_pack: "spielberg-1980s" }];
    const claimed = { id: "slip", tmdb_id: 101, bowl_id: "a", added_by: "u1", added_by_name: null, starter_pack: null, note: "Saw it as a kid" };
    const defaultRpc = h.client.rpc.getMockImplementation();
    h.client.rpc.mockImplementation(async (name, params) => (name === "claim_bowl_starter_pack_movie"
      ? { data: claimed, error: null } : defaultRpc(name, params)));

    const result = await service.add(h.operation({ id: 101, title: "Movie", note: "  Saw it as a kid " }));

    expect(result).toMatchObject({
      ok: true,
      code: "claimed_from_pack",
      message: "Added Movie — it was in the Spielberg: The '80s pack, now it's yours.",
      movie: expect.objectContaining({ id: "slip", added_by: "u1" }),
    });
    expect(h.client.rpc).toHaveBeenCalledWith("claim_bowl_starter_pack_movie", {
      p_bowl_id: "a", p_tmdb_id: 101, p_note: "Saw it as a kid",
    });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "add", phase: "success", submissionId: "slip" }));
    expect(warmProviders).not.toHaveBeenCalled();
    expect(warmMetadata).not.toHaveBeenCalled();
  });
  function packHarness(claim) {
    const h = harness();
    h.state.rows = [{ id: "slip", tmdb_id: 101, bowl_id: "a", added_by: null, added_by_name: "Pack", starter_pack: "nolan-2000s" }];
    const defaultRpc = h.client.rpc.getMockImplementation();
    h.client.rpc.mockImplementation(async (name, params) => (name === "claim_bowl_starter_pack_movie"
      ? claim(h) : defaultRpc(name, params)));
    return h;
  }
  const claimRow = (h) => {
    const row = { ...h.state.rows[0], added_by: "u1", added_by_name: null, starter_pack: null };
    h.state.rows[0] = row;
    return row;
  };

  it("claims a pack slip in a full bowl, since the claim adds nothing", async () => {
    const h = packHarness((harnessState) => ({ data: claimRow(harnessState), error: null }));
    h.state.rows.push(...Array.from({ length: 499 }, (_, id) => ({ id: `row-${id}`, tmdb_id: 5000 + id, bowl_id: "a", added_by: "u2" })));
    expect(await h.service.add(h.operation())).toMatchObject({ ok: true, code: "claimed_from_pack" });
    // An ordinary add into the same full bowl is still refused.
    expect(await h.service.add(h.operation({ id: 999, title: "Other" }))).toMatchObject({ ok: false, code: "limit_reached" });
  });

  it("checks the account again right before claiming", async () => {
    const h = packHarness(() => { throw new Error("should not claim"); });
    h.client.auth.getSession
      .mockResolvedValueOnce({ data: { session: { user: { id: "u1" }, access_token: "token" } } })
      .mockResolvedValueOnce({ data: { session: { user: { id: "u9" }, access_token: "other" } } });
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "not_authenticated" });
    expect(h.client.rpc).not.toHaveBeenCalledWith("claim_bowl_starter_pack_movie", expect.anything());
  });

  it("reports a claim someone else won as settled, not as a second copy", async () => {
    const h = packHarness(() => ({ data: null, error: { code: "P0001", message: "This movie is no longer in the starter pack." } }));
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "claim_lost" });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("reads the slip back when a claim's answer is lost, and keeps a claim that committed", async () => {
    const h = packHarness((harnessState) => {
      claimRow(harnessState);
      throw new Error("connection reset");
    });
    expect(await h.service.add(h.operation())).toMatchObject({
      ok: true, code: "claimed_from_pack", movie: expect.objectContaining({ id: "slip", added_by: "u1" }),
    });
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ phase: "success", submissionId: "slip" }));
  });

  it("leaves a lost claim unconfirmed while the slip looks untouched, and a retry never makes a second copy", async () => {
    // The claim's answer is lost and the read-back still sees the slip: it
    // may yet commit, so nothing is settled either way.
    let commitLater;
    const h = packHarness((harnessState) => {
      commitLater = () => claimRow(harnessState);
      throw new Error("connection reset");
    });
    expect(await h.service.add(h.operation())).toMatchObject({
      ok: false, code: "add_failed", message: "Could not confirm whether Movie was added. Check the bowl before trying again.",
    });
    expect(h.publish).toHaveBeenCalledWith({ type: "context", bowlId: "a" });

    // The claim lands after all; a retry finds the title is already theirs.
    commitLater();
    expect(await h.service.add(h.operation())).toMatchObject({
      ok: false, code: "duplicate_movie", message: "\"Movie\" is already in the bowl, and it's yours.",
    });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("keeps comment validation and allows separate repeated custom additions", async () => {
    const h = harness();
    expect(await h.service.add(h.operation({ title: "Custom", note: "x".repeat(501) }))).toMatchObject({ code: "comment_too_long" });
    expect(await h.service.add(h.operation({ title: "Custom" }))).toMatchObject({ ok: true });
    expect(await h.service.add(h.operation({ title: "Custom" }))).toMatchObject({ ok: true });
    expect(h.insert).toHaveBeenCalledTimes(2);
  });
  it("retries only a confirmed NOT NULL custom rejection with the same UUID", async () => {
    const h = harness(); const op = h.operation({ title: "Custom", note: "  Why  " });
    h.insert.mockResolvedValueOnce({ data: null, error: { code: "23502", message: 'null value in column "tmdb_id"' } });
    expect(await h.service.add(op)).toMatchObject({ ok: true });
    expect(h.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: op.submissionId, tmdb_id: null, note: "Why", is_pinned: false }));
    expect(h.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: op.submissionId, tmdb_id: expect.any(Number) }));
    expect(h.insert.mock.calls[1][0].tmdb_id).toBeLessThan(0);
  });
  it("does not retry other custom-title errors", async () => {
    const h = harness(); h.insert.mockResolvedValue({ error: { code: "P0001", message: "Rejected" } });
    expect(await h.service.add(h.operation({ title: "Custom" }))).toMatchObject({ ok: false, code: "add_failed" });
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "error" }));
  });
  it("reconciles a committed insert after its response is lost, without another insert", async () => {
    const h = harness(); const op = h.operation({ title: "Custom" });
    h.insert.mockImplementation(async (payload) => { h.state.rows.push(payload); throw new TypeError("Failed to fetch"); });
    expect(await h.service.add(op)).toMatchObject({ ok: true, movie: { id: op.submissionId } });
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "success" }));
  });
  it("reads a clean miss on its own id as proof the insert never committed", async () => {
    const h = harness(); const op = h.operation();
    h.insert.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await h.service.add(op)).toMatchObject({ ok: false, code: "add_not_committed" });
    expect(await h.service.checkStatus(op)).toMatchObject({ code: "add_not_committed" });
    h.state.rows.push({ id: op.submissionId, bowl_id: "a", added_by: "u1", tmdb_id: 101, title: "Movie", note: null });
    expect(await h.service.checkStatus(op)).toMatchObject({ ok: true });
    expect(h.insert).toHaveBeenCalledTimes(1);
  });
  it("stays uncertain when the status read itself cannot answer", async () => {
    const h = harness(); const op = h.operation();
    h.insert.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await h.service.add(op)).toMatchObject({ ok: false, code: "add_not_committed" });
    h.state.readError = { message: "network" };
    expect(await h.service.checkStatus(op)).toMatchObject({ code: "outcome_unknown" });
    h.state.readError = null;
    expect(await h.service.checkStatus(op)).toMatchObject({ code: "add_not_committed" });
  });
  it("reconciles a late original write instead of adding a second slip on retry", async () => {
    const h = harness(); const op = h.operation({ title: "Custom" });
    h.insert.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await h.service.add(op)).toMatchObject({ ok: false, code: "add_not_committed" });
    // The first write lands after the miss; the retry reuses its id and loses.
    h.state.rows.push({ id: op.submissionId, bowl_id: "a", added_by: "u1", tmdb_id: null, title: "Custom", note: null });
    h.insert.mockRejectedValueOnce({ code: "23505", message: "duplicate key value violates unique constraint \"bowl_movies_pkey\"" });
    expect(await h.service.add(op)).toMatchObject({ ok: true, movie: { id: op.submissionId } });
    expect(h.state.rows.filter((row) => row.title === "Custom")).toHaveLength(1);
  });
  it("claims its own late-landed TMDB row on retry instead of reporting a duplicate", async () => {
    const h = harness(); const op = h.operation();
    h.insert.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await h.service.add(op)).toMatchObject({ ok: false, code: "add_not_committed" });
    // The first write lands after the miss, carrying a real TMDB id, so the
    // duplicate preflight would otherwise blame the caller for their own row.
    h.state.rows.push({ id: op.submissionId, bowl_id: "a", added_by: "u1", tmdb_id: 101, title: "Movie", note: null, drawn_at: null });
    expect(await h.service.add(op)).toMatchObject({ ok: true, movie: { id: op.submissionId } });
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.state.rows.filter((row) => row.tmdb_id === 101)).toHaveLength(1);
    expect(h.publish).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "success" }));
  });
  it("claims its own row even when that row is the one filling the bowl", async () => {
    const h = harness(); const op = h.operation();
    h.insert.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await h.service.add(op)).toMatchObject({ ok: false, code: "add_not_committed" });
    // The delayed original becomes the 500th undrawn row. The limit is not this
    // submission's problem: it already succeeded.
    h.state.rows = Array.from({ length: 499 }, (_, index) => ({ id: `filler-${index}`, bowl_id: "a", tmdb_id: 9000 + index }));
    h.state.rows.push({ id: op.submissionId, bowl_id: "a", added_by: "u1", tmdb_id: 101, title: "Movie", note: null, drawn_at: null });
    expect(await h.service.add(op)).toMatchObject({ ok: true, movie: { id: op.submissionId } });
    expect(h.insert).toHaveBeenCalledTimes(1);
  });
  it("does not interpret another user's row as confirmation", async () => {
    const h = harness(); const op = h.operation();
    h.state.rows = [{ id: op.submissionId, bowl_id: "a", added_by: "u2", tmdb_id: 101, title: "Movie" }];
    expect(await h.service.checkStatus(op)).toMatchObject({ code: "outcome_unknown" });
  });
  it("refuses a changed account before dispatch", async () => {
    const h = harness();
    h.client.rpc.mockImplementation(async () => { h.state.user = "u2"; return { data: { bowls: h.state.bowls } }; });
    expect(await h.service.add(h.operation())).toMatchObject({ code: "not_authenticated" });
    expect(h.insert).not.toHaveBeenCalled();
  });
  it("blocks duplicate in-flight submissions while allowing a different bowl", async () => {
    const h = harness(); let complete;
    h.insert.mockImplementationOnce((payload) => new Promise((resolve) => { complete = () => resolve({ data: payload }); }));
    const first = h.service.add(h.operation());
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    expect(await h.service.add(h.operation())).toMatchObject({ code: "duplicate_movie" });
    expect(await h.service.add(h.operation({ id: 101, title: "Movie" }, "b"))).toMatchObject({ ok: true });
    complete(); expect(await first).toMatchObject({ ok: true });
    expect(h.insert).toHaveBeenCalledTimes(2);
  });
});

describe("getDuplicateMovieMessage", () => {
  it("says a title is in the pack rather than crediting the pack with a turn", () => {
    expect(getDuplicateMovieMessage({ title: "Memento" }, { added_by: null, added_by_name: "Nolan: The '00s", starter_pack: "nolan-2000s" }))
      .toBe("\"Memento\" is already in the bowl, in the Nolan: The '00s pack, so it can come up on anyone's turn.");
  });
});
