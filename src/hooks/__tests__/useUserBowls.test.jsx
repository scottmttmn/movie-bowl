import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import useUserBowls, { UserBowlsProvider } from "../useUserBowls";
import { notifyBowlChange } from "../../lib/bowlChanges";
const context = (id = "a") => ({ data: { default_bowl_id: id, bowls: [
  { id: "a", name: "A", owner_id: "u1", remaining_count: 4 },
  { id: "b", name: "B", owner_id: "u2", remaining_count: 9 },
] }, error: null });
const wrapper = ({ children }) => <UserBowlsProvider userId="u1">{children}</UserBowlsProvider>;
beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue(context());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function loaded() {
  const view = renderHook(() => useUserBowls(), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}
describe("shared account bowl context", () => {
  it("normalizes owner/member cards without sorting the default first", async () => {
    mocks.rpc.mockResolvedValue(context("b")); const { result } = await loaded();
    expect(result.current.defaultBowlId).toBe("b");
    expect(result.current.bowls.map((bowl) => [bowl.id, bowl.role])).toEqual([["a", "Owner"], ["b", "Member"]]);
  });
  it("retains last good choice and rows when a refresh fails", async () => {
    const { result } = await loaded(); mocks.rpc.mockResolvedValue({ error: { message: "Offline" } });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.defaultBowlId).toBe("a"); expect(result.current.bowls).toHaveLength(2);
    expect(result.current.error).toMatch(/could not load/i);
  });
  it("does not let an older refresh overwrite a successful star change", async () => {
    const { result } = await loaded(); let finishRead; let read;
    mocks.rpc.mockImplementation((name) => name === "get_my_bowl_context"
      ? new Promise((resolve) => { finishRead = resolve; }) : Promise.resolve(context("b")));
    act(() => { read = result.current.refresh(); });
    await waitFor(() => expect(finishRead).toBeTypeOf("function"));
    await act(async () => { await result.current.setDefaultBowl("b"); });
    await act(async () => { finishRead(context("a")); await read; });
    expect(result.current.defaultBowlId).toBe("b");
  });
  it("keeps the previous star on save failure", async () => {
    const { result } = await loaded(); mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    let saved; await act(async () => { saved = await result.current.setDefaultBowl("b"); });
    expect(saved).toBeNull(); expect(result.current.defaultBowlId).toBe("a");
    expect(result.current.savingDefault).toBe(false);
  });
  it("serializes competing star requests", async () => {
    const { result } = await loaded(); let complete; let first; let second;
    mocks.rpc.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    act(() => { first = result.current.setDefaultBowl("b"); second = result.current.setDefaultBowl("a"); });
    await waitFor(() => expect(complete).toBeTypeOf("function"));
    expect(first).toBe(second);
    await act(async () => { complete(context("b")); await first; });
    expect(result.current.defaultBowlId).toBe("b");
  });
  it("refreshes authoritative context after a local access mutation", async () => {
    const { result } = await loaded(); mocks.rpc.mockResolvedValue({ data: { default_bowl_id: "b", bowls: [context().data.bowls[1]] } });
    act(() => notifyBowlChange({ userId: "u1", bowlId: "a" }));
    await waitFor(() => expect(result.current.defaultBowlId).toBe("b"));
    expect(result.current.bowls).toHaveLength(1);
  });
  it("does not query for disabled TV/public surfaces", () => {
    renderHook(() => useUserBowls(), { wrapper: ({ children }) => <UserBowlsProvider enabled={false} userId="u1">{children}</UserBowlsProvider> });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("drops responses from an unmounted account provider", async () => {
    let complete; mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const old = renderHook(() => useUserBowls(), { wrapper });
    await waitFor(() => expect(complete).toBeTypeOf("function")); old.unmount();
    mocks.rpc.mockResolvedValue({ data: { default_bowl_id: null, bowls: [] } });
    const next = await loaded();
    await act(async () => complete(context("b")));
    expect(next.result.current.bowls).toEqual([]); expect(next.result.current.defaultBowlId).toBeNull();
  });
});
