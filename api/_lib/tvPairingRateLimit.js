import { createHmac } from "node:crypto";

export const TV_PAIRING_RATE_LIMITS = Object.freeze({
  startIp: Object.freeze({ bucket: "start_ip", limit: 12, windowSeconds: 10 * 60 }),
  approveIp: Object.freeze({ bucket: "approve_ip", limit: 60, windowSeconds: 10 * 60 }),
  approveUser: Object.freeze({ bucket: "approve_user", limit: 12, windowSeconds: 10 * 60 }),
});

function readHeader(req, name) {
  const headers = req?.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
}

export function getClientAddress(req) {
  const forwarded =
    readHeader(req, "x-vercel-forwarded-for") ||
    readHeader(req, "x-forwarded-for") ||
    readHeader(req, "x-real-ip");
  const address = String(forwarded || req?.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();

  // Vercel supplies a non-spoofable forwarded address in production. Sharing
  // one fallback bucket is safer than silently disabling limits in local tools.
  return address.slice(0, 128) || "unknown-client";
}

function hashSubject(bucket, subject) {
  const secret = String(process.env.TV_PAIRING_RATE_LIMIT_SECRET || "");
  if (secret.length < 32) {
    throw new Error("Missing or weak TV pairing rate-limit secret configuration.");
  }

  return createHmac("sha256", secret)
    .update(`${bucket}\0${String(subject || "unknown-client")}`, "utf8")
    .digest("hex");
}

export async function consumeTvPairingRateLimit(supabaseAdmin, rule, subject) {
  const { data, error } = await supabaseAdmin.rpc("consume_tv_pairing_rate_limit", {
    p_bucket: rule.bucket,
    p_subject_hash: hashSubject(rule.bucket, subject),
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    throw new Error(`TV pairing rate limit failed for ${rule.bucket}.`, { cause: error });
  }
  if (!data || typeof data.allowed !== "boolean") {
    throw new Error(`TV pairing rate limit returned an invalid result for ${rule.bucket}.`);
  }

  if (data.allowed) return { allowed: true, retryAfterSeconds: 0 };

  const retryAfterSeconds = Number(data.retry_after_seconds);
  return {
    allowed: false,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? Math.max(1, Math.ceil(retryAfterSeconds))
      : rule.windowSeconds,
  };
}
