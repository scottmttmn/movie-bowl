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

function buildInviteEmail({ bowlName, invitedEmail, invitedByEmail, inviteUrl }) {
  const inviterLine = invitedByEmail
    ? `<p style="margin:0 0 16px;">${invitedByEmail} invited you to join <strong>${bowlName}</strong> on Movie Bowl.</p>`
    : `<p style="margin:0 0 16px;">You have been invited to join <strong>${bowlName}</strong> on Movie Bowl.</p>`;

  return {
    subject: "You've been invited to join a Movie Bowl",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
        ${inviterLine}
        <p style="margin:0 0 16px;">This invite is for <strong>${invitedEmail}</strong>. Sign in with that email to join.</p>
        <p style="margin:0 0 20px;">
          <a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">Accept invite</a>
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569;">If the button does not work, use this link:</p>
        <p style="margin:0;font-size:14px;word-break:break-all;">
          <a href="${inviteUrl}" style="color:#2563eb;">${inviteUrl}</a>
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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

  const invalidInvite = invites.find(
    (invite) =>
      !invite ||
      typeof invite.invitedEmail !== "string" ||
      typeof invite.token !== "string" ||
      typeof invite.bowlName !== "string"
  );

  if (invalidInvite) {
    res.status(400).json({ error: "Invalid invite payload." });
    return;
  }

  const results = await Promise.all(
    invites.map(async (invite) => {
      const inviteUrl = `${appBaseUrl}/accept-invite/${invite.token}`;
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

