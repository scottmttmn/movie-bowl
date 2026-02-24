import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeStreamingServices, normalizeStreamingServicesForProfile } from "../utils/streamingServices";

export default function useUserStreamingServices({ autoLoad = true } = {}) {
  const [streamingServices, setStreamingServicesState] = useState([]);
  const [loading, setLoading] = useState(autoLoad);

  const setStreamingServices = useCallback((services) => {
    setStreamingServicesState(normalizeStreamingServices(services || []));
  }, []);

  const loadStreamingServices = useCallback(async () => {
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        setStreamingServicesState([]);
        return [];
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("streaming_services")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("[useUserStreamingServices] Failed to load profile", error);
        setStreamingServicesState([]);
        return [];
      }

      const normalized = normalizeStreamingServices(data?.streaming_services || []);
      setStreamingServicesState(normalized);
      return normalized;
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

  const toggleService = useCallback((service) => {
    setStreamingServicesState((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  }, []);

  return {
    streamingServices,
    setStreamingServices,
    toggleService,
    loading,
    reloadStreamingServices: loadStreamingServices,
    saveStreamingServices,
  };
}
