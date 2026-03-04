import { openSearchForTitle } from "../_lib/roku.js";

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
  const title = String(body?.title || "").replace(/\s+/g, " ").trim();
  const year = body?.year ?? null;

  if (!rokuIp) {
    res.status(400).json({ error: "Missing required field: rokuIp" });
    return;
  }

  if (!title) {
    res.status(400).json({ error: "Missing required field: title" });
    return;
  }

  try {
    const result = await openSearchForTitle({ rokuIp, title, year });
    const statusCode = result.ok ? 200 : 502;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error("[roku/search] Failed to send search command", error);
    res.status(500).json({
      ok: false,
      action: "failed",
      message: "Unable to send the movie to Roku right now.",
      details: [
        "Check the Roku IP and confirm mobile app control is enabled.",
      ],
    });
  }
}
