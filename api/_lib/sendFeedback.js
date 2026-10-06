import { getSupabaseAdmin } from "./supabaseAdmin.js";

// Where reports are mailed. The same address the About page already publishes
// as the support contact; FEEDBACK_EMAIL_TO moves it without a deploy.
const DEFAULT_FEEDBACK_TO = "scottmttmn@gmail.com";

const LIMITS = { message: 4000, errorText: 2000, page: 300, device: 400, build: 80 };

function getBearerToken(req) {
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authorization !== "string") return null;
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Context fields are trimmed to fit rather than refused: a long user agent is
// not the sender's fault, and losing the report over it would be.
function clip(value, limit) {
  return text(value).slice(0, limit);
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

export function buildFeedbackEmail({ email, message, errorText, page, device, build }) {
  const kind = errorText ? "error report" : "feedback";
  const firstLine = (message || errorText).split("\n")[0].slice(0, 60);
  const details = [
    ["From", email || "unknown"],
    ["Page", page || "unknown"],
    ["Device", device || "unknown"],
    ["Build", build || "unknown"],
  ];

  return {
    subject: `Movie Bowl ${kind}: ${firstLine}`,
    text: [
      message || "(no message)",
      ...(errorText ? ["", `Error: ${errorText}`] : []),
      "",
      ...details.map(([label, value]) => `${label}: ${value}`),
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
        <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(message || "(no message)")}</p>
        ${errorText ? `<pre style="margin:0 0 16px;padding:10px;background:#f1f5f9;border-radius:8px;white-space:pre-wrap;">${escapeHtml(errorText)}</pre>` : ""}
        <table style="font-size:13px;color:#475569;">
          ${details.map(([label, value]) => `<tr><td style="padding-right:12px;">${label}</td><td>${escapeHtml(value)}</td></tr>`).join("")}
        </table>
      </div>
    `.trim(),
  };
}

export default async function sendFeedback(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const body = parseBody(req);
  const message = text(body.message);
  const errorText = clip(body.errorText, LIMITS.errorText);
  if (!message && !errorText) {
    res.status(400).json({ error: "Write something first." });
    return;
  }
  if (message.length > LIMITS.message) {
    res.status(400).json({ error: "That is longer than we can take. Trim it a little." });
    return;
  }
  const page = clip(body.page, LIMITS.page);
  const device = clip(body.device, LIMITS.device);
  const build = clip(body.build, LIMITS.build);

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    console.error("[api/feedback] Missing Supabase configuration", error);
    res.status(500).json({ error: "Feedback is not available right now." });
    return;
  }

  let user;
  try {
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error) throw error;
    user = data?.user;
  } catch {
    user = null;
  }
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const { data: recorded, error: recordError } = await admin.rpc("record_feedback_report", {
    p_user_id: user.id,
    p_message: message,
    p_error_text: errorText || null,
    p_page: page || null,
    p_device: device || null,
    p_build: build || null,
  });
  if (recordError) {
    console.error("[api/feedback] Failed to record report", recordError);
    res.status(500).json({ error: "Could not send that. Try again." });
    return;
  }
  if (recorded?.code === "rate_limited") {
    res.status(429).json({ error: "That's a lot at once. Try again in a while.", code: "rate_limited" });
    return;
  }

  // The report is saved; the mail only tells Scott it is there. A mail failure
  // is logged rather than returned, because telling the sender to try again
  // would only save a second copy.
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_EMAIL_FROM;
  if (resendApiKey && from) {
    try {
      const email = buildFeedbackEmail({ email: user.email, message, errorText, page, device, build });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [process.env.FEEDBACK_EMAIL_TO || DEFAULT_FEEDBACK_TO],
          ...(user.email ? { reply_to: user.email } : {}),
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!response.ok) {
        console.error("[api/feedback] Resend refused the mail", response.status);
      }
    } catch (error) {
      console.error("[api/feedback] Failed to mail report", error);
    }
  } else {
    console.error("[api/feedback] Missing mail configuration; report saved without mail");
  }

  res.status(200).json({ ok: true });
}
