// TMDB's `official` flag is set by hand and is missing from plenty of genuine
// studio uploads, so refusing everything unofficial hid real trailers rather
// than fan edits. The Contribution Bible already bans fan-made videos, which
// makes most unflagged rows unverified rather than untrustworthy -- but that
// ban is enforced by moderation and not by the API, so a name that advertises
// a fan edit is still worth declining.
const FAN_EDIT_PATTERN =
  /\b(fan[\s-]?(made|edit|trailers?)|concept|recut|remix|mashup|reaction|review|breakdown|explained|honest\s+trailers?|parody)\b/i;

// A teaser is the same promotional footage cut short, so it is worth showing
// when nothing better exists. A clip is a scene from the film and belongs
// nowhere near a pre-roll.
const TYPE_RANKS = new Map([
  ["trailer", 0],
  ["teaser", 1],
]);

function getTypeRank(video) {
  return TYPE_RANKS.get(String(video?.type || "").toLowerCase());
}

function isUsable(video) {
  if (video?.site !== "YouTube") return false;
  if (typeof video?.key !== "string" || !video.key.trim()) return false;
  if (getTypeRank(video) === undefined) return false;
  if (video?.official !== true && FAN_EDIT_PATTERN.test(String(video?.name || ""))) {
    return false;
  }
  return true;
}

// Verified source first, then the fuller cut, then English: an official teaser
// is a safer thing to play than an unflagged upload calling itself the trailer.
function getRank(video) {
  const officialRank = video.official === true ? 0 : 1;
  const languageRank =
    String(video.iso_639_1 || "").toLowerCase() === "en" ? 0 : 1;
  return officialRank * 4 + getTypeRank(video) * 2 + languageRank;
}

export function selectBestTrailer(videos) {
  const items = Array.isArray(videos) ? videos : [];

  let best = null;
  let bestRank = Infinity;

  for (const video of items) {
    if (!isUsable(video)) continue;
    const rank = getRank(video);
    // Strictly better only, so the first video TMDB lists wins its own tier.
    if (rank < bestRank) {
      best = video;
      bestRank = rank;
    }
  }

  if (!best) return null;

  const key = best.key.trim();

  return {
    site: "YouTube",
    key,
    name: best.name || null,
    type: best.type,
    official: best.official === true,
    publishedAt: best.published_at || null,
    embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(key)}`,
  };
}
