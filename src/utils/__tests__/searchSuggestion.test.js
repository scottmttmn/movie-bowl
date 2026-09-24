import { describe, expect, it, vi } from "vitest";
import { editDistance, suggestCorrection } from "../searchSuggestion";
import { queryMatchesName } from "../peopleMatch";

// Stands in for TMDB: a candidate finds the catalogue entries its words start.
const catalogue = (...entries) => vi.fn(async (candidate) => entries
  .map(([text, popularity = 1]) => ({ text, popularity }))
  .filter((entry) => queryMatchesName(candidate, entry.text)));

describe("editDistance", () => {
  it("counts insertions, deletions, substitutions, and a swapped pair as one", () => {
    expect(editDistance("scorcese", "scorsese")).toBe(1);
    expect(editDistance("scorcese", "scorched")).toBe(3);
    expect(editDistance("aronofksy", "aronofsky")).toBe(1);
    expect(editDistance("heat", "heat")).toBe(0);
  });
});

describe("suggestCorrection", () => {
  it("suggests the word closest to what was typed, not the longest trim that finds anything", async () => {
    // "scorc" finds Scorched and Scorcher; only "scor" finds Scorsese, and he
    // is one letter from what was typed.
    const probe = catalogue(["Scorched", 30], ["The Scorcher", 5], ["Martin Scorsese", 12], ["The Scorpion King", 40]);
    await expect(suggestCorrection("scorcese", probe)).resolves.toBe("scorsese");
  });

  it("keeps the earlier words as typed", async () => {
    const probe = catalogue(["Martin Scorsese", 12], ["Martin Short", 8]);
    await expect(suggestCorrection("martin scorcese", probe)).resolves.toBe("martin scorsese");
  });

  it("asks every trim at once, and no more than five", async () => {
    const probe = catalogue(["Arnold Schwarzenegger", 20]);
    await expect(suggestCorrection("schwarzeneger", probe)).resolves.toBe("schwarzenegger");
    expect(probe.mock.calls.map(([candidate]) => candidate)).toEqual([
      "schwarzenege", "schwarzeneg", "schwarzene", "schwarzen", "schwarze",
    ]);
  });

  it("suggests nothing when the nearest word is too far from what was typed", async () => {
    await expect(suggestCorrection("scorcese", catalogue(["Scorched", 30]))).resolves.toBeNull();
    // A slip in the first letters leaves no trim that finds the name at all.
    await expect(suggestCorrection("scrosese", catalogue(["Martin Scorsese", 12]))).resolves.toBeNull();
  });

  it("prefers the more popular of two equally close words", async () => {
    const probe = catalogue(["Heath", 3], ["Heats", 20]);
    await expect(suggestCorrection("heatz", probe)).resolves.toBe("heats");
  });

  it("never trims a word below three letters, and leaves a blank query alone", async () => {
    const probe = vi.fn(async () => []);
    await expect(suggestCorrection("abc", probe)).resolves.toBeNull();
    expect(probe).not.toHaveBeenCalled();
    await expect(suggestCorrection("   ", probe)).resolves.toBeNull();
  });
});
