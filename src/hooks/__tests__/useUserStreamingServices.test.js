import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useUserStreamingServices from "../useUserStreamingServices";
import { DEFAULT_DRAW_SETTINGS } from "../../utils/drawSettings";

const mocks = vi.hoisted(() => {
  const state = {
    authUser: { id: "user-1" },
    profileStreamingServices: [" hbo max ", "Netflix", "netflix"],
    profileDefaultDrawSettings: { prioritizeStreaming: true, runtimeMaxMinutes: 180 },
    profileRemoveFromBowlsOnSoloDraw: true,
    updateError: null,
    loadError: null,
    updateWait: null,
    updatedPayloads: [],
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: state.authUser ? { user: state.authUser } : null },
        error: null,
      })),
    },
    from: vi.fn((table) => {
      const queryState = { table, action: "select", filters: [], payload: null };
      const query = {
        select: vi.fn(() => {
          queryState.action = "select";
          return query;
        }),
        update: vi.fn((payload) => {
          queryState.action = "update";
          queryState.payload = payload;
          return query;
        }),
        eq: vi.fn((key, value) => {
          queryState.filters.push({ key, value });
          return query;
        }),
        single: vi.fn(async () => {
          if (table === "profiles") {
            return {
              data: {
                streaming_services: state.profileStreamingServices,
                default_draw_settings: state.profileDefaultDrawSettings,
                remove_from_bowls_on_solo_draw: state.profileRemoveFromBowlsOnSoloDraw,
              },
              error: state.loadError,
            };
          }
          return { data: null, error: null };
        }),
        then: (resolve, reject) => {
          if (table === "profiles" && queryState.action === "update") {
            state.updatedPayloads.push(queryState.payload);
            return Promise.resolve(state.updateWait).then(() => ({ data: [], error: state.updateError })).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return query;
    }),
  };

  return { state, supabase };
});

vi.mock("../../lib/supabase", () => ({
  supabase: mocks.supabase,
}));

describe("useUserStreamingServices", () => {
  beforeEach(() => {
    mocks.state.authUser = { id: "user-1" };
    mocks.state.profileStreamingServices = [" hbo max ", "Netflix", "netflix"];
    mocks.state.profileDefaultDrawSettings = { prioritizeStreaming: true, runtimeMaxMinutes: 180 };
    mocks.state.profileRemoveFromBowlsOnSoloDraw = true;
    mocks.state.updateError = null;
    mocks.state.loadError = null;
    mocks.state.updateWait = null;
    mocks.state.updatedPayloads = [];
    mocks.supabase.auth.getSession.mockClear();
    mocks.supabase.from.mockClear();
  });

  it("loads and normalizes streaming services by default", async () => {
    const { result } = renderHook(() => useUserStreamingServices());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.streamingServices).toEqual(["Max", "Netflix"]);
      expect(result.current.defaultDrawSettings).toEqual({
        ...DEFAULT_DRAW_SETTINGS,
        prioritizeStreaming: true,
        runtimeMaxMinutes: 180,
      });
    });
  });

  it("skips auto load when disabled and supports local mutation helpers", async () => {
    const { result } = renderHook(() => useUserStreamingServices({ autoLoad: false }));

    expect(result.current.loading).toBe(false);
    expect(result.current.streamingServices).toEqual([]);
    expect(result.current.defaultDrawSettings).toEqual(DEFAULT_DRAW_SETTINGS);

    act(() => {
      result.current.setStreamingServices([" netflix ", "HBO Max"]);
    });
    expect(result.current.streamingServices).toEqual(["Netflix", "Max"]);

    act(() => {
      result.current.toggleService("Hulu");
    });
    expect(result.current.streamingServices).toEqual(["Netflix", "Max", "Hulu"]);

    act(() => {
      result.current.toggleService("Max");
    });
    expect(result.current.streamingServices).toEqual(["Netflix", "Hulu"]);
  });

  it("returns empty services when unauthenticated", async () => {
    mocks.state.authUser = null;

    const { result } = renderHook(() => useUserStreamingServices());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.streamingServices).toEqual([]);
    expect(result.current.defaultDrawSettings).toEqual(DEFAULT_DRAW_SETTINGS);
  });

  it("saves normalized streaming services and updates local state", async () => {
    const { result } = renderHook(() => useUserStreamingServices({ autoLoad: false }));

    let response;
    await act(async () => {
      response = await result.current.saveStreamingServices([" hbo max ", "Netflix", "netflix"]);
    });

    expect(response).toEqual({ error: null });
    expect(mocks.state.updatedPayloads).toEqual([
      { streaming_services: ["Max", "Netflix"] },
    ]);
    expect(result.current.streamingServices).toEqual(["Max", "Netflix"]);
  });

  it("returns an error when save is attempted while unauthenticated", async () => {
    mocks.state.authUser = null;
    const { result } = renderHook(() => useUserStreamingServices({ autoLoad: false }));

    let response;
    await act(async () => {
      response = await result.current.saveStreamingServices(["Netflix"]);
    });

    expect(response.error).toBeTruthy();
    expect(mocks.state.updatedPayloads).toEqual([]);
  });

  it("saves default draw settings and updates local state", async () => {
    const { result } = renderHook(() => useUserStreamingServices({ autoLoad: false }));

    const nextSettings = {
      ...DEFAULT_DRAW_SETTINGS,
      prioritizeStreaming: true,
      selectedRatings: ["PG-13", "R"],
      runtimeMaxMinutes: 180,
    };

    let response;
    await act(async () => {
      response = await result.current.saveDefaultDrawSettings(nextSettings);
    });

    expect(response).toEqual({ error: null });
    expect(mocks.state.updatedPayloads).toEqual([
      { default_draw_settings: nextSettings },
    ]);
    expect(result.current.defaultDrawSettings).toEqual(nextSettings);
  });

  it("loads whether solo draws take your copies out of your bowls", async () => {
    const { result } = renderHook(() => useUserStreamingServices());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.removeFromBowlsOnSoloDraw).toBe(true);
    });
  });

  // A profile written before the column existed reads as off, which is the
  // default the setting ships with rather than a missing answer.
  it("treats an absent automatic-removal setting as off", async () => {
    mocks.state.profileRemoveFromBowlsOnSoloDraw = undefined;
    const { result } = renderHook(() => useUserStreamingServices());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.removeFromBowlsOnSoloDraw).toBe(false);
    });
  });

  // Its own column, so saving it never rewrites the draw-settings blob beside
  // it -- and a client that has never heard of it cannot drop it.
  it("saves automatic removal on its own column", async () => {
    const { result } = renderHook(() => useUserStreamingServices({ autoLoad: false }));

    let response;
    await act(async () => {
      response = await result.current.saveRemoveFromBowlsOnSoloDraw(true);
    });

    expect(response).toEqual({ error: null });
    expect(mocks.state.updatedPayloads).toEqual([
      { remove_from_bowls_on_solo_draw: true },
    ]);
    expect(result.current.removeFromBowlsOnSoloDraw).toBe(true);
  });

  it("can reload services on demand", async () => {
    const { result } = renderHook(() => useUserStreamingServices({ autoLoad: false }));

    mocks.state.profileStreamingServices = ["Disney Plus", "peacock premium"];

    let loaded;
    await act(async () => {
      loaded = await result.current.reloadStreamingServices();
    });

    expect(loaded).toEqual(["Disney+", "Peacock"]);
    expect(result.current.streamingServices).toEqual(["Disney+", "Peacock"]);
  });

  it("merges filter edits without resetting playback, and playback edits without resetting filters", async () => {
    mocks.state.profileDefaultDrawSettings = {
      ...DEFAULT_DRAW_SETTINGS, theaterModeEnabled: true, theaterTrailerCount: 2,
      enablePreferredWebLaunch: true, selectedGenres: ["Comedy"], runtimeMaxMinutes: 180,
    };
    const { result } = renderHook(() => useUserStreamingServices());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.saveDefaultDrawSettings({ runtimeMaxMinutes: 120, selectedRatings: ["PG"] }));
    expect(mocks.state.updatedPayloads.at(-1).default_draw_settings).toEqual({
      ...mocks.state.profileDefaultDrawSettings, runtimeMaxMinutes: 120, selectedRatings: ["PG"],
    });
    await act(async () => result.current.saveDefaultDrawSettings({ theaterModeEnabled: false }));
    expect(mocks.state.updatedPayloads.at(-1).default_draw_settings).toEqual({
      ...mocks.state.profileDefaultDrawSettings, runtimeMaxMinutes: 120, selectedRatings: ["PG"], theaterModeEnabled: false,
    });
  });

  it("does not let a slow save overwrite a newer local playback edit", async () => {
    let finishSave;
    mocks.state.updateWait = new Promise((resolve) => { finishSave = resolve; });
    const { result } = renderHook(() => useUserStreamingServices());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pendingSave;
    act(() => { pendingSave = result.current.saveDefaultDrawSettings({ theaterModeEnabled: true }); });
    act(() => result.current.setDefaultDrawSettings({ ...result.current.defaultDrawSettings, theaterModeEnabled: true, theaterTrailerCount: 4 }));
    await act(async () => { finishSave(); await pendingSave; });
    expect(result.current.defaultDrawSettings.theaterTrailerCount).toBe(4);
  });

  it("refuses to overwrite preferences after a failed load and can retry the load", async () => {
    const error = new Error("Profile unavailable");
    mocks.state.loadError = error;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useUserStreamingServices());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe(error);
    let response;
    await act(async () => { response = await result.current.saveDefaultDrawSettings({ runtimeMaxMinutes: 120 }); });
    expect(response.error).toBe(error);
    expect(mocks.state.updatedPayloads).toEqual([]);
    mocks.state.loadError = null;
    await act(async () => result.current.reloadStreamingServices());
    expect(result.current.loadError).toBeNull();
    expect(result.current.defaultDrawSettings.runtimeMaxMinutes).toBe(180);
    consoleSpy.mockRestore();
  });

  it("stores a display name in normalized form", async () => {
    const { result } = renderHook(() => useUserStreamingServices());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response;
    await act(async () => { response = await result.current.saveDisplayName("  Movie   Friend  "); });

    expect(response.error).toBeFalsy();
    expect(mocks.state.updatedPayloads).toEqual([{ display_name: "Movie Friend" }]);
  });

  it("clears a display name to null rather than refusing it", async () => {
    const { result } = renderHook(() => useUserStreamingServices());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The column is nullable and the empty string violates its check
    // constraint, so clearing has to write absent, not blank.
    let response;
    await act(async () => { response = await result.current.saveDisplayName("   "); });

    expect(response.error).toBeFalsy();
    expect(mocks.state.updatedPayloads).toEqual([{ display_name: null }]);
  });

  it("refuses a display name past the stored limit", async () => {
    const { result } = renderHook(() => useUserStreamingServices());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response;
    await act(async () => { response = await result.current.saveDisplayName("x".repeat(41)); });

    expect(response.error.message).toMatch(/40 characters or fewer/);
    expect(mocks.state.updatedPayloads).toEqual([]);
  });
});
