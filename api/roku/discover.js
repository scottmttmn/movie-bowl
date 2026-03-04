import { discoverRokuDevices, getRokuDeviceInfo } from "../_lib/roku.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const manualIp = String(req.query?.ip || "").trim();

  try {
    if (manualIp) {
      const device = await getRokuDeviceInfo(manualIp);
      res.status(200).json({ devices: [device], source: "manual" });
      return;
    }

    const devices = await discoverRokuDevices();
    res.status(200).json({
      devices,
      source: "discovery",
      setupSteps:
        devices.length > 0
          ? []
          : [
              "Confirm your phone and Roku are on the same Wi-Fi network.",
              "Enable Settings > System > Advanced system settings > Control by mobile apps > Network access.",
              "If discovery still fails, enter the Roku IP manually from Settings > Network > About.",
            ],
    });
  } catch (error) {
    const status = manualIp ? 400 : 500;
    console.error("[roku/discover] Failed to discover Roku devices", error);
    res.status(status).json({
      error: manualIp ? "Unable to validate that Roku IP." : "Failed to discover Roku devices.",
      devices: [],
      setupSteps: [
        "Check that the Roku is powered on and on the same Wi-Fi network.",
        "If needed, enter the Roku IP manually from Settings > Network > About.",
      ],
    });
  }
}
