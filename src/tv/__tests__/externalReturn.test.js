import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearExternalReturn,
  readExternalReturn,
  rememberExternalReturn,
} from "../utils/externalReturn";

describe("TV external return state", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it("restores a recent drawn movie only for its bowl", () => {
    rememberExternalReturn({
      bowlId: "family",
      movie: { id: "movie-1", title: "Arrival" },
    });

    expect(readExternalReturn("family")).toEqual({
      id: "movie-1",
      title: "Arrival",
    });
    expect(readExternalReturn("friends")).toBeNull();
  });

  it("discards expired and explicitly cleared state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T20:00:00.000Z"));
    rememberExternalReturn({
      bowlId: "family",
      movie: { id: "movie-1", title: "Arrival" },
    });

    vi.setSystemTime(new Date("2026-08-17T20:31:00.000Z"));
    expect(readExternalReturn("family")).toBeNull();

    rememberExternalReturn({
      bowlId: "family",
      movie: { id: "movie-1", title: "Arrival" },
    });
    clearExternalReturn();
    expect(readExternalReturn("family")).toBeNull();
  });
});
