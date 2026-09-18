import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordSoloDraw: vi.fn(),
  createSoloDrawRequestId: vi.fn(),
  fetchSoloDrawRemovedCopies: vi.fn(async () => []),
}));

vi.mock("../../lib/soloDraw", () => ({
  recordSoloDraw: mocks.recordSoloDraw,
  createSoloDrawRequestId: mocks.createSoloDrawRequestId,
  fetchSoloDrawRemovedCopies: mocks.fetchSoloDrawRemovedCopies,
}));

import useSoloDraw from "../useSoloDraw";
import { clearDrawSelectionCache } from "../../utils/drawSelection";

function movie(id, overrides = {}) {
  return {
    id,
    bowl_id: "bowl-1",
    tmdb_id: Number(id.replace(/\D/g, "")) || 1,
    title: `Movie ${id}`,
    genres: ["Action"],
    runtime: 100,
    ...overrides,
  };
}

const NO_FILTERS = {};

function renderSoloDraw(overrides = {}) {
  return renderHook(() =>
    useSoloDraw({
      fetchMovieDetails: vi.fn(async () => ({})),
      fetchProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
      fetchFilterMetadata: vi.fn(async () => ({})),
      randomFn: () => 0,
      ...overrides,
    })
  );
}

let requestIdCount = 0;

beforeEach(() => {
  clearDrawSelectionCache();
  requestIdCount = 0;
  mocks.createSoloDrawRequestId.mockReset().mockImplementation(() => {
    requestIdCount += 1;
    return `request-${requestIdCount}`;
  });
  mocks.recordSoloDraw.mockReset().mockImplementation(async () => ({
    ok: true,
    code: null,
    message: "",
    event: { id: "event-1", watched_on: "2026-09-15" },
  }));
  mocks.fetchSoloDrawRemovedCopies.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useSoloDraw", () => {
  it("commits the pick before revealing it", async () => {
    const { result } = renderSoloDraw();

    await act(async () => {
      await result.current.draw([movie("m1")], NO_FILTERS);
    });

    expect(mocks.recordSoloDraw).toHaveBeenCalledWith("m1", "request-1");
    expect(result.current.result).toMatchObject({
      id: "m1",
      title: "Movie m1",
      watchEventId: "event-1",
    });
    expect(result.current.errorMessage).toBe("");
  });

  // Revealing is what commits a solo draw, so a save that fails must not show
  // a pick -- and must not quietly spend another one either.
  // The setting lives on the account, so the hook reports what the server
  // actually removed rather than deciding it here.
  it("carries the copies the draw removed into the result", async () => {
    mocks.fetchSoloDrawRemovedCopies.mockResolvedValue([
      { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Movie m1" },
    ]);
    const { result } = renderSoloDraw();

    await act(async () => {
      await result.current.draw([movie("m1")]);
    });

    expect(mocks.fetchSoloDrawRemovedCopies).toHaveBeenCalledWith("event-1");
    expect(result.current.result.removedCopies).toEqual([
      { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Movie m1" },
    ]);
  });

  it("reveals nothing when the save fails, and retries the same draw", async () => {
    mocks.recordSoloDraw.mockResolvedValueOnce({
      ok: false,
      code: "unexpected",
      message: "Could not save this draw. Please try again.",
      event: null,
    });

    const { result } = renderSoloDraw();

    await act(async () => {
      await result.current.draw([movie("m1"), movie("m2")], NO_FILTERS);
    });

    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBe("Could not save this draw. Please try again.");
    expect(result.current.canRetrySave).toBe(true);

    await act(async () => {
      await result.current.retrySave();
    });

    // Same movie, same request id: the retry finishes this draw rather than
    // starting another, and the server answers a replay with the first entry.
    expect(mocks.recordSoloDraw).toHaveBeenCalledTimes(2);
    expect(mocks.recordSoloDraw.mock.calls[1]).toEqual(["m1", "request-1"]);
    expect(mocks.createSoloDrawRequestId).toHaveBeenCalledTimes(1);
    expect(result.current.result).toMatchObject({ id: "m1" });
  });

  it("shows the server's own refusal of a title", async () => {
    mocks.recordSoloDraw.mockResolvedValueOnce({
      ok: false,
      code: "P0001",
      message: "This movie is no longer available to draw.",
      event: null,
    });

    const { result } = renderSoloDraw();

    await act(async () => {
      await result.current.draw([movie("m1")], NO_FILTERS);
    });

    expect(result.current.errorMessage).toBe("This movie is no longer available to draw.");
  });

  it("explains a pool the filters emptied, and saves nothing", async () => {
    const { result } = renderSoloDraw();

    await act(async () => {
      await result.current.draw([movie("m1", { runtime: 200 })], {
        runtimeFilter: { minMinutes: 0, maxMinutes: 100, includeUnknown: false },
      });
    });

    expect(result.current.errorMessage).toBe(
      "No titles match your runtime filter. Check your filters."
    );
    expect(mocks.recordSoloDraw).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it("draws one title per movie however many bowls hold it", async () => {
    const { result } = renderSoloDraw({ randomFn: () => 0.99 });

    await act(async () => {
      await result.current.draw(
        [
          movie("m1", { bowl_id: "bowl-1", tmdb_id: 500 }),
          movie("m2", { bowl_id: "bowl-2", tmdb_id: 500 }),
          movie("m3", { bowl_id: "bowl-3", tmdb_id: 900 }),
        ],
        NO_FILTERS
      );
    });

    expect(result.current.result).toMatchObject({ tmdb_id: 900 });
  });

  it("keeps the entry when the reveal is dismissed", async () => {
    const { result } = renderSoloDraw();

    await act(async () => {
      await result.current.draw([movie("m1")], NO_FILTERS);
    });
    act(() => result.current.dismissResult());

    await waitFor(() => expect(result.current.result).toBeNull());
    // Closing is not undo: nothing is deleted, and history still holds it.
    expect(mocks.recordSoloDraw).toHaveBeenCalledTimes(1);
  });
});
