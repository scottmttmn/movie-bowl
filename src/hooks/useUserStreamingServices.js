import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeStreamingServices, normalizeStreamingServicesForProfile } from "../utils/streamingServices";
import { DEFAULT_DRAW_SETTINGS, normalizeDefaultDrawSettings } from "../utils/drawSettings";
import { valuesAreEqual } from "./useAutosave";
import { getDisplayNameValidationError, normalizeDisplayName } from "../utils/profileIdentity";
import { isPageUnloading } from "../utils/pageLifecycle";

export default function useUserStreamingServices({ autoLoad = true } = {}) {
  const [streamingServices, setStreamingServicesState] = useState([]);
  const [defaultDrawSettings, setDefaultDrawSettingsState] = useState(DEFAULT_DRAW_SETTINGS);
  const [removeFromBowlsOnSoloDraw, setRemoveFromBowlsOnSoloDrawState] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [loading, setLoading] = useState(autoLoad);
  const [loadError, setLoadError] = useState(null);
  // Set when the page unloaded under a profile read. The error is still kept --
  // it is what stops a save writing defaults over preferences that never
  // loaded -- but it is not reported, and a bfcache restore reads again.
  const abandonedLoadRef = useRef(false);

  const setStreamingServices = useCallback((services) => {
    setStreamingServicesState(normalizeStreamingServices(services || []));
  }, []);

  const setDefaultDrawSettings = useCallback((settings) => {
    setDefaultDrawSettingsState(normalizeDefaultDrawSettings(settings));
  }, []);

  const loadStreamingServices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;
      setAccountEmail(user?.email || "");

      if (authError || !user) {
        setLoadError(authError || new Error("Not authenticated"));
        setStreamingServicesState([]);
        return [];
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, streaming_services, default_draw_settings, remove_from_bowls_on_solo_draw")
        .eq("id", user.id)
        .single();

      if (error) {
        // A read the page abandoned on its way out did not fail; see pageLifecycle.
        if (isPageUnloading()) abandonedLoadRef.current = true;
        else console.error("[useUserStreamingServices] Failed to load profile", error);
        setLoadError(error);
        setStreamingServicesState([]);
        return [];
      }

      const normalized = normalizeStreamingServices(data?.streaming_services || []);
      const normalizedDrawSettings = normalizeDefaultDrawSettings(data?.default_draw_settings);
      setDisplayName(data?.display_name || "");
      setStreamingServicesState(normalized);
      setDefaultDrawSettingsState(normalizedDrawSettings);
      setRemoveFromBowlsOnSoloDrawState(data?.remove_from_bowls_on_solo_draw === true);
      return normalized;
    } catch (error) {
      if (isPageUnloading()) abandonedLoadRef.current = true;
      else console.error("[useUserStreamingServices] Failed to load profile", error);
      setLoadError(error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) return;
    loadStreamingServices();
  }, [autoLoad, loadStreamingServices]);

  useEffect(() => {
    const reloadAfterRestore = (event) => {
      if (!event.persisted || !abandonedLoadRef.current) return;
      abandonedLoadRef.current = false;
      loadStreamingServices();
    };
    window.addEventListener("pageshow", reloadAfterRestore);
    return () => window.removeEventListener("pageshow", reloadAfterRestore);
  }, [loadStreamingServices]);

  const saveStreamingServices = useCallback(
    async (services = streamingServices) => {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        return { error: authError || new Error("Not authenticated") };
      }

      const normalized = normalizeStreamingServicesForProfile(services || []);
      const { error } = await supabase
        .from("profiles")
        .update({ streaming_services: normalized })
        .eq("id", user.id);

      if (!error) {
        setStreamingServicesState(normalized);
      }

      return { error };
    },
    [streamingServices]
  );

  const saveDefaultDrawSettings = useCallback(
    async (settings = defaultDrawSettings) => {
      if (loadError) return { error: loadError };
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        return { error: authError || new Error("Not authenticated") };
      }

      // Filters and playback have separate editors in the same profile object.
      const normalized = normalizeDefaultDrawSettings({ ...defaultDrawSettings, ...settings });
      const { error } = await supabase
        .from("profiles")
        .update({ default_draw_settings: normalized })
        .eq("id", user.id);

      if (!error) {
        // A slow save must not replace an edit made while it was in flight.
        setDefaultDrawSettingsState((current) =>
          valuesAreEqual(current, defaultDrawSettings) ? normalized : current
        );
      }

      return { error };
    },
    [defaultDrawSettings, loadError]
  );

  // Its own column rather than a key in default_draw_settings, because the
  // draw reads it on the server and that column is a normalized blob: a client
  // that has never heard of this key would drop it on its next save.
  const saveRemoveFromBowlsOnSoloDraw = useCallback(
    async (enabled) => {
      if (loadError) return { error: loadError };
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        return { error: authError || new Error("Not authenticated") };
      }

      const next = enabled === true;
      const { error } = await supabase
        .from("profiles")
        .update({ remove_from_bowls_on_solo_draw: next })
        .eq("id", user.id);

      if (!error) {
        setRemoveFromBowlsOnSoloDrawState(next);
      }

      return { error };
    },
    [loadError]
  );

  const saveDisplayName = useCallback(async (value = displayName) => {
    const validationError = getDisplayNameValidationError(value);
    if (validationError) return { error: new Error(validationError) };

    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;
    if (authError || !user) {
      return { error: authError || new Error("Not authenticated") };
    }

    const normalized = normalizeDisplayName(value);
    const { error } = await supabase
      .from("profiles")
      // Null, never "": the column's check constraint rejects an empty string,
      // and absent is what the neutral fallback reads.
      .update({ display_name: normalized || null })
      .eq("id", user.id);

    return { error };
  }, [displayName]);

  const toggleService = useCallback((service) => {
    setStreamingServicesState((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  }, []);

  return {
    streamingServices,
    displayName,
    accountEmail,
    setDisplayName,
    setStreamingServices,
    defaultDrawSettings,
    setDefaultDrawSettings,
    removeFromBowlsOnSoloDraw,
    setRemoveFromBowlsOnSoloDraw: setRemoveFromBowlsOnSoloDrawState,
    toggleService,
    loading,
    loadError,
    reloadStreamingServices: loadStreamingServices,
    saveStreamingServices,
    saveDefaultDrawSettings,
    saveRemoveFromBowlsOnSoloDraw,
    saveDisplayName,
  };
}
