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

// TMDB has no field saying which release a trailer was cut for, and for an
// older film the studio's newest official trailer is usually an anniversary,
// restoration or home-video campaign. The name is the only place that is ever
// admitted. Resolution words stay out: "4K Trailer" is how an original gets
// re-uploaded, and a restoration names itself.
//
// Upload date cannot date a trailer on its own. Lucasfilm uploaded the
// re-release trailers for Star Wars and Empire as plain "Trailer" a year before
// the originals, so preferring the earliest upload picked the wrong cut for both.
const ORIGINAL_PATTERN = /\b(original|theatrical)\b/i;
const REISSUE_PATTERN =
  /\b(anniversary|re-?release|re-?issue|remaster(ed)?|restor(ed|ation)|blu-?ray|dvd|digital|home\s+(entertainment|video)|collection|disney\+|streaming|(special|extended|platinum|diamond|signature|ultimate|collector'?s)\s+edition|final\s+cut|director'?s\s+cut|big\s+screen\s+classics|fathom|ghibli\s+fest)\b/i;

// 3D and IMAX trailers were cut for plenty of first releases, so these only
// count against a video uploaded well after the film came out -- which is how
// Finding Nemo's 3D re-release and Jaws in IMAX present themselves.
const LATE_FORMAT_PATTERN = /\b(3-?d|imax)\b/i;
const LATE_UPLOAD_YEARS = 2;

// TMDB types plenty of TV spots and named promos ("Just Ken Exclusive",
// "Special Look") as Trailer, and lists them first because they are newest. A
// name that never calls itself a trailer ranks with them: it is the most
// reliable sign a row is marketing rather than the trailer itself.
const NOT_A_TRAILER_PATTERN = /\b(spot|sneak\s+peek|extended\s+look|featurette|clip|commercial)\b/i;
const TRAILER_WORD_PATTERN = /\b(trailers?|teaser|preview)\b/i;

const YEAR_PATTERN = /\b(19[2-9]\d|20[0-3]\d)\b/g;

function getYear(value) {
  const year = Number(String(value || "").slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The film's own title comes out first, or "2001: A Space Odyssey" and "2012"
// would read as years decades after their own releases.
function getNamedYears(name, filmTitle) {
  const title = String(filmTitle || "").trim();
  const withoutTitle = title ? name.replace(new RegExp(escapeRegExp(title), "gi"), " ") : name;
  return [...withoutTitle.matchAll(YEAR_PATTERN)].map((match) => Number(match[1]));
}

function describeVideo(video, { releaseYear, title }) {
  const name = String(video?.name || "");
  const namedYears = releaseYear ? getNamedYears(name, title) : [];
  const uploadYear = getYear(video?.published_at);

  const isReissue =
    REISSUE_PATTERN.test(name) ||
    namedYears.some((year) => year > releaseYear + 1) ||
    Boolean(releaseYear && uploadYear && uploadYear > releaseYear + LATE_UPLOAD_YEARS && LATE_FORMAT_PATTERN.test(name));
  const isOriginal =
    !isReissue && (ORIGINAL_PATTERN.test(name) || namedYears.includes(releaseYear));
  const isTrailerCut = !NOT_A_TRAILER_PATTERN.test(name) && TRAILER_WORD_PATTERN.test(name);

  return { isReissue, isOriginal, isTrailerCut };
}

// Tiers, best first:
//   0 official, no sign of a re-release
//   1 unofficial, but naming itself the original or theatrical cut
//   2 official re-release
//   3 unofficial, no sign either way
//   4 unofficial re-release
// Tier 1 sits above tier 2 because the unofficial originals that survive the
// fan-edit filter are archive scans and classic-trailer channels -- the actual
// trailer, where an official anniversary cut is a different one. Within a tier
// a real trailer beats a spot or promo, then a trailer beats a teaser, then an
// original beats a neutral name, then English.
function getRank(video, context) {
  const official = video.official === true;
  const { isReissue, isOriginal, isTrailerCut } = describeVideo(video, context);

  let tier;
  if (official) tier = isReissue ? 2 : 0;
  else if (isOriginal) tier = 1;
  else tier = isReissue ? 4 : 3;

  const cutRank = isTrailerCut ? getTypeRank(video) : 2;
  const releaseRank = isReissue ? 2 : isOriginal ? 0 : 1;
  const languageRank = String(video.iso_639_1 || "").toLowerCase() === "en" ? 0 : 1;

  return tier * 24 + cutRank * 6 + releaseRank * 2 + languageRank;
}

// YouTube refuses some trailers inside an embed -- age-restricted ones and ones
// whose uploader turned embedding off -- and nothing in TMDB's rows says which.
// The player reports it the moment a video loads, so the best trailer carries
// the next few in rank order and each player works down them. A sample of the
// 1,000 most-voted films found every recoverable refusal within three tries.
const MAX_FALLBACKS = 4;

function toTrailer(video) {
  const key = video.key.trim();

  return {
    site: "YouTube",
    key,
    name: video.name || null,
    type: video.type,
    official: video.official === true,
    publishedAt: video.published_at || null,
    embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(key)}`,
  };
}

/**
 * Picks the video a pre-roll or a detail screen should play, with the next-best
 * videos on `fallbacks` for when YouTube will not play it. `releaseDate` and
 * `title` come from the same TMDB details response; without them the ranking
 * still works, it just cannot use the years a name mentions.
 */
export function selectBestTrailer(videos, { releaseDate = null, title = "" } = {}) {
  const items = Array.isArray(videos) ? videos : [];
  const context = { releaseYear: getYear(releaseDate), title };

  const seenKeys = new Set();
  const ranked = [];
  for (const video of items) {
    if (!isUsable(video)) continue;
    const key = video.key.trim();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    ranked.push({ video, rank: getRank(video, context) });
  }

  if (ranked.length === 0) return null;

  // Sort is stable, so the first video TMDB lists still wins its own tier.
  ranked.sort((first, second) => first.rank - second.rank);
  const [best, ...rest] = ranked.map(({ video }) => toTrailer(video));

  return { ...best, fallbacks: rest.slice(0, MAX_FALLBACKS) };
}
