import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";

const MAX_INVITES_PER_REQUEST = 25;

function parseRequestBody(req) {
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

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return null;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getBearerToken(req) {
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authorization !== "string") return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]
  );
}

function buildInviteEmail({ bowlName, invitedEmail, invitedByEmail, inviteUrl }) {
  const safeBowlName = escapeHtml(bowlName);
  const safeInvitedEmail = escapeHtml(invitedEmail);
  const safeInvitedByEmail = invitedByEmail ? escapeHtml(invitedByEmail) : null;
  const safeInviteUrl = escapeHtml(inviteUrl);
  const inviterLine = invitedByEmail
    ? `<p style="margin:0 0 16px;">${safeInvitedByEmail} invited you to join <strong>${safeBowlName}</strong> on Movie Bowl.</p>`
    : `<p style="margin:0 0 16px;">You have been invited to join <strong>${safeBowlName}</strong> on Movie Bowl.</p>`;

  return {
    subject: "You've been invited to join a Movie Bowl",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
        ${inviterLine}
        <p style="margin:0 0 16px;">This invite is for <strong>${safeInvitedEmail}</strong>. Sign in with that email to join.</p>
        <p style="margin:0 0 20px;">
          <a href="${safeInviteUrl}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">Accept invite</a>
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569;">If the button does not work, use this link:</p>
        <p style="margin:0;font-size:14px;word-break:break-all;">
          <a href="${safeInviteUrl}" style="color:#2563eb;">${safeInviteUrl}</a>
        </p>
      </div>
    `.trim(),
    text: [
      invitedByEmail
        ? `${invitedByEmail} invited you to join "${bowlName}" on Movie Bowl.`
        : `You've been invited to join "${bowlName}" on Movie Bowl.`,
      `This invite is for ${invitedEmail}. Sign in with that email to join.`,
      "",
      `Accept invite: ${inviteUrl}`,
    ].join("\n"),
  };
}

async function sendResendEmail({ resendApiKey, from, to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Resend request failed with ${response.status}`);
  }

  return data;
}

function getRelatedBowl(invite) {
  return Array.isArray(invite?.bowls) ? invite.bowls[0] : invite?.bowls;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_EMAIL_FROM;
  const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);

  if (!resendApiKey || !from || !appBaseUrl) {
    res.status(500).json({ error: "Missing invite email configuration." });
    return;
  }

  const body = parseRequestBody(req);
  const invites = Array.isArray(body?.invites) ? body.invites : [];

  if (invites.length === 0) {
    res.status(400).json({ error: "Missing invites payload." });
    return;
  }

  if (invites.length > MAX_INVITES_PER_REQUEST) {
    res.status(413).json({ error: `A maximum of ${MAX_INVITES_PER_REQUEST} invites can be sent at once.` });
    return;
  }

  const tokens = invites.map((invite) =>
    typeof invite?.token === "string" ? invite.token.trim() : ""
  );
  const uniqueTokens = [...new Set(tokens)];

  if (
    tokens.some((token) => !token || token.length > 200) ||
    uniqueTokens.length !== tokens.length
  ) {
    res.status(400).json({ error: "Invalid invite payload." });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error("[api/invites/send] Missing Supabase configuration", error);
    res.status(500).json({ error: "Missing invite email configuration." });
    return;
  }

  let authData;
  let authError;
  try {
    ({ data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken));
  } catch (error) {
    console.error("[api/invites/send] Failed to authenticate request", error);
    res.status(500).json({ error: "Failed to authenticate invite email request." });
    return;
  }
  const user = authData?.user;

  if (authError || !user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  let storedInvites;
  let invitesError;
  try {
    ({ data: storedInvites, error: invitesError } = await supabaseAdmin
      .from("bowl_invites")
      .select("token, bowl_id, invited_email, invited_by, accepted_at, bowls!inner(name, owner_id)")
      .in("token", uniqueTokens));
  } catch (error) {
    console.error("[api/invites/send] Failed to verify invites", error);
    res.status(500).json({ error: "Failed to verify invite emails." });
    return;
  }

  if (invitesError) {
    console.error("[api/invites/send] Failed to verify invites", invitesError);
    res.status(500).json({ error: "Failed to verify invite emails." });
    return;
  }

  const storedInviteByToken = new Map(
    (storedInvites || []).map((invite) => [invite.token, invite])
  );
  const verifiedInvites = uniqueTokens.map((token) => {
    const invite = storedInviteByToken.get(token);
    const bowl = getRelatedBowl(invite);
    const isOwnedInvite =
      invite?.invited_by === user.id &&
      bowl?.owner_id === user.id &&
      invite?.accepted_at == null;

    if (!isOwnedInvite || !invite?.invited_email || !bowl?.name) {
      return null;
    }

    return {
      token,
      invitedEmail: invite.invited_email,
      bowlName: bowl.name,
      invitedByEmail: user.email || null,
    };
  });

  if (verifiedInvites.some((invite) => !invite)) {
    res.status(403).json({ error: "One or more invites are not available to send." });
    return;
  }

  const results = await Promise.all(
    verifiedInvites.map(async (invite) => {
      const inviteUrl = `${appBaseUrl}/accept-invite/${encodeURIComponent(invite.token)}`;
      const email = buildInviteEmail({
        bowlName: invite.bowlName,
        invitedEmail: invite.invitedEmail,
        invitedByEmail: invite.invitedByEmail || null,
        inviteUrl,
      });

      try {
        await sendResendEmail({
          resendApiKey,
          from,
          to: invite.invitedEmail,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        return { email: invite.invitedEmail, ok: true };
      } catch (error) {
        return {
          email: invite.invitedEmail,
          ok: false,
          error: error?.message || "Failed to send invite email.",
        };
      }
    })
  );

  const sent = results.filter((result) => result.ok).length;
  const failed = results.length - sent;

  res.status(200).json({
    sent,
    failed,
    results,
  });
}
