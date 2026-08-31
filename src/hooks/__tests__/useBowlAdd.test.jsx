import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), add: vi.fn(), checkStatus: vi.fn(), details: vi.fn(), providers: vi.fn() }));
const bowls = [{ id: "a", name: "Friday Night" }, { id: "b", name: "Family Movies" }];
vi.mock("../useUserBowls", () => ({ default: () => ({ userId: "u1", bowls, refresh: mocks.refresh, loading: false, error: null }) }));
vi.mock("../../lib/addBowlMovie", () => ({ bowlMovieService: { add: mocks.add, checkStatus: mocks.checkStatus }, addResult: (ok, code, message) => ({ ok, code, message }) }));
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

  it("keeps an uncertain operation across dismissal and reopening without reinserting", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "outcome_unknown", message: "Check status" });
    const { result } = await open(); const sessionId = result.current.id;
    await act(async () => { await result.current.submit(custom); });
    act(() => { result.current.clearFeedback(); result.current.setDestination(bowls[1]); result.current.close(); });
    await act(async () => { await result.current.openGlobalAdd(); await result.current.submit(custom); });
    expect(result.current.id).toBe(sessionId);
    expect(result.current.destination.id).toBe("a");
    expect(result.current.result.code).toBe("outcome_unknown");
    expect(mocks.add).toHaveBeenCalledOnce();
    mocks.checkStatus.mockResolvedValue({ ok: true, movie: { id: "saved" } });
    await act(async () => { await result.current.checkStatus(); });
    expect(result.current.result.ok).toBe(true);
    expect(mocks.add).toHaveBeenCalledOnce();
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
