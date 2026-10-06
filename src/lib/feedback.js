import { supabase } from "./supabase";
import { APP_BUILD_ID } from "../utils/appVersion";

// Routes whose last segment is a credential: an invite or a guest add link.
const TOKEN_ROUTES = /^\/(accept-invite|add-to-bowl)\/[^/]+/;

// Exactly what the sheet says it sends: the page and the device. The path only,
// never the query or hash, which can carry invite tokens and search text, and
// with any token in the path itself replaced.
export function describeFeedbackContext(win = typeof window === "undefined" ? undefined : window) {
  const page = (win?.location?.pathname || "").replace(TOKEN_ROUTES, "/$1/:token");
  const agent = win?.navigator?.userAgent || "";
  const size = win?.innerWidth && win?.innerHeight ? `${win.innerWidth}×${win.innerHeight}` : "";
  return { page, device: [agent, size].filter(Boolean).join(" · "), build: APP_BUILD_ID || "" };
}

// `page` overrides the one read here: a report sent from a phone on the TV's
// behalf is about the TV.
export async function sendFeedback({ message = "", errorText = "", page = null } = {}) {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return { ok: false, message: "Sign in to send feedback." };

    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        errorText,
        ...describeFeedbackContext(),
        ...(page ? { page } : {}),
      }),
    });
    if (response.ok) return { ok: true };

    const result = await response.json().catch(() => ({}));
    return { ok: false, code: result?.code || null, message: result?.error || "Could not send that. Try again." };
  } catch (error) {
    console.error("[feedback] Failed to send", error);
    return { ok: false, message: "Could not send that. Try again." };
  }
}
