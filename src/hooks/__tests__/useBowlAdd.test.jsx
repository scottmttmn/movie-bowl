import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), add: vi.fn(), checkStatus: vi.fn(), updateNote: vi.fn(), remove: vi.fn(), details: vi.fn(), providers: vi.fn() }));
const bowls = [{ id: "a", name: "Friday Night" }, { id: "b", name: "Family Movies" }];
vi.mock("../useUserBowls", () => ({ default: () => ({ userId: "u1", bowls, refresh: mocks.refresh, loading: false, error: null }) }));
vi.mock("../../lib/addBowlMovie", () => ({ bowlMovieService: { add: mocks.add, checkStatus: mocks.checkStatus }, addResult: (ok, code, message) => ({ ok, code, message }), getSubmissionKey: ({ accountId, bowlId, movie }) => `${accountId}:${bowlId}:${Number(movie?.tmdb_id ?? movie?.id) > 0 ? Number(movie?.tmdb_id ?? movie?.id) : String(movie?.title || "").trim().toLowerCase()}`, isUnsettledAddCode: (code) => ["outcome_unknown", "add_not_committed"].includes(code) }));
vi.mock("../../lib/bowlMovieActions", () => ({ bowlMovieActions: { updateNote: mocks.updateNote, remove: mocks.remove } }));
vi.mock("../../lib/tmdbApi", () => ({ getTmdbMovieDetails: mocks.details }));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: mocks.providers }));
import useBowlAdd, { BowlAddProvider } from "../useBowlAdd";

const wrapper = ({ children }) => <BowlAddProvider>{children}</BowlAddProvider>;
const custom = { title: "Wildcard", isCustomEntry: true, note: "Our next pick" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ bowls, defaultBowlId: "a" });
  mocks.add.mockResolvedValue({ ok: true, movie: { id: "saved" } });
  mocks.details.mockResolvedValue({ title: "Detailed movie", runtime: 100 });
  mocks.providers.mockResolvedValue({ providers: [] });
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; });
async function open(bowlId) {
  const view = renderHook(() => useBowlAdd(), { wrapper });
  await act(async () => { await view.result.current.openBowlAdd(bowlId); });
  return view;
}

describe("shared add session", () => {
  it("keeps confirmed additions newest first across bowls, but clears the list for a new session", async () => {
    mocks.add.mockImplementation(async (op) => ({ ok: true, movie: { ...op.movie, id: op.submissionId, bowl_id: op.bowlId } }));
    const { result } = await open();
    await act(async () => { await result.current.submit(custom); });
    act(() => { result.current.clearFeedback(); result.current.setDestination(bowls[1]); });
    await act(async () => { await result.current.submit({ ...custom, title: "Second" }); });
    expect(result.current.additions.map((entry) => [entry.movie.title, entry.bowlId])).toEqual([["Second", "b"], ["Wildcard", "a"]]);
    const first = result.current.additions[1];
    mocks.updateNote.mockResolvedValue({ ok: true, movie: { id: first.movie.id, note: "After adding" } });
    await act(async () => { await result.current.updateAddedMovieNote(first.movie.id, "After adding"); });
    expect(mocks.updateNote).toHaveBeenCalledWith(expect.objectContaining({ accountId: "u1", bowlId: "a", movieId: first.movie.id }));
    expect(result.current.additions[1].movie.note).toBe("After adding");
    act(() => result.current.close());
    await act(async () => { await result.current.openGlobalAdd(); });
    expect(result.current.additions).toEqual([]);
  });

  it("only lists a reconciled add once and never lists a failed add", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "duplicate_movie" });
    const { result } = await open();
    await act(async () => { await result.current.submit(custom); });
    expect(result.current.additions).toEqual([]);
    mocks.add.mockResolvedValueOnce({ ok: false, code: "outcome_unknown" });
    await act(async () => { await result.current.submit(custom); });
    expect(result.current.additions).toEqual([]);
    mocks.checkStatus.mockResolvedValue({ ok: true, movie: { id: "confirmed" } });
    await act(async () => { await result.current.checkStatus(); await result.current.checkStatus(); });
    expect(result.current.additions).toHaveLength(1);
  });

  it("preserves a pending row action across close/reopen, prevents repeats, and retains failed removals", async () => {
    let finish;
    mocks.remove.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = await open();
    await act(async () => { await result.current.submit(custom); });
    const id = result.current.id; let pending;
    act(() => { pending = result.current.removeAddedMovie("saved"); });
    await act(async () => { await result.current.removeAddedMovie("saved"); });
    act(() => result.current.close());
    await act(async () => { await result.current.openGlobalAdd(); });
    expect(result.current.id).toBe(id); expect(result.current.actionsPending).toBe(true);
    expect(mocks.remove).toHaveBeenCalledOnce();
    await act(async () => { finish({ ok: false, code: "update_failed", message: "Try again" }); await pending; });
    expect(result.current.additions).toHaveLength(1);
    expect(result.current.additions[0]).toMatchObject({ pending: null, error: { message: "Try again" } });
    mocks.remove.mockResolvedValue({ ok: true });
    await act(async () => { await result.current.removeAddedMovie("saved"); });
    expect(result.current.additions).toEqual([]);
    expect(result.current.actionAnnouncement).toBe("Removed Wildcard from Friday Night");
  });

  it("disposes pending row actions when the account provider unmounts", async () => {
    let finish;
    mocks.updateNote.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = await open();
    await act(async () => { await view.result.current.submit(custom); });
    let pending;
    act(() => { pending = view.result.current.updateAddedMovieNote("saved", "Old account"); });
    const operation = mocks.updateNote.mock.calls[0][0];
    view.unmount();
    expect(operation.isCurrent()).toBe(false);
    await act(async () => { finish({ ok: true, movie: { id: "saved", note: "Old account" } }); await pending; });
  });

  it("starts global adds at the saved default and contextual adds at the requested bowl", async () => {
    const { result } = await open();
    expect(result.current.destination.id).toBe("a");
    act(() => result.current.close());
    await act(async () => { await result.current.openBowlAdd("b"); });
    expect(result.current.destination.id).toBe("b");
  });

  it("keeps a temporary destination for repeat adds but resets it for a new session", async () => {
    const { result } = await open();
    act(() => result.current.setDestination(bowls[1]));
    await act(async () => { await result.current.submit(custom); });
    expect(result.current.open).toBe(true);
    expect(result.current.destination.id).toBe("b");
    await act(async () => { await result.current.submit({ ...custom, title: "Second" }); });
    expect(mocks.add.mock.calls.map(([operation]) => operation.bowlId)).toEqual(["b", "b"]);
    act(() => result.current.close());
    await act(async () => { await result.current.openGlobalAdd(); });
    expect(result.current.destination.id).toBe("a");
  });

  it("captures the destination and comment before metadata, even if closed and reopened", async () => {
    let finishDetails;
    mocks.details.mockImplementationOnce(() => new Promise((resolve) => { finishDetails = resolve; }));
    const { result } = await open("b"); const sessionId = result.current.id; let pending;
    act(() => { pending = result.current.submit({ id: 42, title: "Movie", note: "Keep this comment" }); });
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => { result.current.setDestination(bowls[0]); result.current.close(); });
    await act(async () => { await result.current.openGlobalAdd(); });
    expect(result.current.id).toBe(sessionId);
    expect(result.current.destination.id).toBe("b");
    await act(async () => { finishDetails({ title: "Movie", runtime: 120 }); await pending; });
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.add.mock.calls[0][0]).toMatchObject({ accountId: "u1", bowlId: "b", bowlName: "Family Movies", movie: { note: "Keep this comment" } });
  });

  it("keeps a closed pending operation alive and supplies named completion feedback", async () => {
    let finish; mocks.add.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = await open(); let pending;
    act(() => { pending = result.current.submit(custom); });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    act(() => result.current.close());
    await act(async () => { finish({ ok: true, movie: { id: "saved" } }); await pending; });
    expect(result.current.open).toBe(false);
    expect(result.current.result.ok).toBe(true);
    expect(result.current.operation).toMatchObject({ bowlName: "Friday Night", movie: { title: "Wildcard" } });
  });

  it("blocks repeat submit while metadata is pending", async () => {
    let finish; mocks.details.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = await open(); let pending; let second;
    act(() => { pending = result.current.submit({ id: 42, title: "Movie" }); });
    await act(async () => { second = await result.current.submit(custom); });
    expect(second.code).toBe("pending");
    await act(async () => { finish({}); await pending; });
    expect(mocks.add).toHaveBeenCalledOnce();
  });

  it("keeps an uncertain operation resolvable without blocking the rest of Add", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "outcome_unknown", message: "Check status" });
    const { result } = await open(); const sessionId = result.current.id;
    await act(async () => { await result.current.submit(custom); });
    expect(result.current.unresolved).toHaveLength(1);
    act(() => { result.current.clearFeedback(); });
    expect(result.current.result).toBeNull();
    expect(result.current.unresolved).toHaveLength(1);
    act(() => { result.current.setDestination(bowls[1]); });
    expect(result.current.destination.id).toBe("b");
    await act(async () => { await result.current.submit({ ...custom, title: "Second" }); });
    expect(mocks.add).toHaveBeenCalledTimes(2);
    act(() => result.current.close());
    await act(async () => { await result.current.openGlobalAdd(); });
    expect(result.current.id).not.toBe(sessionId);
    expect(result.current.unresolved).toHaveLength(1);
    await act(async () => { await result.current.submit(custom); });
    expect(result.current.result.code).toBe("awaiting_confirmation");
    expect(mocks.add).toHaveBeenCalledTimes(2);
    mocks.checkStatus.mockResolvedValue({ ok: true, movie: { id: "saved" } });
    await act(async () => { await result.current.checkStatus(); });
    expect(result.current.result.ok).toBe(true);
    expect(result.current.unresolved).toEqual([]);
  });

  it("keeps an uncommitted add claimed so the same title cannot slip through under a new id", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "add_not_committed", message: "Not added" });
    const { result } = await open();
    await act(async () => { await result.current.submit(custom); });
    const submissionId = mocks.add.mock.calls[0][0].submissionId;
    expect(result.current.unresolved).toHaveLength(1);

    // The first write may still land, so none of these may release the title.
    act(() => { result.current.clearFeedback(); result.current.setDestination(bowls[1]); result.current.close(); });
    await act(async () => { await result.current.openGlobalAdd(); });
    expect(result.current.unresolved).toHaveLength(1);

    await act(async () => { await result.current.submit(custom); });
    expect(result.current.result.code).toBe("awaiting_confirmation");
    expect(mocks.add).toHaveBeenCalledTimes(1);

    mocks.add.mockResolvedValueOnce({ ok: true, movie: { id: "saved" } });
    await act(async () => { await result.current.retryAdd(submissionId); });
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.add.mock.calls[1][0].submissionId).toBe(submissionId);
    expect(result.current.result.ok).toBe(true);
    expect(result.current.unresolved).toEqual([]);

    // Settled, so the title is free again.
    await act(async () => { await result.current.submit(custom); });
    expect(mocks.add).toHaveBeenCalledTimes(3);
  });

  it("keeps a claim when the retry itself fails before dispatch", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "add_not_committed", message: "Not added" });
    const { result } = await open();
    await act(async () => { await result.current.submit(custom); });
    const submissionId = mocks.add.mock.calls[0][0].submissionId;

    // Offline says nothing about whether the first write is still on its way.
    mocks.add.mockResolvedValueOnce({ ok: false, code: "offline", message: "You are offline." });
    await act(async () => { await result.current.retryAdd(submissionId); });
    expect(result.current.result.code).toBe("offline");
    expect(result.current.unresolved).toHaveLength(1);
    expect(result.current.unresolved[0].result.message).toBe("Not added");

    await act(async () => { await result.current.submit(custom); });
    expect(result.current.result.code).toBe("awaiting_confirmation");
    expect(mocks.add).toHaveBeenCalledTimes(2);
  });

  it("cannot dispatch under an account that unmounts while metadata loads", async () => {
    let finish; mocks.details.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = await open(); let pending;
    act(() => { pending = view.result.current.submit({ id: 42, title: "Movie" }); });
    view.unmount();
    await act(async () => { finish({}); await pending; });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("does not choose a stale destination when a fresh context read fails", async () => {
    mocks.refresh.mockResolvedValue(null);
    const { result } = await open();
    expect(result.current.destination).toBeNull();
    expect(result.current.initializing).toBe(false);
  });

  it("does not compete with an existing draw or edit dialog", async () => {
    document.body.innerHTML = '<div aria-modal="true"></div>';
    const { result } = await open();
    expect(result.current.open).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
