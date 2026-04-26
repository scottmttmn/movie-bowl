import { describe, expect, it } from "vitest";

import { formatRelativeDateLabel } from "../formatRelativeDate";

describe("formatRelativeDateLabel", () => {
  it("returns today for same-day values", () => {
    expect(formatRelativeDateLabel("2026-04-25T10:30:00.000Z", new Date("2026-04-25T18:00:00.000Z"))).toBe(
      "Today"
    );
  });

  it("returns yesterday for prior-day values", () => {
    expect(formatRelativeDateLabel("2026-04-24T23:00:00.000Z", new Date("2026-04-25T18:00:00.000Z"))).toBe(
      "Yesterday"
    );
  });

  it("falls back to a formatted date for older values", () => {
    const label = formatRelativeDateLabel("2026-04-20T12:00:00.000Z", new Date("2026-04-25T18:00:00.000Z"));
    expect(label).toMatch(/2026/);
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
  });

  it("returns null for invalid values", () => {
    expect(formatRelativeDateLabel("not-a-date")).toBeNull();
  });
});
