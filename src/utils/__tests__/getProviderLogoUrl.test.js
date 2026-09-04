import { describe, expect, it } from "vitest";
import { getProviderLogoUrl } from "../getProviderLogoUrl";

describe("getProviderLogoUrl", () => {
  it("points at TMDB's own image CDN rather than anything this app hosts", () => {
    expect(getProviderLogoUrl("/max.jpg")).toBe("https://image.tmdb.org/t/p/w45/max.jpg");
  });

  it("takes a size, because a television is not a phone", () => {
    expect(getProviderLogoUrl("/max.jpg", "w92")).toBe("https://image.tmdb.org/t/p/w92/max.jpg");
  });

  // Callers render the service name instead, which is what they rendered before
  // logos existed.
  it("returns nothing for a provider with no art", () => {
    expect(getProviderLogoUrl(null)).toBeNull();
    expect(getProviderLogoUrl(undefined)).toBeNull();
    expect(getProviderLogoUrl("")).toBeNull();
  });
});
