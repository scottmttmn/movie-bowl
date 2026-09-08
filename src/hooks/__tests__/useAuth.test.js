import { createElement } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../useAuth";
import useAuth from "../useAuth";

const mocks = vi.hoisted(() => {
  const state = {
    session: null,
    getSessionError: null,
    signInResponse: { error: null },
    verifyOtpResponse: { error: null },
    signOutResponse: { error: null },
    upsertError: null,
    upsertPayloads: [],
    authChangeCallback: null,
    unsubscribed: false,
  };

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: state.session },
        error: state.getSessionError,
      })),
      onAuthStateChange: vi.fn((callback) => {
        state.authChangeCallback = callback;
        return {
          data: {
            listener: true,
            subscription: {
              unsubscribe: () => {
                state.unsubscribed = true;
              },
            },
          },
        };
      }),
      signInWithOtp: vi.fn(async ({ email, options }) => ({
        ...state.signInResponse,
        email,
        options,
      })),
      verifyOtp: vi.fn(async () => state.verifyOtpResponse),
      signOut: vi.fn(async () => state.signOutResponse),
    },
    from: vi.fn(() => ({
      upsert: vi.fn(async (payload) => {
        state.upsertPayloads.push(payload);
        return { error: state.upsertError };
      }),
    })),
  };

  return { state, supabase };
});

vi.mock("../../lib/supabase", () => ({
  supabase: mocks.supabase,
}));

describe("useAuth", () => {
  beforeEach(() => {
    mocks.state.session = null;
    mocks.state.getSessionError = null;
    mocks.state.signInResponse = { error: null };
    mocks.state.verifyOtpResponse = { error: null };
    mocks.state.signOutResponse = { error: null };
    mocks.state.upsertError = null;
    mocks.state.upsertPayloads = [];
    mocks.state.authChangeCallback = null;
    mocks.state.unsubscribed = false;
    mocks.supabase.auth.getSession.mockClear();
    mocks.supabase.auth.onAuthStateChange.mockClear();
    mocks.supabase.auth.signInWithOtp.mockClear();
    mocks.supabase.auth.verifyOtp.mockClear();
    mocks.supabase.auth.signOut.mockClear();
    mocks.supabase.from.mockClear();
  });

  it("loads the initial session and exposes sign-in / sign-out helpers", async () => {
    mocks.state.session = { user: { id: "user-1", email: "user@example.com" } };

    const wrapper = ({ children }) => createElement(AuthProvider, null, children);
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.session).toEqual(mocks.state.session);
    });

    expect(mocks.state.upsertPayloads).toHaveLength(1);
    expect(mocks.state.upsertPayloads[0]).toMatchObject({
      id: "user-1",
      email: "user@example.com",
    });

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signIn("next@example.com");
    });
    expect(mocks.supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "next@example.com",
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    expect(signInResult).toMatchObject({ error: null });

    await act(async () => {
      await result.current.signIn("next@example.com", "https://moviebowl.app/accept-invite/token-1");
    });
    expect(mocks.supabase.auth.signInWithOtp).toHaveBeenLastCalledWith({
      email: "next@example.com",
      options: {
        emailRedirectTo: "https://moviebowl.app/accept-invite/token-1",
      },
    });

    let pairingResult;
    await act(async () => {
      pairingResult = await result.current.completeTvPairing("hashed-token", "magiclink");
    });
    expect(mocks.supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed-token",
      type: "magiclink",
    });
    expect(pairingResult).toEqual({ error: null });

    let signOutResult;
    await act(async () => {
      signOutResult = await result.current.signOut();
    });
    expect(mocks.supabase.auth.signOut).toHaveBeenCalled();
    expect(signOutResult).toEqual({ error: null });
    expect(result.current.session).toBeNull();

    unmount();
    expect(mocks.state.unsubscribed).toBe(true);
  });

  it("signs out only this device and preserves its saved TV preferences", async () => {
    mocks.state.session = { user: { id: "user-1" } };
    window.localStorage.setItem("movie-bowl:tv:draw-settings:user-1", "saved preferences");
    const wrapper = ({ children }) => createElement(AuthProvider, null, children);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).toEqual(mocks.state.session));

    await act(async () => {
      expect(await result.current.signOutThisDevice()).toEqual({ error: null });
    });
    expect(mocks.supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current.session).toBeNull();
    expect(window.localStorage.getItem("movie-bowl:tv:draw-settings:user-1")).toBe("saved preferences");
    window.localStorage.removeItem("movie-bowl:tv:draw-settings:user-1");
  });

  it("keeps the current session when device sign-out fails", async () => {
    mocks.state.session = { user: { id: "user-1" } };
    mocks.state.signOutResponse = { error: { message: "Network error" } };
    const wrapper = ({ children }) => createElement(AuthProvider, null, children);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).toEqual(mocks.state.session));

    await act(async () => {
      expect(await result.current.signOutThisDevice()).toEqual(mocks.state.signOutResponse);
    });
    expect(result.current.session).toEqual(mocks.state.session);

    mocks.supabase.auth.signOut.mockRejectedValueOnce(new Error("Connection lost"));
    await act(async () => {
      await expect(result.current.signOutThisDevice()).rejects.toThrow("Connection lost");
    });
    expect(result.current.session).toEqual(mocks.state.session);
  });

  it("handles getSession errors and still clears loading", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.getSessionError = { message: "bad session" };

    const wrapper = ({ children }) => createElement(AuthProvider, null, children);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.session).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("updates session and upserts profile on auth change events", async () => {
    const wrapper = ({ children }) => createElement(AuthProvider, null, children);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await mocks.state.authChangeCallback("SIGNED_IN", {
        user: { id: "user-2", email: "signedin@example.com" },
      });
    });

    expect(result.current.session).toEqual({
      user: { id: "user-2", email: "signedin@example.com" },
    });
    expect(mocks.state.upsertPayloads.at(-1)).toMatchObject({
      id: "user-2",
      email: "signedin@example.com",
    });
  });

  it("throws when used outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used within an AuthProvider");
  });
});
