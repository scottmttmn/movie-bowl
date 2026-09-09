import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-anon-key";
const STORAGE_KEY = "movie-bowl:test:shared-auth-session";

describe("Supabase browser session coordination", () => {
  let originalLocksDescriptor;

  beforeEach(() => {
    originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);

    if (originalLocksDescriptor) {
      Object.defineProperty(navigator, "locks", originalLocksDescriptor);
    } else {
      delete navigator.locks;
    }
  });

  it("initializes concurrent app windows without acquiring a Navigator lock", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = vi.fn(() => {
      throw new Error("The legacy cross-window auth lock was used.");
    });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });

    const options = {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storage: window.localStorage,
        storageKey: STORAGE_KEY,
      },
    };
    const appClient = createClient(SUPABASE_URL, SUPABASE_KEY, options);
    const browserClient = createClient(SUPABASE_URL, SUPABASE_KEY, options);

    try {
      const results = await Promise.all([
        appClient.auth.getSession(),
        browserClient.auth.getSession(),
      ]);

      expect(results).toEqual([
        { data: { session: null }, error: null },
        { data: { session: null }, error: null },
      ]);
      expect(request).not.toHaveBeenCalled();
    } finally {
      await appClient.auth.dispose();
      await browserClient.auth.dispose();
      warnSpy.mockRestore();
    }
  });
});
