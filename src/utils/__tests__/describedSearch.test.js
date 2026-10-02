import { describe, expect, it } from "vitest";
import { shouldDescribe } from "../describedSearch";

describe("shouldDescribe", () => {
  it("leaves titles and short searches to title search", () => {
    expect(shouldDescribe("the martian", [])).toBe(false);
    expect(shouldDescribe("the martian movie", [{ title: "The Martian Movie Night" }])).toBe(false);
    expect(shouldDescribe("eternal sunshine of the spotless mind", [{ title: "Eternal Sunshine of the Spotless Mind" }])).toBe(false);
    expect(shouldDescribe("le fabuleux destin", [{ title: "Amélie", original_title: "Le Fabuleux Destin d'Amélie Poulain" }])).toBe(false);
  });

  it("sends a several-word search that no title spells", () => {
    expect(shouldDescribe("space movie where matt damon is stranded", [])).toBe(true);
    expect(shouldDescribe("space movie where matt damon is stranded", [{ title: "Stranded" }])).toBe(true);
  });
});
