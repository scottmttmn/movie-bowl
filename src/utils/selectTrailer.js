export function selectOfficialTrailer(videos) {
  const items = Array.isArray(videos) ? videos : [];

  const officialYouTubeTrailers = items.filter(
    (video) =>
      video?.site === "YouTube" &&
      video?.type === "Trailer" &&
      video?.official === true &&
      typeof video?.key === "string" &&
      video.key.trim()
  );

  const preferred =
    officialYouTubeTrailers.find((video) => String(video.iso_639_1 || "").toLowerCase() === "en") ||
    officialYouTubeTrailers[0];

  if (!preferred) return null;

  const key = preferred.key.trim();

  return {
    site: "YouTube",
    key,
    name: preferred.name || null,
    type: preferred.type || "Trailer",
    official: true,
    publishedAt: preferred.published_at || null,
    embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(key)}`,
  };
}

