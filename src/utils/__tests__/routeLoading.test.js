import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isRouteLoading,
  resetRouteLoading,
  subscribeToRouteLoading,
  trackRouteLoad,
} from "../routeLoading";

describe("routeLoading", () => {
  beforeEach(() => resetRouteLoading());

  it("reports a load from the moment it starts until it settles", async () => {
    let resolve;
    const promise = trackRouteLoad(new Promise((r) => { resolve = r; }));

    expect(isRouteLoading()).toBe(true);
    resolve();
    await promise;
    expect(isRouteLoading()).toBe(false);
  });

  it("stays loading until the last of several loads settles", async () => {
    let first;
    let second;
    const a = trackRouteLoad(new Promise((r) => { first = r; }));
    const b = trackRouteLoad(new Promise((r) => { second = r; }));

    first();
    await a;
    expect(isRouteLoading()).toBe(true);

    second();
    await b;
    expect(isRouteLoading()).toBe(false);
  });

  // A chunk that 404s reloads the document, but the indicator must not be
  // left up by a rejection that nobody caught here.
  it("stops reporting a load that failed", async () => {
    const failed = trackRouteLoad(Promise.reject(new Error("gone")));

    await expect(failed).rejects.toThrow("gone");
    expect(isRouteLoading()).toBe(false);
  });

  it("tells subscribers on both edges, and stops after unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRouteLoading(listener);

    await trackRouteLoad(Promise.resolve());
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await trackRouteLoad(Promise.resolve());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
