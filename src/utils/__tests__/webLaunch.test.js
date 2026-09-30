import { describe, expect, it } from "vitest";
import {
  AUTO_START_SURFACE,
  getAutoStartMode,
  getAutoStartSurface,
  resolvePreferredLaunchTarget,
  resolvePreferredWebLaunchCandidate,
  resolveRentTarget,
} from "../webLaunch";
import { isTvAppRentalLink } from "../rentalStores";

describe("resolvePreferredWebLaunchCandidate", () => {
  it("picks the highest-ranked matching provider with a known web mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix", "Hulu"],
      movieProviders: ["Hulu", "Netflix"],
      title: "Dune",
    });

    expect(result).toEqual({
      serviceName: "Netflix",
      url: "https://www.netflix.com/search?q=Dune",
    });
  });

  it("falls back to the next ranked matching service when top one has no mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI", "Hulu"],
      movieProviders: ["MUBI", "Hulu"],
      title: "Parasite",
    });

    expect(result).toEqual({
      serviceName: "Hulu",
      url: "https://www.hulu.com/search?q=Parasite",
    });
  });

  it("sends Max a title-only search query", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Max"],
      movieProviders: ["Max"],
      title: "The Batman",
    });

    expect(result).toEqual({
      serviceName: "Max",
      url: "https://play.max.com/search?q=The%20Batman",
    });
  });

  it("returns null when no mapped provider match exists", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI"],
      movieProviders: ["MUBI"],
      title: "The Fall",
    });

    expect(result).toBeNull();
  });

  it("returns null when title is missing", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix"],
      movieProviders: ["Netflix"],
      title: "",
    });

    expect(result).toBeNull();
  });
});

describe("resolvePreferredLaunchTarget", () => {
  const options = { userServices: ["Netflix", "Hulu"], movieProviders: ["Hulu", "Netflix"], title: "Arrival" };
  const netflix = { service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123", androidUrl: "nflx://title/123" };
  it("prefers a title URL and carries optional native destinations", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [netflix] })).toEqual({
      serviceName: "Netflix", url: netflix.webUrl, linkType: "title", deepLinks: { ios: null, android: netflix.androidUrl },
    });
  });
  it.each(["rent", "buy", "tve"])("does not launch a %s source or switch service priority", (type) => {
    const result = resolvePreferredLaunchTarget({ ...options, providerLinks: [
      { ...netflix, type }, { service: "Hulu", type: "sub", webUrl: "https://www.hulu.com/movie/arrival" },
    ] });
    expect(result).toMatchObject({ serviceName: "Netflix", linkType: "search", url: "https://www.netflix.com/search?q=Arrival" });
  });
  it("does not choose a lower-ranked service just because it has a link", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, service: "Hulu" }] })).toMatchObject({ serviceName: "Netflix", linkType: "search" });
  });
  it("allows free sources and normalizes service names", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, service: "netflix", type: "free" }] }).linkType).toBe("title");
  });
  it("preserves the old empty and unknown-service behavior", () => {
    expect(resolvePreferredLaunchTarget(options)).toMatchObject(resolvePreferredWebLaunchCandidate(options));
    expect(resolvePreferredLaunchTarget({ ...options, title: "" })).toBeNull();
    expect(resolvePreferredLaunchTarget({ ...options, movieProviders: ["Unknown"] })).toBeNull();
  });
  it("rejects executable URLs, falling back to the service's search", () => {
    const result = resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, webUrl: "javascript:alert(1)" }] });
    expect(result.linkType).toBe("search");
  });
});

describe("getAutoStartSurface", () => {
  it("recognises the Google TV app by its user agent tag", () => {
    expect(getAutoStartSurface({
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 MovieBowlTV/0.1 AndroidTV",
      hasFinePointer: false,
    })).toBe(AUTO_START_SURFACE.tvApp);
  });

  it("treats a fine primary pointer as a desktop and anything else as touch", () => {
    expect(getAutoStartSurface({ userAgent: "Mozilla/5.0 (Macintosh)", hasFinePointer: true }))
      .toBe(AUTO_START_SURFACE.desktop);
    expect(getAutoStartSurface({ userAgent: "Mozilla/5.0 (iPhone)", hasFinePointer: false }))
      .toBe(AUTO_START_SURFACE.touch);
    expect(getAutoStartSurface()).toBe(AUTO_START_SURFACE.touch);
  });
});

describe("getAutoStartMode", () => {
  const titleLink = { serviceName: "Max", url: "https://play.max.com/movie/abc", linkType: "title" };
  const searchLink = { serviceName: "Max", url: "https://play.max.com/search?q=Dune", linkType: "search" };

  it("opens a window in the TV app and navigates on a desktop", () => {
    expect(getAutoStartMode({ surface: AUTO_START_SURFACE.tvApp, launchCandidate: titleLink })).toBe("window");
    expect(getAutoStartMode({ surface: AUTO_START_SURFACE.desktop, launchCandidate: titleLink })).toBe("navigate");
  });

  it("never auto-starts on touch", () => {
    expect(getAutoStartMode({ surface: AUTO_START_SURFACE.touch, launchCandidate: titleLink })).toBeNull();
  });

  it("never auto-starts a search link or a missing candidate", () => {
    for (const surface of Object.values(AUTO_START_SURFACE)) {
      expect(getAutoStartMode({ surface, launchCandidate: searchLink })).toBeNull();
      expect(getAutoStartMode({ surface, launchCandidate: null })).toBeNull();
      expect(getAutoStartMode({ surface, launchCandidate: { ...titleLink, url: null } })).toBeNull();
    }
  });

  it("stands down once a launch has already failed", () => {
    expect(getAutoStartMode({
      surface: AUTO_START_SURFACE.tvApp,
      launchCandidate: titleLink,
      launchError: "Max isn't installed on this TV.",
    })).toBeNull();
  });
});

describe("resolveRentTarget", () => {
  const links = [
    { service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/1" },
    { service: "Prime Video", type: "buy", webUrl: "https://www.amazon.com/buy/1" },
    // Cached before stores had their own names, an Apple rental reads "Apple TV+".
    { service: "Apple TV+", type: "rent", webUrl: "https://tv.apple.com/movie/1" },
    { service: "Fandango at Home", type: "rent", webUrl: "https://athome.fandango.com/1" },
    { service: "YouTube", type: "rent", webUrl: "javascript:alert(1)" },
  ];

  it("starts with Apple TV when no store was chosen", () => {
    expect(resolveRentTarget({ providerLinks: links })).toEqual({
      storeName: "Apple TV",
      url: "https://tv.apple.com/movie/1",
      linkType: "rent",
    });
  });

  it("prefers the chosen store and otherwise falls back in order", () => {
    expect(resolveRentTarget({ providerLinks: links, rentFrom: "Fandango at Home" })).toMatchObject({
      storeName: "Fandango at Home",
    });
    // A buy link and an unsafe URL are not a rental there.
    expect(resolveRentTarget({ providerLinks: links, rentFrom: "Prime Video" })).toMatchObject({
      storeName: "Apple TV",
    });
    expect(resolveRentTarget({ providerLinks: links, rentFrom: "YouTube" })).toMatchObject({
      storeName: "Apple TV",
    });
  });

  it("offers nothing when rentals are turned off", () => {
    expect(resolveRentTarget({ providerLinks: links, rentFrom: "off", watchUrl: "https://www.themoviedb.org/movie/1/watch", canRent: true })).toBeNull();
  });

  it("falls back to the watch page only when the title can be rented", () => {
    const watchUrl = "https://www.themoviedb.org/movie/1/watch";
    expect(resolveRentTarget({ providerLinks: [], watchUrl, canRent: true })).toEqual({
      storeName: null,
      url: watchUrl,
      linkType: "rent-options",
    });
    expect(resolveRentTarget({ providerLinks: [], watchUrl, canRent: false })).toBeNull();
    expect(resolveRentTarget({ providerLinks: [], watchUrl: null, canRent: true })).toBeNull();
  });

  it("offers no rental unless it is sure none of your services carry the movie", () => {
    const rental = [{ service: "Apple TV", type: "rent", webUrl: "https://tv.apple.com/movie/1" }];
    const base = { providerLinks: rental, userServices: ["Netflix"], movieProviders: ["Max"] };
    expect(resolveRentTarget(base)).toMatchObject({ storeName: "Apple TV" });
    // A failed read came back empty; that is not proof it is on nothing you have.
    expect(resolveRentTarget({ ...base, movieProviders: [], availabilityStatus: "failed" })).toBeNull();
    expect(resolveRentTarget({ ...base, movieProviders: ["Max", "Netflix"] })).toBeNull();
    expect(resolveRentTarget({
      ...base,
      movieProviders: [],
      providerLinks: [...rental, { service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/1" }],
    })).toBeNull();
  });

  it("keeps to the stores the Google TV app can open when asked", () => {
    const tvLinks = [
      { service: "Fandango at Home", type: "rent", webUrl: "https://athome.fandango.com/1" },
      // Filed under Apple TV, but a store page no television app claims.
      { service: "iTunes", type: "rent", webUrl: "https://itunes.apple.com/us/movie/1" },
      { service: "Amazon", type: "rent", webUrl: "https://www.amazon.com/gp/video/detail/1" },
    ];
    expect(resolveRentTarget({
      providerLinks: tvLinks,
      rentFrom: "Fandango at Home",
      acceptLink: isTvAppRentalLink,
    })).toEqual({ storeName: "Prime Video", url: "https://www.amazon.com/gp/video/detail/1", linkType: "rent" });
    expect(resolveRentTarget({ providerLinks: tvLinks.slice(0, 2), acceptLink: isTvAppRentalLink })).toBeNull();
  });

  it("never starts a rental on its own after the pre-roll", () => {
    const target = resolveRentTarget({ providerLinks: links });
    for (const surface of Object.values(AUTO_START_SURFACE)) {
      expect(getAutoStartMode({ surface, launchCandidate: target })).toBeNull();
    }
  });
});
