import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_BUILD_ID,
  fetchDeployedBuildId,
  isNewBuildId,
  isStaleChunkError,
  recoverFromStaleChunkError,
  reloadForNewBuild,
} from "../appVersion";

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set("movie-bowl:build-reload", initialValue);

  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
}

function setOnLine(value) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDeployedBuildId", () => {
  it("reads the id the CDN is serving without using the cache", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "deployed-sha" }),
    }));

    await expect(fetchDeployedBuildId(fetchImpl)).resolves.toBe("deployed-sha");

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(options.cache).toBe("no-store");
  });

  it("reports 'cannot tell' rather than a false answer when the manifest is missing", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }));

    await expect(fetchDeployedBuildId(fetchImpl)).resolves.toBe("");
  });

  it("swallows a failed request so an offline check never breaks the app", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(fetchDeployedBuildId(fetchImpl)).resolves.toBe("");
  });

  it("ignores a manifest without a usable id", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

    await expect(fetchDeployedBuildId(fetchImpl)).resolves.toBe("");
  });
});

describe("isNewBuildId", () => {
  it("flags a deployed id that differs from the running one", () => {
    expect(isNewBuildId("new-sha", "old-sha")).toBe(true);
  });

  it("treats a matching id as current", () => {
    expect(isNewBuildId("same-sha", "same-sha")).toBe(false);
  });

  it("never treats an unknown id as an update", () => {
    expect(isNewBuildId("", "old-sha")).toBe(false);
    expect(isNewBuildId("new-sha", "")).toBe(false);
  });

  it("compares against the running build by default", () => {
    expect(isNewBuildId(APP_BUILD_ID)).toBe(false);
    expect(isNewBuildId(`${APP_BUILD_ID}-next`)).toBe(true);
  });
});

describe("isStaleChunkError", () => {
  it.each([
    "Failed to fetch dynamically imported module: /assets/BowlDashboard-a1b2c3.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/index-a1b2c3.css",
  ])("recognizes %s", (message) => {
    setOnLine(true);
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it("leaves an offline failure to the offline banner", () => {
    setOnLine(false);
    expect(
      isStaleChunkError(new Error("Failed to fetch dynamically imported module"))
    ).toBe(false);
  });

  it("does not claim an ordinary render error is a stale chunk", () => {
    setOnLine(true);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(
      false
    );
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("reloadForNewBuild", () => {
  it("reloads and records the attempt", () => {
    const storage = createStorage();
    const reload = vi.fn();

    expect(reloadForNewBuild({ storage, reload, now: 1000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith("movie-bowl:build-reload", "1000");
  });

  it("refuses a second reload inside the guard window so it cannot loop", () => {
    const storage = createStorage("1000");
    const reload = vi.fn();

    expect(reloadForNewBuild({ storage, reload, now: 30000 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("allows another reload once the window has passed", () => {
    const storage = createStorage("1000");
    const reload = vi.fn();

    expect(reloadForNewBuild({ storage, reload, now: 1000 + 60000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers when the clock moved backwards past a recorded attempt", () => {
    const storage = createStorage("9999999");
    const reload = vi.fn();

    expect(reloadForNewBuild({ storage, reload, now: 1000 })).toBe(true);
  });

  it("stays put when there is no storage to guard against a loop", () => {
    const reload = vi.fn();

    expect(reloadForNewBuild({ storage: null, reload, now: 1000 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("stays put when storage throws", () => {
    const reload = vi.fn();
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: vi.fn(),
    };

    expect(reloadForNewBuild({ storage, reload, now: 1000 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("recoverFromStaleChunkError", () => {
  it("reloads for a chunk the deploy moved", () => {
    setOnLine(true);
    const reload = vi.fn();

    expect(
      recoverFromStaleChunkError(
        new Error("Failed to fetch dynamically imported module"),
        { storage: createStorage(), reload, now: 1000 }
      )
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves an unrelated error alone", () => {
    setOnLine(true);
    const reload = vi.fn();

    expect(
      recoverFromStaleChunkError(new Error("boom"), {
        storage: createStorage(),
        reload,
        now: 1000,
      })
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
