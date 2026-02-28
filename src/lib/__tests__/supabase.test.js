import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({ kind: "supabase-client" }));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

describe("supabase client module", () => {
  it("creates the client with the configured env vars", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

    const mod = await import("../supabase");

    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "anon-key");
    expect(mod.supabase).toEqual({ kind: "supabase-client" });

    vi.unstubAllEnvs();
  });
});
