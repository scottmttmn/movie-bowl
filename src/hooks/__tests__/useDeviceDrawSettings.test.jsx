import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import useDeviceDrawSettings from "../useDeviceDrawSettings";
import { WEB_SURFACE_DEFAULTS } from "../../utils/deviceDrawSettings";

const ACCOUNT = Object.freeze({ theaterModeEnabled: true, prioritizeStreaming: true });

function Probe({ userId, accountSettings = ACCOUNT, surfaceDefaults, onRender }) {
  onRender(useDeviceDrawSettings(userId, accountSettings, surfaceDefaults));
  return null;
}

function renderHook(props) {
  const seen = { current: null };
  const view = render(<Probe {...props} onRender={(value) => { seen.current = value; }} />);
  return { seen, view };
}

describe("useDeviceDrawSettings", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  // The dashboard resolves the signed-in account from the session after its
  // first render, unlike the television, which mounts inside an auth gate. Read
  // once at mount and this device's saved settings would never load at all.
  it("re-reads the store when the account arrives after the first render", () => {
    window.localStorage.setItem(
      "movie-bowl:tv:draw-settings:u1",
      JSON.stringify({ theaterModeEnabled: true })
    );

    const { seen, view } = renderHook({ userId: null, surfaceDefaults: WEB_SURFACE_DEFAULTS });
    expect(seen.current.settings.theaterModeEnabled).toBe(false);

    view.rerender(
      <Probe
        userId="u1"
        surfaceDefaults={WEB_SURFACE_DEFAULTS}
        onRender={(value) => { seen.current = value; }}
      />
    );

    expect(seen.current.settings.theaterModeEnabled).toBe(true);
  });

  it("drops one account's overrides when a different account signs in", () => {
    window.localStorage.setItem(
      "movie-bowl:tv:draw-settings:u1",
      JSON.stringify({ theaterModeEnabled: true })
    );

    const { seen, view } = renderHook({ userId: "u1", surfaceDefaults: WEB_SURFACE_DEFAULTS });
    expect(seen.current.settings.theaterModeEnabled).toBe(true);

    view.rerender(
      <Probe
        userId="u2"
        surfaceDefaults={WEB_SURFACE_DEFAULTS}
        onRender={(value) => { seen.current = value; }}
      />
    );

    expect(seen.current.settings.theaterModeEnabled).toBe(false);
  });

  // Omitting surfaceDefaults is what the television does, and it must keep
  // inheriting the account exactly as it did before this hook was shared.
  it("inherits the account untouched when no surface defaults are given", () => {
    const { seen } = renderHook({ userId: "u1" });

    expect(seen.current.settings.theaterModeEnabled).toBe(true);
  });

  it("writes an override to this device without disturbing the account object", () => {
    const { seen } = renderHook({ userId: "u1", surfaceDefaults: WEB_SURFACE_DEFAULTS });

    act(() => seen.current.setOverride("theaterModeEnabled", true));

    expect(seen.current.settings.theaterModeEnabled).toBe(true);
    expect(seen.current.isPersisted).toBe(true);
    expect(ACCOUNT.theaterModeEnabled).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem("movie-bowl:tv:draw-settings:u1"))
    ).toEqual({ theaterModeEnabled: true });
  });
});
