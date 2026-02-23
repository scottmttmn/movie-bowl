import { describe, expect, it } from "vitest";
import { parseInviteEmails } from "../parseInviteEmails";

describe("parseInviteEmails", () => {
  it("parses comma and newline separated emails", () => {
    const result = parseInviteEmails("a@example.com, b@example.com\nc@example.com");
    expect(result.validEmails).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    expect(result.invalidEmails).toEqual([]);
  });

  it("normalizes case and removes duplicates", () => {
    const result = parseInviteEmails("A@Example.com, a@example.com");
    expect(result.validEmails).toEqual(["a@example.com"]);
    expect(result.invalidEmails).toEqual([]);
  });

  it("returns invalid emails separately", () => {
    const result = parseInviteEmails("valid@example.com,not-an-email");
    expect(result.validEmails).toEqual(["valid@example.com"]);
    expect(result.invalidEmails).toEqual(["not-an-email"]);
  });
});

