import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTitleDepartures, normalizeTitleDepartures } from "../_lib/titleDepartures.js";

const now = Date.parse("2026-10-19T12:00:00Z");
const expiresOn = Math.floor(now / 1000) + 86400;
const option = (extra = {}) => ({
  service: { id: "netflix", name: "Netflix" },
  type: "subscription",
  expiresSoon: true,
  expiresOn,
  ...extra,
});
const show = (options) => ({
  tmdbId: "movie/77",
  showType: "movie",
  streamingOptions: { us: options },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Movie of the Night departures", () => {
  it("keeps exact dates and unknown dates, and ignores other countries", () => {
    expect(normalizeTitleDepartures(show([option()]), 77, now)).toEqual([
      { service: "Netflix", expiresOn: "2026-10-20T12:00:00.000Z" },
    ]);
    expect(normalizeTitleDepartures(show([option({ expiresOn: undefined })]), 77, now)).toEqual([
      { service: "Netflix", expiresOn: null },
    ]);
    expect(
      normalizeTitleDepartures({ ...show([]), streamingOptions: { gb: [option()] } }, 77, now),
    ).toEqual([]);
  });

  it("excludes rentals, purchases, channels, unsupported services, past dates and distant dates", () => {
    const options = [
      option({ type: "rent" }),
      option({ type: "buy" }),
      option({ type: "addon" }),
      option({ addon: { id: "netflix" } }),
      option({ service: { id: "other", name: "Netflix" } }),
      option({ expiresOn: now / 1000 - 1 }),
      option({ expiresOn: now / 1000 + 40 * 86400 }),
    ];
    for (const candidate of options)
      expect(normalizeTitleDepartures(show([candidate]), 77, now)).toEqual([]);
  });

  it("uses the documented Pluto TV ID and excludes unsupported US catalogs", () => {
    expect(
      normalizeTitleDepartures(
        show([option({ service: { id: "plutotv", name: "Pluto TV" }, type: "free" })]),
        77,
        now,
      ),
    ).toEqual([{ service: "Pluto TV", expiresOn: "2026-10-20T12:00:00.000Z" }]);
    for (const service of [
      { id: "pluto", name: "Pluto TV" },
      { id: "kanopy", name: "Kanopy" },
      { id: "showtime", name: "Showtime" },
    ]) {
      expect(normalizeTitleDepartures(show([option({ service })]), 77, now)).toEqual([]);
    }
  });

  it("does not claim a service departure if another included option remains", () => {
    expect(
      normalizeTitleDepartures(
        show([option(), option({ expiresSoon: false, expiresOn: undefined })]),
        77,
        now,
      ),
    ).toEqual([]);
    expect(
      normalizeTitleDepartures(
        show([option(), option({ expiresOn: expiresOn + 86400 })]),
        77,
        now,
      )[0].expiresOn,
    ).toBe("2026-10-21T12:00:00.000Z");
  });

  it("rejects a mismatched title or malformed payload instead of caching no departures", () => {
    expect(() => normalizeTitleDepartures(show([]), 78, now)).toThrow();
    expect(() => normalizeTitleDepartures({ ...show([]), showType: "series" }, 77, now)).toThrow();
    expect(() =>
      normalizeTitleDepartures({ ...show([]), streamingOptions: { us: {} } }, 77, now),
    ).toThrow();
  });

  it("uses the direct v4 title endpoint with a header credential, timeout and no redirects", async () => {
    vi.stubEnv("MOVIE_OF_THE_NIGHT_API_KEY", "test-private-key");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => show([]) });
    vi.stubGlobal("fetch", fetcher);
    await fetchTitleDepartures(77);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.movieofthenight.com/v4/shows/movie%2F77?country=us",
      expect.objectContaining({
        headers: { "X-API-Key": "test-private-key" },
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    fetcher.mockResolvedValue({ ok: false, status: 404 });
    expect(await fetchTitleDepartures(77)).toEqual([]);
    fetcher.mockResolvedValue({ ok: false, status: 429 });
    await expect(fetchTitleDepartures(77)).rejects.toThrow("Departure lookup failed");
  });
});
