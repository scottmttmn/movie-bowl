import { describe, expect, it, vi } from "vitest";
import { getBrowserTimeZone } from "../getBrowserTimeZone";

describe("getBrowserTimeZone", () => {
  it("returns the browser's IANA timezone", () => {
    const dateTimeFormat = vi.fn(() => ({
      resolvedOptions: () => ({ timeZone: "America/Chicago" }),
    }));

    expect(getBrowserTimeZone(dateTimeFormat)).toBe("America/Chicago");
  });

  it("falls back to UTC when the browser omits a timezone", () => {
    const dateTimeFormat = vi.fn(() => ({
      resolvedOptions: () => ({ timeZone: "" }),
    }));

    expect(getBrowserTimeZone(dateTimeFormat)).toBe("UTC");
  });

  it("falls back to UTC when timezone detection fails", () => {
    const dateTimeFormat = vi.fn(() => {
      throw new Error("Intl unavailable");
    });

    expect(getBrowserTimeZone(dateTimeFormat)).toBe("UTC");
  });
});
