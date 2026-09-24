import { describe, expect, it, vi } from "vitest";
import { suggestTrimmedQuery } from "../searchSuggestion";
import { queryMatchesName } from "../peopleMatch";

// Stands in for TMDB: a candidate matches when it starts the words of a name.
const matchesAny = (...names) => vi.fn(async (candidate) => names.some((name) => queryMatchesName(candidate, name)));

describe("suggestTrimmedQuery", () => {
  it("trims a misspelled last word back to the longest part that matches", async () => {
    const hasMatches = matchesAny("Martin Scorsese");
    await expect(suggestTrimmedQuery("martin scorcese", hasMatches)).resolves.toBe("martin scor");
    // Never the query as typed: that already found nothing.
    expect(hasMatches).not.toHaveBeenCalledWith("martin scorcese");
  });

  it("bisects rather than trying every length", async () => {
    const hasMatches = matchesAny("Arnold Schwarzenegger");
    await expect(suggestTrimmedQuery("schwarzeneger", hasMatches)).resolves.toBe("schwarzeneg");
    expect(hasMatches.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("suggests nothing when no trim of the last word matches", async () => {
    await expect(suggestTrimmedQuery("scrosese", matchesAny("Martin Scorsese"))).resolves.toBeNull();
  });

  it("never trims a word below three letters", async () => {
    const hasMatches = vi.fn(async () => true);
    await expect(suggestTrimmedQuery("abcd", hasMatches)).resolves.toBe("abc");
    expect(hasMatches).toHaveBeenCalledWith("abc");
    expect(hasMatches).not.toHaveBeenCalledWith("ab");
    await expect(suggestTrimmedQuery("abc", hasMatches)).resolves.toBeNull();
  });

  it("suggests nothing for a blank query", async () => {
    const hasMatches = vi.fn();
    await expect(suggestTrimmedQuery("   ", hasMatches)).resolves.toBeNull();
    expect(hasMatches).not.toHaveBeenCalled();
  });
});
