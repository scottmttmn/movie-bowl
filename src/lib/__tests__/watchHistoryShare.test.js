import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  deleteMyWatchHistoryShareLink,
  fetchMyWatchHistoryShareLink,
  fetchSharedWatchHistory,
  getWatchHistoryShareUrl,
  saveMyWatchHistoryShareLink,
} from "../watchHistoryShare";

beforeEach(() => {
  mocks.rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("watchHistoryShare", () => {
  it("builds the link from the origin and token", () => {
    expect(getWatchHistoryShareUrl("abc123", "https://moviebowl.app")).toBe("https://moviebowl.app/w/abc123");
  });

  it("reads your own link, or none", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { token: "t1", include_comments: true }, error: null });
    await expect(fetchMyWatchHistoryShareLink()).resolves.toEqual({
      ok: true,
      link: { token: "t1", includeComments: true },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_watch_history_share_link");

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchMyWatchHistoryShareLink()).resolves.toEqual({ ok: true, link: null });
  });

  it("treats a failed read as no link rather than throwing", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    await expect(fetchMyWatchHistoryShareLink()).resolves.toEqual({ ok: false, link: null });
    mocks.rpc.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchMyWatchHistoryShareLink()).resolves.toEqual({ ok: false, link: null });
  });

  it("saves the comments choice with the link", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { token: "t1", include_comments: false }, error: null });
    await expect(saveMyWatchHistoryShareLink({ includeComments: false })).resolves.toEqual({
      ok: true,
      link: { token: "t1", includeComments: false },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("save_my_watch_history_share_link", { p_include_comments: false });
  });

  it("returns a message when saving fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    const result = await saveMyWatchHistoryShareLink({ includeComments: true });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Could not update your link/);
  });

  it("turns the link off, and says so when it cannot", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteMyWatchHistoryShareLink()).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_my_watch_history_share_link");

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await expect(deleteMyWatchHistoryShareLink()).resolves.toMatchObject({ ok: false });
  });

  it("reads a shared history by token", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { display_name: "Scott", include_comments: true, entries: [{ title: "Ran" }] },
      error: null,
    });
    await expect(fetchSharedWatchHistory("tok")).resolves.toEqual({
      status: "ready",
      displayName: "Scott",
      includeComments: true,
      entries: [{ title: "Ran" }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_shared_watch_history", { p_token: "tok" });
  });

  it("tells an off link apart from a failed load", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchSharedWatchHistory("tok")).resolves.toEqual({ status: "off" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    await expect(fetchSharedWatchHistory("tok")).resolves.toEqual({ status: "error" });
    await expect(fetchSharedWatchHistory("")).resolves.toEqual({ status: "off" });
  });
});
