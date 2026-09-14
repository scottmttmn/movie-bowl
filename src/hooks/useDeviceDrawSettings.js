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
  const [overrides, setOverrides_] = useState(() => readDeviceSettingsOverrides(userId));
  // A write that storage refuses still applies for this session; saying so is
  // the difference between a setting that did not stick and one that looks
  // broken.
  const [isPersisted, setIsPersisted] = useState(true);

  const settings = useMemo(
    () => mergeDeviceDrawSettings(accountSettings, overrides, surfaceDefaults),
    [accountSettings, overrides, surfaceDefaults]
  );

  const setOverride = useCallback(
    (name, value) => {
      setOverrides_((current) => {
        const next = { ...current, [name]: value };
        setIsPersisted(writeDeviceSettingsOverrides(userId, next));
        return next;
      });
    },
    [userId]
  );

  // Streaming priority is two booleans behind one control, so both move
  // together or the surface briefly holds a state the control cannot show.
  const setOverrides = useCallback(
    (patch) => {
      setOverrides_((current) => {
        const next = { ...current, ...patch };
        setIsPersisted(writeDeviceSettingsOverrides(userId, next));
        return next;
      });
    },
    [userId]
  );

  const clearOverrides = useCallback(() => {
    setIsPersisted(clearDeviceSettingsOverrides(userId));
    setOverrides_({});
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
