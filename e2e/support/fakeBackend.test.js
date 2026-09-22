import { describe, expect, it } from "vitest";
import {
  classifyRequest,
  E2E_APP_ORIGIN,
  E2E_SUPABASE_ORIGIN,
  TMDB_IMAGE_ORIGIN,
} from "./fakeBackend.js";

function classify(href) {
  return classifyRequest(new URL(href));
}

describe("fake backend request boundary", () => {
  it("sends Supabase and app API calls to their handlers", () => {
    expect(classify(`${E2E_SUPABASE_ORIGIN}/rest/v1/bowls`)).toBe("supabase");
    expect(classify(`${E2E_SUPABASE_ORIGIN}/rpc/get_my_bowl_context`)).toBe("supabase");
    expect(classify(`${E2E_APP_ORIGIN}/api/tmdb/search`)).toBe("appApi");
  });

  it("serves posters rather than reaching the real CDN", () => {
    expect(classify(`${TMDB_IMAGE_ORIGIN}/t/p/w500/abc.jpg`)).toBe("posterImage");
  });

  it("lets the app serve itself", () => {
    expect(classify(`${E2E_APP_ORIGIN}/bowls`)).toBe("internal");
    expect(classify(`${E2E_APP_ORIGIN}/assets/index-abc123.js`)).toBe("internal");
    // Not a network request, so there is nothing for the fake to stand in for.
    expect(classify("data:image/svg+xml,<svg/>")).toBe("internal");
  });

  // The point of the boundary: a request that would leave the machine is named
  // rather than quietly forwarded, so the fixture's existing assertion can see
  // it. Reaching a real host makes the suite depend on that host being up.
  it("refuses any other host instead of letting it out", () => {
    expect(classify("https://api.themoviedb.org/3/movie/550")).toBe("external");
    expect(classify("https://fonts.googleapis.com/css2?family=Inter")).toBe("external");
    expect(classify("https://api.watchmode.com/v1/title/1/details")).toBe("external");
  });
});
