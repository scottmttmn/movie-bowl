import { useCallback, useMemo, useState } from "react";
import {
  clearTvSettingsOverrides,
  mergeTvDrawSettings,
  readTvSettingsOverrides,
  writeTvSettingsOverrides,
} from "../utils/tvDrawSettings";

/**
 * The account's draw settings as this television sees them.
 *
 * Account settings are the person's usual preferences and follow them
 * everywhere. What this hook adds is the television's own opinions, which stay
 * on the television: anyone in the room can pick up the remote, so relaxing a
 * filter for tonight must not rewrite what the account owner browses with
 * tomorrow.
 */
export default function useTvDrawSettings(userId, accountSettings) {
  const [overrides, setOverrides_] = useState(() => readTvSettingsOverrides(userId));
  // A write that storage refuses still applies for this session; saying so is
  // the difference between a setting that did not stick and one that looks
  // broken.
  const [isPersisted, setIsPersisted] = useState(true);

  const settings = useMemo(
    () => mergeTvDrawSettings(accountSettings, overrides),
    [accountSettings, overrides]
  );

  const setOverride = useCallback(
    (name, value) => {
      setOverrides_((current) => {
        const next = { ...current, [name]: value };
        setIsPersisted(writeTvSettingsOverrides(userId, next));
        return next;
      });
    },
    [userId]
  );

  // Streaming priority is two booleans behind one control, so both move
  // together or the television briefly holds a state the control cannot show.
  const setOverrides = useCallback(
    (patch) => {
      setOverrides_((current) => {
        const next = { ...current, ...patch };
        setIsPersisted(writeTvSettingsOverrides(userId, next));
        return next;
      });
    },
    [userId]
  );

  const clearOverrides = useCallback(() => {
    setIsPersisted(clearTvSettingsOverrides(userId));
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
