import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPageUnloading, resetPageLifecycleForTests } from "../pageLifecycle";

describe("page lifecycle", () => {
  beforeEach(() => resetPageLifecycleForTests());
  afterEach(() => resetPageLifecycleForTests());

  it("reports a live document as staying", () => {
    expect(isPageUnloading()).toBe(false);
  });

  it("latches once the document is going away", () => {
    window.dispatchEvent(new Event("pagehide"));
    expect(isPageUnloading()).toBe(true);
  });

  // A restored document is the same page again, and a failure from here is one
  // somebody is present to see.
  it("clears when a document comes back from the bfcache", () => {
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
    expect(isPageUnloading()).toBe(false);
  });

  // The reason visibilitychange is not the signal: a backgrounded tab is still
  // there, and latching on it would silence every later failure in that tab.
  it("ignores a tab switch", () => {
    document.dispatchEvent(new Event("visibilitychange"));
    expect(isPageUnloading()).toBe(false);
  });

  // The reason beforeunload is not the signal: useAutosave calls preventDefault
  // on it, so a page with unsaved work can fire it and then stay.
  it("ignores a navigation that has only been proposed", () => {
    window.dispatchEvent(new Event("beforeunload"));
    expect(isPageUnloading()).toBe(false);
  });
});
