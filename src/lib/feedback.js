import { supabase } from "./supabase";
import { APP_BUILD_ID } from "../utils/appVersion";

// Routes whose second segment is a credential: an invite or a guest add link.
export function redactPage(path) {
  // Normalize the way the router reads a path -- decoded, any case, repeated
  // slashes ignored -- so that every spelling of a token route is caught.
  const segments = String(path || "")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/")
    .split("/")
    .filter(Boolean);
  if (segments.length > 1 && /^(accept-invite|add-to-bowl)$/i.test(segments[0].trim())) {
    return `/${segments[0].trim().toLowerCase()}/:token`;
  }
  return path;
}

// Exactly what the sheet says it sends: the page and the device. The path only,
// never the query or hash, which can carry invite tokens and search text, and
// with any token in the path itself replaced.
export function describeFeedbackContext(win = typeof window === "undefined" ? undefined : window) {
  const page = redactPage(win?.location?.pathname || "");
  const agent = win?.navigator?.userAgent || "";
  const size = win?.innerWidth && win?.innerHeight ? `${win.innerWidth}×${win.innerHeight}` : "";
  return { page, device: [agent, size].filter(Boolean).join(" · "), build: APP_BUILD_ID || "" };
}

// Reports need an account: the error screen asks before offering one, because
// a crash on a signed-out page leaves no way to sign in from there.
export async function hasFeedbackSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
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
