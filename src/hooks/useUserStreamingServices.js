import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeStreamingServices, normalizeStreamingServicesForProfile } from "../utils/streamingServices";
import { DEFAULT_DRAW_SETTINGS, normalizeDefaultDrawSettings } from "../utils/drawSettings";
import { valuesAreEqual } from "./useAutosave";

export default function useUserStreamingServices({ autoLoad = true } = {}) {
  const [streamingServices, setStreamingServicesState] = useState([]);
  const [defaultDrawSettings, setDefaultDrawSettingsState] = useState(DEFAULT_DRAW_SETTINGS);
  const [loading, setLoading] = useState(autoLoad);
  const [loadError, setLoadError] = useState(null);

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

      if (authError || !user) {
        setLoadError(authError || new Error("Not authenticated"));
        setStreamingServicesState([]);
        return [];
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("streaming_services, default_draw_settings")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("[useUserStreamingServices] Failed to load profile", error);
        setLoadError(error);
        setStreamingServicesState([]);
        return [];
      }

      const normalized = normalizeStreamingServices(data?.streaming_services || []);
      const normalizedDrawSettings = normalizeDefaultDrawSettings(data?.default_draw_settings);
      setStreamingServicesState(normalized);
      setDefaultDrawSettingsState(normalizedDrawSettings);
      return normalized;
    } catch (error) {
      console.error("[useUserStreamingServices] Failed to load profile", error);
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

  const toggleService = useCallback((service) => {
    setStreamingServicesState((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  }, []);

  return {
    streamingServices,
    setStreamingServices,
    defaultDrawSettings,
    setDefaultDrawSettings,
    toggleService,
    loading,
    loadError,
    reloadStreamingServices: loadStreamingServices,
    saveStreamingServices,
    saveDefaultDrawSettings,
  };
}
