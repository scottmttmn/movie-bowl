import { getSupabaseAdmin } from "./supabaseAdmin.js";

// A meter must not be able to break the thing it measures. Every failure here
// is swallowed: a missing configuration, an unreachable database, a slow one.
// The cost of losing a count is a gap in a chart; the cost of throwing is a
// failed invite or a dead cron run.
const RECORD_TIMEOUT_MS = 2_000;

// Supabase's builder is thenable and carries abortSignal; a caller's injected
// client in a test is often just a function returning a promise. Bounding the
// wait when we can beats requiring every caller to supply a full builder.
function withTimeout(request) {
  if (
    typeof request?.abortSignal === "function" &&
    typeof AbortSignal?.timeout === "function"
  ) {
    return request.abortSignal(AbortSignal.timeout(RECORD_TIMEOUT_MS));
  }
  return request;
}

function parseThreshold(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Warn once the day's mail is close enough to a vendor cap to matter.
 *
 * The threshold is deliberately a warning rather than a refusal. Resend already
 * enforces its own ceiling, and a local limit that stopped sending early would
 * turn "we are nearly out" into "nobody can be invited" without adding any
 * information.
 */
export function getEmailDailyWarnThreshold() {
  return parseThreshold(process.env.EMAIL_DAILY_WARN_THRESHOLD, 80);
}

/**
 * Records spend of a metered vendor quota against today, UTC.
 *
 * Returns the day's new running count, or null when the count could not be
 * recorded. Callers may use the number; none of them may depend on it.
 */
export async function recordServiceUsage(metric, count = 1, { label = "usage", client } = {}) {
  if (!Number.isFinite(Number(count)) || Number(count) <= 0) return null;

  try {
    const supabaseAdmin = client || getSupabaseAdmin();
    const request = supabaseAdmin.rpc("record_service_usage", {
      p_metric: metric,
      p_count: Math.floor(Number(count)),
    });
    const { data, error } = await withTimeout(request);

    if (error) {
      console.error(`[api/${label}] Failed to record ${metric} usage`, error);
      return null;
    }

    return typeof data === "number" ? data : Number(data ?? 0) || null;
  } catch (error) {
    console.error(`[api/${label}] Failed to record ${metric} usage`, error);
    return null;
  }
}

/**
 * Records mail sent and says so in the log once the day is running hot.
 *
 * The daily cap does not bind in ordinary use -- sessions persist, so people
 * log in rarely, and invites follow the social graph. It binds during a signup
 * burst, where the failure is that nobody new can get in and nothing announces
 * it. This line is that announcement.
 */
export async function recordEmailUsage(count, options = {}) {
  const total = await recordServiceUsage("invite_email", count, options);
  if (total === null) return null;

  const threshold = getEmailDailyWarnThreshold();
  if (total >= threshold) {
    console.error(
      `[api/${options.label || "usage"}] Mail sent today is ${total}, at or past the warning threshold of ${threshold}. ` +
        "Vendor daily caps also cover the magic-link mail this counter cannot see."
    );
  }

  return total;
}
