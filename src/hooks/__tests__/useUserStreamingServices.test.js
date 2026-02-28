import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useUserStreamingServices from "../useUserStreamingServices";
import { DEFAULT_DRAW_SETTINGS } from "../../utils/drawSettings";

const mocks = vi.hoisted(() => {
  const state = {
    authUser: { id: "user-1" },
    profileStreamingServices: [" hbo max ", "Netflix", "netflix"],
    profileDefaultDrawSettings: { prioritizeStreaming: true, runtimeMaxMinutes: 180 },
    updateError: null,
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
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
        then: (resolve, reject) => {
          if (table === "profiles" && queryState.action === "update") {
            state.updatedPayloads.push(queryState.payload);
            return Promise.resolve({ data: [], error: state.updateError }).then(resolve, reject);
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
    mocks.state.updateError = null;
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
});
