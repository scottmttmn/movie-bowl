import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAutosave, { AUTOSAVE_DELAY_MS, valuesAreEqual } from "../useAutosave";

function renderAutosave({ value, save, enabled = true }) {
  return renderHook((props) => useAutosave(props), {
    initialProps: { value, save, enabled },
  });
}

// Lets the debounce elapse and any resulting save promise settle.
async function settle(extraMs = AUTOSAVE_DELAY_MS + 50) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(extraMs);
  });
}

describe("valuesAreEqual", () => {
  it("compares nested arrays and objects by value", () => {
    expect(valuesAreEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(valuesAreEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(valuesAreEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(valuesAreEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(valuesAreEqual(null, { a: 1 })).toBe(false);
    expect(valuesAreEqual(null, null)).toBe(true);
  });
});

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle and saves nothing until the value changes", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });
    const { result } = renderAutosave({ value: { count: 1 }, save });

    expect(result.current.status).toBe("idle");
    expect(result.current.hasUnsavedChanges).toBe(false);

    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it("debounces a burst of edits into a single save of the final value", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });
    const { result, rerender } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("pending");

    rerender({ value: { count: 3 }, save, enabled: true });
    await settle();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ count: 3 }, { count: 1 });
    expect(result.current.status).toBe("saved");
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it("ignores an edit that is reverted before the debounce elapses", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });
    const { result, rerender } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    rerender({ value: { count: 1 }, save, enabled: true });
    await settle();

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("treats the value present when it becomes enabled as already saved", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });
    const { result, rerender } = renderAutosave({ value: {}, save, enabled: false });

    rerender({ value: { loaded: true }, save, enabled: true });
    await settle();

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    rerender({ value: { loaded: true, edited: true }, save, enabled: true });
    await settle();

    expect(save).toHaveBeenCalledWith({ loaded: true, edited: true }, { loaded: true });
  });

  it("saves again for edits made while a save is in flight", async () => {
    let releaseFirstSave;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          releaseFirstSave = () => resolve({ error: null });
        })
      )
      .mockResolvedValue({ error: null });

    const { result, rerender } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");

    // Edit lands mid-flight; it must not be swallowed by the in-progress write.
    rerender({ value: { count: 3 }, save, enabled: true });
    await act(async () => {
      releaseFirstSave();
    });
    await settle();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ count: 3 }, { count: 2 });
    expect(result.current.status).toBe("saved");
  });

  it("reports a rejected save as an error and retries on demand", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ error: null });

    const { result, rerender } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    await settle();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toEqual(new Error("offline"));
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      await result.current.retry();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("clears a failure once the failed edit is reverted", async () => {
    const save = vi.fn().mockResolvedValue({ error: new Error("offline") });
    const { result, rerender } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    await settle();
    expect(result.current.status).toBe("error");

    rerender({ value: { count: 1 }, save, enabled: true });
    await settle();

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("retries automatically when the value changes after a failure", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("offline") })
      .mockResolvedValue({ error: null });

    const { result, rerender } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    await settle();
    expect(result.current.status).toBe("error");

    rerender({ value: { count: 3 }, save, enabled: true });
    await settle();

    expect(save).toHaveBeenLastCalledWith({ count: 3 }, { count: 1 });
    expect(result.current.status).toBe("saved");
  });

  it("still writes an edit made mid-request when it unmounts before the request lands", async () => {
    let releaseFirstSave;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          releaseFirstSave = () => resolve({ error: null });
        })
      )
      .mockResolvedValue({ error: null });

    const { rerender, unmount } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);

    // Edit lands while the first write is still open, then the user navigates
    // away before it comes back.
    rerender({ value: { count: 3 }, save, enabled: true });
    unmount();
    await act(async () => {
      releaseFirstSave();
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ count: 3 }, { count: 2 });
  });

  it("flushes a pending save when it unmounts", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });
    const { rerender, unmount } = renderAutosave({ value: { count: 1 }, save });

    rerender({ value: { count: 2 }, save, enabled: true });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(save).toHaveBeenCalledWith({ count: 2 }, { count: 1 });
  });

  it("warns before unload while changes are unsaved", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const save = vi.fn().mockResolvedValue({ error: null });

    const { rerender } = renderAutosave({ value: { count: 1 }, save });
    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    rerender({ value: { count: 2 }, save, enabled: true });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    await settle();
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
