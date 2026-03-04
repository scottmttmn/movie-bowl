import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rokuMocks = vi.hoisted(() => ({
  discoverRokuDevices: vi.fn(),
  getRokuDeviceInfo: vi.fn(),
  openSearchForTitle: vi.fn(),
  getInstalledRokuApps: vi.fn(),
  resolvePreferredStreamingLaunch: vi.fn(),
  launchRokuApp: vi.fn(),
}));

vi.mock("../_lib/roku.js", () => ({
  discoverRokuDevices: rokuMocks.discoverRokuDevices,
  getRokuDeviceInfo: rokuMocks.getRokuDeviceInfo,
  openSearchForTitle: rokuMocks.openSearchForTitle,
  getInstalledRokuApps: rokuMocks.getInstalledRokuApps,
  resolvePreferredStreamingLaunch: rokuMocks.resolvePreferredStreamingLaunch,
  launchRokuApp: rokuMocks.launchRokuApp,
}));

import discoverHandler from "../roku/discover.js";
import launchAppHandler from "../roku/launch-app.js";
import searchHandler from "../roku/search.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("roku api routes", () => {
  beforeEach(() => {
    rokuMocks.discoverRokuDevices.mockReset();
    rokuMocks.getRokuDeviceInfo.mockReset();
    rokuMocks.openSearchForTitle.mockReset();
    rokuMocks.getInstalledRokuApps.mockReset();
    rokuMocks.resolvePreferredStreamingLaunch.mockReset();
    rokuMocks.launchRokuApp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns discovered devices", async () => {
    rokuMocks.discoverRokuDevices.mockResolvedValue([
      { id: "roku-1", name: "Living Room", ip: "192.168.1.20", port: 8060, model: "Roku Ultra" },
    ]);

    const res = createRes();
    await discoverHandler({ method: "GET", query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        devices: [expect.objectContaining({ name: "Living Room" })],
        source: "discovery",
      })
    );
  });

  it("validates a manual roku ip", async () => {
    rokuMocks.getRokuDeviceInfo.mockResolvedValue({
      id: "roku-2",
      name: "Bedroom",
      ip: "192.168.1.30",
      port: 8060,
      model: "Roku Express",
    });

    const res = createRes();
    await discoverHandler({ method: "GET", query: { ip: "192.168.1.30" } }, res);

    expect(rokuMocks.getRokuDeviceInfo).toHaveBeenCalledWith("192.168.1.30");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        devices: [expect.objectContaining({ ip: "192.168.1.30" })],
        source: "manual",
      })
    );
  });

  it("returns setup guidance when discovery is empty", async () => {
    rokuMocks.discoverRokuDevices.mockResolvedValue([]);

    const res = createRes();
    await discoverHandler({ method: "GET", query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.devices).toEqual([]);
    expect(res.body.setupSteps.length).toBeGreaterThan(0);
  });

  it("rejects missing rokuIp in search requests", async () => {
    const res = createRes();
    await searchHandler({ method: "POST", body: { title: "Inception" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing required field: rokuIp" });
  });

  it("rejects missing title in search requests", async () => {
    const res = createRes();
    await searchHandler({ method: "POST", body: { rokuIp: "192.168.1.20" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing required field: title" });
  });

  it("returns successful search responses", async () => {
    rokuMocks.openSearchForTitle.mockResolvedValue({
      ok: true,
      action: "opened-search",
      message: 'Opened Roku search for "Inception".',
      details: ["Used Roku search deep link."],
    });

    const res = createRes();
    await searchHandler({ method: "POST", body: { rokuIp: "192.168.1.20", title: "Inception" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        action: "opened-search",
      })
    );
  });

  it("returns fallback search responses without throwing", async () => {
    rokuMocks.openSearchForTitle.mockResolvedValue({
      ok: true,
      action: "opened-search-fallback",
      message: "Opened Roku search, but text entry fell back.",
      details: ["The Roku search screen should now be open."],
    });

    const res = createRes();
    await searchHandler({ method: "POST", body: { rokuIp: "192.168.1.20", title: "Dune" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.action).toBe("opened-search-fallback");
  });

  it("returns a gateway error when the Roku cannot be reached", async () => {
    rokuMocks.openSearchForTitle.mockResolvedValue({
      ok: false,
      action: "failed",
      message: "Could not reach that Roku on your local network.",
      details: ["Check the Roku IP."],
    });

    const res = createRes();
    await searchHandler({ method: "POST", body: { rokuIp: "192.168.1.50", title: "Arrival" } }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.action).toBe("failed");
  });

  it("can launch the preferred installed app", async () => {
    rokuMocks.getInstalledRokuApps.mockResolvedValue([{ id: "12", name: "Max" }]);
    rokuMocks.resolvePreferredStreamingLaunch.mockReturnValue({
      serviceName: "Max",
      appId: "12",
      appName: "Max",
    });
    rokuMocks.launchRokuApp.mockResolvedValue({
      ok: true,
      action: "launched-app",
      message: "Opened Max on Roku.",
      details: ['Used installed Roku app "Max" (12).'],
      serviceName: "Max",
      appName: "Max",
    });

    const res = createRes();
    await launchAppHandler({
      method: "POST",
      body: {
        rokuIp: "192.168.1.20",
        userServices: ["Max", "Netflix"],
        movieProviders: ["Netflix", "Max"],
      },
    }, res);

    expect(rokuMocks.resolvePreferredStreamingLaunch).toHaveBeenCalledWith({
      userServices: ["Max", "Netflix"],
      movieProviders: ["Netflix", "Max"],
      installedApps: [{ id: "12", name: "Max" }],
    });
    expect(rokuMocks.launchRokuApp).toHaveBeenCalledWith({
      rokuIp: "192.168.1.20",
      appId: "12",
      appName: "Max",
      serviceName: "Max",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.action).toBe("launched-app");
  });

  it("returns no-match when no preferred installed app exists", async () => {
    rokuMocks.getInstalledRokuApps.mockResolvedValue([{ id: "20", name: "Hulu" }]);
    rokuMocks.resolvePreferredStreamingLaunch.mockReturnValue(null);

    const res = createRes();
    await launchAppHandler({
      method: "POST",
      body: {
        rokuIp: "192.168.1.20",
        userServices: ["Max", "Netflix"],
        movieProviders: ["Max"],
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.action).toBe("no-match");
  });
});
