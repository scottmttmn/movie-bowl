import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { discoverRokus } from "../lib/rokuApi";

const RokuDeviceContext = createContext(null);
const STORAGE_KEY = "movie-bowl:selected-roku-ip";

export function RokuDeviceProvider({ children }) {
  const [devices, setDevices] = useState([]);
  const [selectedRokuIp, setSelectedRokuIp] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY) || "";
  });
  const [setupSteps, setSetupSteps] = useState([]);
  const [deviceError, setDeviceError] = useState("");
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedRokuIp) {
      window.localStorage.setItem(STORAGE_KEY, selectedRokuIp);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedRokuIp]);

  const discoverDevices = async () => {
    setDiscoveryLoading(true);
    setDeviceError("");

    try {
      const data = await discoverRokus();
      setDevices(data.devices);
      setSetupSteps(data.setupSteps);
      setSelectedRokuIp((current) => current || data.devices[0]?.ip || "");
      return data.devices;
    } catch (error) {
      setDevices([]);
      setSetupSteps([
        "Confirm your phone and Roku are on the same Wi-Fi.",
        "If discovery fails, enter the Roku IP manually from Roku Settings > Network > About.",
      ]);
      setDeviceError(error.message || "Could not discover Roku devices.");
      return [];
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const validateManualIp = async (ip) => {
    const trimmedIp = String(ip || "").trim();

    if (!trimmedIp) {
      setDeviceError("Enter a Roku IP address first.");
      return null;
    }

    setDiscoveryLoading(true);
    setDeviceError("");

    try {
      const data = await discoverRokus({ ip: trimmedIp });
      const [device] = data.devices;

      if (!device) {
        throw new Error("No Roku responded at that IP.");
      }

      setDevices((current) => {
        const next = current.filter((item) => item.ip !== device.ip);
        return [device, ...next];
      });
      setSelectedRokuIp(device.ip);
      setSetupSteps([]);
      return device;
    } catch (error) {
      setDeviceError(error.message || "Could not validate that Roku IP.");
      return null;
    } finally {
      setDiscoveryLoading(false);
    }
  };

  useEffect(() => {
    discoverDevices().catch(() => {});
  }, []);

  const selectedRoku = useMemo(
    () => devices.find((device) => device.ip === selectedRokuIp) || null,
    [devices, selectedRokuIp]
  );

  const value = useMemo(
    () => ({
      devices,
      selectedRoku,
      selectedRokuIp,
      setSelectedRokuIp,
      setupSteps,
      deviceError,
      setDeviceError,
      discoveryLoading,
      discoverDevices,
      validateManualIp,
    }),
    [devices, selectedRoku, selectedRokuIp, setupSteps, deviceError, discoveryLoading]
  );

  return <RokuDeviceContext.Provider value={value}>{children}</RokuDeviceContext.Provider>;
}

export function useRokuDevice() {
  const context = useContext(RokuDeviceContext);

  if (!context) {
    throw new Error("useRokuDevice must be used within a RokuDeviceProvider");
  }

  return context;
}
