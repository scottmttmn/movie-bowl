import { supabase } from "./supabase";

const SAVE_ERROR = "Could not update your link. Please try again.";

function toLink(data) {
  if (!data?.token) return null;
  return { token: String(data.token), includeComments: data.include_comments === true };
}

export function getWatchHistoryShareUrl(token, origin = window.location.origin) {
  return `${origin}/w/${encodeURIComponent(token)}`;
}

/**
 * Your own Watch History link, or null when you have none.
 *
 * A failed read also resolves to null, with `ok: false`: the page then offers
 * to make a link, and making one returns the existing link rather than a
 * second, so the worst case is the button looking off for a moment.
 */
export async function fetchMyWatchHistoryShareLink() {
  try {
    const { data, error } = await supabase.rpc("get_my_watch_history_share_link");
    if (error) {
      console.error("[watchHistoryShare] Failed to load your link", error);
      return { ok: false, link: null };
    }
    return { ok: true, link: toLink(data) };
  } catch (error) {
    console.error("[watchHistoryShare] Unexpected error loading your link", error);
    return { ok: false, link: null };
  }
}

/**
 * Makes your link if you have none, otherwise only changes whether your
 * comments show. The database keeps the token, so this never breaks a link
 * already sent to someone.
 */
export async function saveMyWatchHistoryShareLink({ includeComments }) {
  try {
    const { data, error } = await supabase.rpc("save_my_watch_history_share_link", {
      p_include_comments: Boolean(includeComments),
    });
    const link = toLink(data);
    if (error || !link) {
      console.error("[watchHistoryShare] Failed to save your link", error);
      return { ok: false, message: SAVE_ERROR };
    }
    return { ok: true, link };
  } catch (error) {
    console.error("[watchHistoryShare] Unexpected error saving your link", error);
    return { ok: false, message: SAVE_ERROR };
  }
}

export async function deleteMyWatchHistoryShareLink() {
  try {
    const { error } = await supabase.rpc("delete_my_watch_history_share_link");
    if (error) {
      console.error("[watchHistoryShare] Failed to turn off your link", error);
      return { ok: false, message: "Could not turn off your link. Please try again." };
    }
    return { ok: true };
  } catch (error) {
    console.error("[watchHistoryShare] Unexpected error turning off your link", error);
    return { ok: false, message: "Could not turn off your link. Please try again." };
  }
}

/**
 * What a link shows. `status` is "ready", "off" (unknown or turned off, which
 * the database deliberately does not tell apart) or "error".
 */
export async function fetchSharedWatchHistory(token) {
  if (!token) return { status: "off" };

  try {
    const { data, error } = await supabase.rpc("get_shared_watch_history", { p_token: token });
    if (error) {
      console.error("[watchHistoryShare] Failed to load a shared history", error);
      return { status: "error" };
    }
    if (!data) return { status: "off" };
    return {
      status: "ready",
      displayName: data.display_name || "",
      includeComments: data.include_comments === true,
      entries: Array.isArray(data.entries) ? data.entries : [],
    };
  } catch (error) {
    console.error("[watchHistoryShare] Unexpected error loading a shared history", error);
    return { status: "error" };
  }
}
