import { getInstalledRokuApps, launchRokuApp, resolvePreferredStreamingLaunch } from "../_lib/roku.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = readBody(req);
  const rokuIp = String(body?.rokuIp || "").trim();
  const userServices = Array.isArray(body?.userServices) ? body.userServices : [];
  const movieProviders = Array.isArray(body?.movieProviders) ? body.movieProviders : [];

  if (!rokuIp) {
    res.status(400).json({ error: "Missing required field: rokuIp" });
    return;
  }

  try {
    const installedApps = await getInstalledRokuApps(rokuIp);
    const preferredLaunch = resolvePreferredStreamingLaunch({
      userServices,
      movieProviders,
      installedApps,
    });

    if (!preferredLaunch) {
      res.status(200).json({
        ok: false,
        action: "no-match",
        message: "No matching installed Roku app was found for this movie.",
        details: [
          "The movie matches your saved services, but none of those supported apps are installed on the selected Roku.",
        ],
      });
      return;
    }

    const result = await launchRokuApp({
      rokuIp,
      appId: preferredLaunch.appId,
      appName: preferredLaunch.appName,
      serviceName: preferredLaunch.serviceName,
    });

    res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    console.error("[roku/launch-app] Failed to launch preferred app", error);
    res.status(500).json({
      ok: false,
      action: "failed",
      message: "Unable to launch a streaming app on Roku right now.",
      details: [
        "Check the Roku IP and confirm mobile app control is enabled.",
      ],
    });
  }
}
