import { useCallback, useMemo, useState } from "react";
import {
  clearDeviceSettingsOverrides,
  mergeDeviceDrawSettings,
  NO_SURFACE_DEFAULTS,
  readDeviceSettingsOverrides,
  writeDeviceSettingsOverrides,
} from "../utils/deviceDrawSettings";

/**
 * The account's draw settings as this device sees them.
 *
 * Account settings are the person's usual preferences and follow them
 * everywhere. What this hook adds is the device's own opinions, which stay on
 * the device: anyone in the room can pick up the remote, so relaxing a filter
 * for tonight must not rewrite what the account owner browses with tomorrow.
 *
 * `surfaceDefaults` must keep a stable identity across renders -- pass a
 * module-level constant, not an object literal -- or the merge re-runs every
 * render. Omitting it inherits the account unchanged, which is what the
 * television wants.
 */
export default function useDeviceDrawSettings(
  userId,
  accountSettings,
  surfaceDefaults = NO_SURFACE_DEFAULTS
) {
  // The overrides are stored with the account they were read for, because the
  // account can arrive after the first render: the dashboard resolves it from
  // the session asynchronously, while the television mounts inside an auth gate
  // and has it immediately. Keeping the empty answer taken before anyone was
  // signed in would mean a device's saved settings never loaded at all.
  const [stored, setStored] = useState(() => ({
    userId,
    overrides: readDeviceSettingsOverrides(userId),
  }));
  // A write that storage refuses still applies for this session; saying so is
  // the difference between a setting that did not stick and one that looks
  // broken.
  const [isPersisted, setIsPersisted] = useState(true);

  // Adjusting state during render rather than in an effect, which is React's
  // own answer for state derived from changing props. An effect would paint one
  // frame of the wrong answer first -- for a switch, a ticket that reads Off
  // and then flips to On by itself.
  if (stored.userId !== userId) {
    setStored({ userId, overrides: readDeviceSettingsOverrides(userId) });
    setIsPersisted(true);
  }

  const overrides = stored.overrides;

  const settings = useMemo(
    () => mergeDeviceDrawSettings(accountSettings, overrides, surfaceDefaults),
    [accountSettings, overrides, surfaceDefaults]
  );

  const setOverride = useCallback(
    (name, value) => {
      setStored((current) => {
        const next = { ...current.overrides, [name]: value };
        setIsPersisted(writeDeviceSettingsOverrides(userId, next));
        return { ...current, overrides: next };
      });
    },
    [userId]
  );

  // Streaming priority is two booleans behind one control, so both move
  // together or the surface briefly holds a state the control cannot show.
  const setOverrides = useCallback(
    (patch) => {
      setStored((current) => {
        const next = { ...current.overrides, ...patch };
        setIsPersisted(writeDeviceSettingsOverrides(userId, next));
        return { ...current, overrides: next };
      });
    },
    [userId]
  );

  const clearOverrides = useCallback(() => {
    setIsPersisted(clearDeviceSettingsOverrides(userId));
    setStored((current) => ({ ...current, overrides: {} }));
  }, [userId]);

  return {
    settings,
    overriddenSettings: overrides,
    hasOverrides: Object.keys(overrides).length > 0,
    isPersisted,
    setOverride,
    setOverrides,
    clearOverrides,
  };
}
