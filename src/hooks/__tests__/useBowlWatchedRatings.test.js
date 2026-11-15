import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchBowlWatchedRatings: vi.fn(),
  saveMyMovieRating: vi.fn(),
}));

vi.mock("../../lib/thumbRatings", () => mocks);

import useBowlWatchedRatings from "../useBowlWatchedRatings";

const FACE_DOWN = [{ draw_event_id: "d1", user_id: "robin", display_name: "Robin", rating: null, is_self: false }];
const TURNED_OVER = [
  { draw_event_id: "d1", user_id: "me", display_name: "Scott", rating: 1, is_self: true },
  { draw_event_id: "d1", user_id: "robin", display_name: "Robin", rating: 2, is_self: false },
];

describe("useBowlWatchedRatings", () => {
  beforeEach(() => {
    mocks.fetchBowlWatchedRatings.mockReset();
    mocks.saveMyMovieRating.mockReset();
  });

  it("reads nothing for a bowl with nothing to rate", () => {
    const { result } = renderHook(() => useBowlWatchedRatings(null, ""));
    expect(result.current.groups).toBeNull();
    expect(mocks.fetchBowlWatchedRatings).not.toHaveBeenCalled();
  });

  it("turns the bowl over by reading again once you have rated", async () => {
    mocks.fetchBowlWatchedRatings.mockResolvedValueOnce(FACE_DOWN).mockResolvedValueOnce(TURNED_OVER);
    mocks.saveMyMovieRating.mockResolvedValue({ ok: true, rating: 1 });
    const { result } = renderHook(() => useBowlWatchedRatings("bowl-1", "d1"));

    await waitFor(() => expect(result.current.groups?.get("d1")?.others[0].rating).toBeNull());

    await act(async () => {
      await result.current.rate("d1", "entry-1", 1);
    });

    expect(mocks.saveMyMovieRating).toHaveBeenCalledWith("entry-1", 1);
    expect(result.current.groups.get("d1")).toEqual({
      mine: 1,
      others: [{ userId: "robin", name: "Robin", rating: 2 }],
    });
  });

  it("puts your thumb back when the save fails", async () => {
    mocks.fetchBowlWatchedRatings.mockResolvedValue(FACE_DOWN);
    mocks.saveMyMovieRating.mockResolvedValue({ ok: false, message: "Could not save your rating. Please try again." });
    const { result } = renderHook(() => useBowlWatchedRatings("bowl-1", "d1"));
    await waitFor(() => expect(result.current.groups).not.toBeNull());

    let outcome;
    await act(async () => {
      outcome = await result.current.rate("d1", "entry-1", 2);
    });

    expect(outcome.ok).toBe(false);
    expect(result.current.groups.get("d1").mine).toBeNull();
    expect(mocks.fetchBowlWatchedRatings).toHaveBeenCalledTimes(1);
  });

  it("shows no thumbs when the bowl's cannot be read", async () => {
    mocks.fetchBowlWatchedRatings.mockResolvedValue(null);
    const { result } = renderHook(() => useBowlWatchedRatings("bowl-1", "d1"));
    await waitFor(() => expect(mocks.fetchBowlWatchedRatings).toHaveBeenCalled());
    expect(result.current.groups).toBeNull();
  });
});
