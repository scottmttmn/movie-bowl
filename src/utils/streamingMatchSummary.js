export const STREAMING_MATCH_TONE = {
  idle: "idle",
  active: "active",
  warning: "warning",
};

// The phone chip and the TV preference panel say the same thing about the same
// state, so the words live here rather than in either surface. Callers get the
// parts (so the count can be emphasized) plus the assembled sentence.
export function describeStreamingMatch({
  matchCount = 0,
  topService = null,
  topServiceCount = 0,
  isPrioritized = false,
  useServiceRank = true,
} = {}) {
  const build = (tone, lead, count, trail, label) => ({
    tone,
    lead,
    count,
    trail,
    text: [lead, count === null ? "" : String(count), trail].filter(Boolean).join(" "),
    label,
  });

  if (!isPrioritized) {
    return build(
      STREAMING_MATCH_TONE.idle,
      "",
      matchCount,
      "on your services",
      `${matchCount} remaining titles are on your streaming services. The draw is not filtered by them.`
    );
  }

  if (matchCount === 0) {
    return build(
      STREAMING_MATCH_TONE.warning,
      "No matches — drawing from all",
      null,
      "",
      "No remaining titles are on your streaming services, so the draw falls back to every title."
    );
  }

  // Ranked prioritization keeps only the highest-ranked service that matched,
  // so that service's tally is the pool rather than every match.
  if (useServiceRank && topService) {
    return build(
      STREAMING_MATCH_TONE.active,
      "Favoring",
      topServiceCount,
      `on ${topService}`,
      `The draw is favoring the ${topServiceCount} remaining titles on ${topService}, your highest-ranked matching service.`
    );
  }

  return build(
    STREAMING_MATCH_TONE.active,
    "Favoring",
    matchCount,
    "on your services",
    `The draw is favoring the ${matchCount} remaining titles on your streaming services.`
  );
}
