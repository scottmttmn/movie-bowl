import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeTvPairingRateLimit,
  getClientAddress,
  TV_PAIRING_RATE_LIMITS,
} from "../_lib/tvPairingRateLimit.js";

describe("TV pairing rate limiting", () => {
  beforeEach(() => {
    process.env.TV_PAIRING_RATE_LIMIT_SECRET = "test-rate-limit-secret-at-least-32-characters";
  });

  afterEach(() => {
    delete process.env.TV_PAIRING_RATE_LIMIT_SECRET;
  });

  it("prefers Vercel's protected client address header", () => {
    expect(
      getClientAddress({
        headers: {
          "x-vercel-forwarded-for": "203.0.113.25",
          "x-forwarded-for": "198.51.100.4",
        },
      })
    ).toBe("203.0.113.25");
  });

  it("stores only a keyed pseudonym through the service-role RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });

    await consumeTvPairingRateLimit(
      { rpc },
      TV_PAIRING_RATE_LIMITS.startIp,
      "203.0.113.25"
    );

    expect(rpc).toHaveBeenCalledWith("consume_tv_pairing_rate_limit", {
      p_bucket: "start_ip",
      p_subject_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_limit: 12,
      p_window_seconds: 600,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("203.0.113.25");
  });

  it("fails closed when the secret or durable counter is unavailable", async () => {
    delete process.env.TV_PAIRING_RATE_LIMIT_SECRET;
    const rpc = vi.fn();

    await expect(
      consumeTvPairingRateLimit({ rpc }, TV_PAIRING_RATE_LIMITS.startIp, "203.0.113.25")
    ).rejects.toThrow("Missing or weak TV pairing rate-limit secret");
    expect(rpc).not.toHaveBeenCalled();

    process.env.TV_PAIRING_RATE_LIMIT_SECRET = "test-rate-limit-secret-at-least-32-characters";
    rpc.mockResolvedValue({ data: null, error: { message: "RPC unavailable" } });

    await expect(
      consumeTvPairingRateLimit({ rpc }, TV_PAIRING_RATE_LIMITS.startIp, "203.0.113.25")
    ).rejects.toThrow("TV pairing rate limit failed for start_ip");
  });
});
