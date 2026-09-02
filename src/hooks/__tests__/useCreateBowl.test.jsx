import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useCreateBowl from "../useCreateBowl";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCreateBowl({ ownedBowlCount = 0, result } = {}) {
  const refresh = vi.fn(async () => {});
  const service = {
    create: vi.fn(async () => result || ({
      ok: true,
      code: null,
      errorMessage: null,
      actionMessage: null,
      bowl: { id: "bowl-1", name: "Weekend Bowl" },
    })),
  };
  const view = renderHook(() => useCreateBowl({ ownedBowlCount, refresh, service }));
  return { ...view, refresh, service };
}

describe("useCreateBowl", () => {
  it("refuses to open at the owned-bowl limit", () => {
    const { result, service } = renderCreateBowl({ ownedBowlCount: 10 });

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isLimitReached).toBe(true);
    expect(result.current.errorMessage).toBe("You can create up to 10 bowls.");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("leaves the dialog and draft intact after a fatal failure", async () => {
    const failure = {
      ok: false,
      code: "name_required",
      errorMessage: "Bowl name is required.",
      actionMessage: null,
      bowl: null,
    };
    const { result, refresh, service } = renderCreateBowl({ result: failure });
    act(() => {
      result.current.open();
      result.current.setBowlName("Weekend Bowl");
      result.current.setInviteEmails("friend@example.com");
    });

    let createResult;
    await act(async () => {
      createResult = await result.current.create();
    });

    expect(createResult).toBe(failure);
    expect(service.create).toHaveBeenCalledWith({
      bowlName: "Weekend Bowl",
      inviteEmails: "friend@example.com",
      ownedBowlCount: 0,
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.bowlName).toBe("Weekend Bowl");
    expect(result.current.inviteEmails).toBe("friend@example.com");
    expect(result.current.errorMessage).toBe("Bowl name is required.");
    expect(result.current.isCreating).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes, closes, and returns the new bowl after success", async () => {
    const success = {
      ok: true,
      code: null,
      errorMessage: null,
      actionMessage: "Bowl created and 1 invite email sent.",
      bowl: { id: "bowl-7", name: "Weekend Bowl" },
    };
    const { result, refresh } = renderCreateBowl({ result: success });
    act(() => {
      result.current.open();
      result.current.setBowlName("Weekend Bowl");
      result.current.setInviteEmails("friend@example.com");
    });

    let createResult;
    await act(async () => {
      createResult = await result.current.create();
    });

    expect(createResult).toBe(success);
    expect(refresh).toHaveBeenCalledWith({ force: true });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.bowlName).toBe("");
    expect(result.current.inviteEmails).toBe("");
    expect(result.current.actionMessage).toBe("Bowl created and 1 invite email sent.");
  });

  it("closes and refreshes while retaining a partial-success error", async () => {
    const partialSuccess = {
      ok: true,
      code: "invites_failed",
      errorMessage: "Bowl created, but invites could not be created.",
      actionMessage: null,
      bowl: { id: "bowl-8", name: "Weekend Bowl" },
    };
    const { result, refresh } = renderCreateBowl({ result: partialSuccess });
    act(() => result.current.open());

    await act(async () => {
      await result.current.create();
    });

    expect(refresh).toHaveBeenCalledWith({ force: true });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.errorMessage).toBe("Bowl created, but invites could not be created.");

    act(() => result.current.close());
    expect(result.current.errorMessage).toBeNull();
  });

  it("shares one operation across repeated submits until refresh settles", async () => {
    const success = {
      ok: true,
      code: null,
      errorMessage: null,
      actionMessage: null,
      bowl: { id: "bowl-9", name: "Weekend Bowl" },
    };
    let finishCreate;
    let finishRefresh;
    const service = {
      create: vi.fn(() => new Promise((resolve) => { finishCreate = resolve; })),
    };
    const refresh = vi.fn(() => new Promise((resolve) => { finishRefresh = resolve; }));
    const { result } = renderHook(() => useCreateBowl({
      ownedBowlCount: 9,
      refresh,
      service,
    }));
    act(() => {
      result.current.open();
      result.current.setBowlName("Weekend Bowl");
      result.current.setInviteEmails("friend@example.com");
    });

    let first;
    let repeatedDuringCreate;
    act(() => {
      first = result.current.create();
      repeatedDuringCreate = result.current.create();
    });

    expect(repeatedDuringCreate).toBe(first);
    expect(result.current.isCreating).toBe(true);
    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));

    await act(async () => {
      finishCreate(success);
      await Promise.resolve();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledWith({ force: true }));

    let repeatedDuringRefresh;
    act(() => {
      repeatedDuringRefresh = result.current.create();
    });
    expect(repeatedDuringRefresh).toBe(first);
    expect(service.create).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishRefresh();
      await first;
    });

    expect(result.current.isCreating).toBe(false);
    expect(result.current.isOpen).toBe(false);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["creation", true],
    ["refresh", false],
  ])("abandons local state safely when dismissed during %s", async (_stage, dismissDuringCreate) => {
    const success = {
      ok: true,
      code: null,
      errorMessage: null,
      actionMessage: "Bowl created.",
      bowl: { id: "bowl-10", name: "Bowl A" },
    };
    let finishCreate;
    let finishRefresh;
    const service = {
      create: vi.fn(() => dismissDuringCreate
        ? new Promise((resolve) => { finishCreate = resolve; })
        : Promise.resolve(success)),
    };
    const refresh = vi.fn(() => dismissDuringCreate
      ? Promise.resolve()
      : new Promise((resolve) => { finishRefresh = resolve; }));
    const { result } = renderHook(() => useCreateBowl({
      ownedBowlCount: 0,
      refresh,
      service,
    }));
    act(() => {
      result.current.open();
      result.current.setBowlName("Bowl A");
      result.current.setInviteEmails("friend@example.com");
    });

    let operation;
    act(() => {
      operation = result.current.create();
    });
    await waitFor(() => expect(
      dismissDuringCreate ? service.create : refresh
    ).toHaveBeenCalledTimes(1));

    let closed;
    act(() => {
      closed = result.current.close();
    });
    expect(closed).toBe(true);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.bowlName).toBe("");
    expect(result.current.inviteEmails).toBe("");
    expect(result.current.actionMessage).toBeNull();

    let reopened;
    act(() => {
      reopened = result.current.open();
    });
    expect(reopened).toBe(false);
    expect(result.current.isOpen).toBe(false);

    await act(async () => {
      if (dismissDuringCreate) finishCreate(success);
      else finishRefresh();
      await operation;
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.bowlName).toBe("");
    expect(result.current.inviteEmails).toBe("");
    expect(result.current.actionMessage).toBeNull();
    expect(result.current.isCreating).toBe(false);
  });

  it.each([
    ["service", true],
    ["refresh", false],
  ])("turns an unexpected %s rejection into an outcome-safe result", async (_stage, serviceRejects) => {
    const failure = new Error("dependency failed");
    const success = {
      ok: true,
      code: null,
      errorMessage: null,
      actionMessage: "Bowl created.",
      bowl: { id: "bowl-11", name: "Weekend Bowl" },
    };
    const service = {
      create: vi.fn(async () => {
        if (serviceRejects) throw failure;
        return success;
      }),
    };
    const refresh = vi.fn(async () => {
      if (!serviceRejects) throw failure;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useCreateBowl({
      ownedBowlCount: 0,
      refresh,
      service,
    }));
    act(() => {
      result.current.open();
      result.current.setBowlName("Weekend Bowl");
    });

    let createResult;
    await act(async () => {
      createResult = await result.current.create();
    });

    expect(createResult).toMatchObject({
      ok: false,
      code: "outcome_unknown",
      errorMessage: "Could not finish creating the bowl. Check your bowls before trying again.",
    });
    expect(result.current.errorMessage).toBe(
      "Could not finish creating the bowl. Check your bowls before trying again."
    );
    expect(result.current.actionMessage).toBeNull();
    expect(result.current.isCreating).toBe(false);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.bowlName).toBe("Weekend Bowl");
    expect(console.error).toHaveBeenCalledWith("[useCreateBowl] Unexpected creation failure", failure);
  });
});
