import { createHash, randomBytes, randomUUID } from "node:crypto";

export const TV_PAIRING_LIFETIME_MS = 10 * 60 * 1000;
export const TV_PAIRING_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

const USER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function parseRequestBody(req) {
  if (!req?.body) return {};
  if (typeof req.body !== "string") return req.body;

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

export function getBearerToken(req) {
  const authorization = req?.headers?.authorization || req?.headers?.Authorization;
  if (typeof authorization !== "string") return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function normalizeUserCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatUserCode(value) {
  const normalized = normalizeUserCode(value);
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`
    : normalized;
}

export function createUserCode() {
  const bytes = randomBytes(8);
  let code = "";

  for (const byte of bytes) {
    code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
  }

  return code;
}

export function createDeviceCredentials() {
  const deviceSecret = randomBytes(32).toString("base64url");

  return {
    deviceId: randomUUID(),
    deviceSecret,
    deviceSecretHash: hashDeviceSecret(deviceSecret),
  };
}

export function hashDeviceSecret(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

export function getAppBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").trim();

  if (!host) {
    throw new Error("Missing application base URL configuration.");
  }

  return `${forwardedProto || "https"}://${host}`;
}

export function sendJson(res, status, body) {
  res.setHeader?.("Cache-Control", "no-store");
  res.status(status).json(body);
}
