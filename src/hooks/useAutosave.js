import { useCallback, useEffect, useRef, useState } from "react";

export const AUTOSAVE_DELAY_MS = 700;

export function valuesAreEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => valuesAreEqual(item, b[index]));
  }

  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && valuesAreEqual(a[key], b[key])
  );
}

/**
 * Persists `value` automatically a short moment after it stops changing, so a
 * screen never depends on the user remembering to press a save button.
 *
 * `save` receives the value being written plus the last successfully saved one,
 * and resolves to `{ error }` (a thrown error is treated the same way).
 * `enabled` should stay false until the initial value has finished loading —
 * the value present when it flips true becomes the saved baseline, so arriving
 * data is never mistaken for an edit.
 *
 * Returns:
 *   status              "idle" | "pending" | "saving" | "saved" | "error"
 *   error               the failure from the last attempt, when status is "error"
 *   hasUnsavedChanges   value differs from the last successful save
 *   retry               save immediately, skipping the debounce
 */
export default function useAutosave({ value, save, enabled = true, delay = AUTOSAVE_DELAY_MS }) {
  const [baseline, setBaseline] = useState(value);
  const [ready, setReady] = useState(enabled);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);

  // Kept current after every commit so `flush` can run against the freshest
  // value without being re-created (and re-scheduled) on each keystroke.
  const latestRef = useRef({ value, save, baseline, ready, enabled });
  useEffect(() => {
    latestRef.current = { value, save, baseline, ready, enabled };
  });

  const savingRef = useRef(false);
  const rerunRef = useRef(false);
  const timerRef = useRef(null);

  const hasUnsavedChanges = enabled && ready && !valuesAreEqual(value, baseline);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savingRef.current) {
      // A write is already running. Ask it to look again once it lands rather
      // than dropping this request, which is what strands the final edit when
      // the screen unmounts mid-request.
      rerunRef.current = true;
      return;
    }

    savingRef.current = true;
    // Tracked locally rather than read back from state: after unmount there are
    // no more commits, so `baseline` would never catch up between passes.
    let base = latestRef.current.baseline;

    try {
      for (;;) {
        rerunRef.current = false;

        const current = latestRef.current;
        if (!current.enabled || !current.ready) return;

        const snapshot = current.value;
        if (valuesAreEqual(snapshot, base)) return;

        setPhase("saving");

        let result;
        try {
          result = await current.save(snapshot, base);
        } catch (thrown) {
          result = { error: thrown };
        }

        if (result?.error) {
          setError(result.error);
          setPhase("error");
          return;
        }

        base = snapshot;
        setError(null);
        setPhase("saved");
        setBaseline(snapshot);

        // Edits that landed while the request was in flight go out in the next
        // pass. While mounted the scheduling effect would also catch them, but
        // it cannot run once the screen is gone.
        if (!rerunRef.current && valuesAreEqual(latestRef.current.value, snapshot)) return;
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || ready) return;
    // The value only becomes meaningful once loading finishes; adopt it as the
    // saved baseline so its arrival does not look like an unsaved edit.
    setBaseline(value);
    setReady(true);
  }, [enabled, ready, value]);

  useEffect(() => {
    if (!enabled || !ready) return undefined;
    if (valuesAreEqual(value, baseline)) return undefined;
    // A save already running will refresh the baseline when it settles, which
    // brings us back here for whatever changed in the meantime.
    if (savingRef.current) return undefined;

    timerRef.current = setTimeout(() => {
      flush();
    }, delay);

    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [value, baseline, enabled, ready, delay, flush]);

  useEffect(
    () => () => {
      // Unmounting mid-debounce (hitting Back right after a toggle) must still
      // write the pending edit; the request outlives the component.
      flush();
    },
    [flush]
  );

  const saveInFlight = phase === "saving";

  useEffect(() => {
    if (!hasUnsavedChanges && !saveInFlight) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, saveInFlight]);

  let status = phase;
  if (saveInFlight) {
    status = "saving";
  } else if (phase === "error") {
    // Undoing the edit that failed leaves the stored value correct again, so
    // there is nothing left to warn about.
    status = hasUnsavedChanges ? "error" : "saved";
  } else if (hasUnsavedChanges) {
    status = "pending";
  }

  return {
    status,
    error: status === "error" ? error : null,
    hasUnsavedChanges,
    retry: flush,
  };
}
