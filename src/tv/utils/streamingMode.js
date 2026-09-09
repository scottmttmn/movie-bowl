/**
 * Streaming priority as one setting instead of two booleans.
 *
 * `prioritizeStreaming` and `useStreamingRank` were never independent --
 * ranking means nothing while prioritizing is off -- and as separate rows the
 * second appeared and disappeared under the first, which on a D-pad moves a
 * focus target out from under whoever was aiming at it.
 *
 * Ordered so the control reads as one dial from "do not narrow" to "narrow
 * hardest". Off stays a mode rather than a missing one: it is the account
 * default, so it is the state most televisions are already in.
 */
export const STREAMING_MODES = ["off", "all", "top"];

// Ranking one service against itself is not a choice. With a single service
// the middle mode is the whole of "on", so the third would be offering a
// distinction the draw cannot make.
export function getStreamingModes(services) {
  return services.length > 1 ? STREAMING_MODES : ["off", "all"];
}

export function getStreamingMode(settings) {
  if (!settings?.prioritizeStreaming) return "off";
  return settings.useStreamingRank ? "top" : "all";
}

// "off" leaves useStreamingRank alone: it says nothing while priority is off,
// and preserving it means turning priority back on returns the television to
// the mode it was in rather than to a default.
export function getStreamingModeSettings(mode) {
  if (mode === "off") return { prioritizeStreaming: false };
  return { prioritizeStreaming: true, useStreamingRank: mode === "top" };
}
