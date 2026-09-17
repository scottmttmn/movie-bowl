function normalizeComparableTitle(title) {
  return String(title || "").trim().toLocaleLowerCase();
}

export function getLanguageName(languageCode, locale = "en") {
  const code = String(languageCode || "").trim().toLowerCase();
  if (!code) return "";

  try {
    if (typeof Intl?.DisplayNames === "function") {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) || code.toUpperCase();
    }
  } catch {
    // Older TV WebViews may not ship Intl.DisplayNames for every language.
  }

  return code.toUpperCase();
}

export function getMovieIdentityLabel(movie, { locale = "en" } = {}) {
  const title = String(movie?.title || "").trim();
  const originalTitle = String(movie?.original_title || "").trim();
  const languageCode = String(movie?.original_language || "").trim().toLowerCase();
  const titleDiffers = Boolean(
    originalTitle && normalizeComparableTitle(originalTitle) !== normalizeComparableTitle(title)
  );
  const languageDiffers = Boolean(languageCode && languageCode !== "en");

  if (!titleDiffers && !languageDiffers) return "";

  const parts = [];
  if (titleDiffers) parts.push(`Original: ${originalTitle}`);
  if (languageDiffers) parts.push(getLanguageName(languageCode, locale));
  return parts.join(" · ");
}
