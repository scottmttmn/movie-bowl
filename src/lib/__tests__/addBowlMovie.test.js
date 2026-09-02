import { describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: {} }));
import { createBowlMovieService } from "../addBowlMovie";

function harness() {
  const state = { user: "u1", bowls: [{ id: "a" }, { id: "b" }], rows: [], readError: null };
  const insert = vi.fn(async (payload) => {
    const row = { ...payload, added_at: "2026-08-31T12:00:00Z", drawn_at: null };
    state.rows.push(row);
    return { data: row, error: null };
  });
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: state.user }, access_token: "token" } } })) },
    rpc: vi.fn(async (name) => ({ data: name === "get_my_bowl_context" ? { bowls: state.bowls } : [{ user_id: "u2", email: "friend@example.com" }], error: null })),
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
  it("uses fresh persisted rows for the undrawn limit", async () => {
    const h = harness(); h.state.rows = Array.from({ length: 500 }, (_, id) => ({ id, bowl_id: "a" }));
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "limit_reached" });
    expect(h.insert).not.toHaveBeenCalled();
  });
  it("preserves duplicate attribution and does not insert", async () => {
    const h = harness(); h.state.rows = [{ id: "row", tmdb_id: 101, bowl_id: "a", added_by: "u2" }];
    expect(await h.service.add(h.operation())).toMatchObject({ ok: false, code: "duplicate_movie", message: expect.stringContaining("friend added it") });
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
