import { getContributorBucketKey, getMovieAttributionLabel } from "./drawBuckets";
import { getDrawablePoolMovies } from "./drawPool";
import { getDisplayInitial, getProfileDisplayName } from "./profileIdentity";

/**
 * The bowl's people as the people sheet lists them: every member, then anyone
 * who added through a link, each with how many of their movies are in the
 * draw. Counts follow the same contributor buckets the draw uses, so a person
 * is "left out" exactly when the draw cannot reach them.
 *
 * Older bowls can have an owner with no `bowl_members` row, which the member
 * count already includes, so the owner is added from `ownerId` when missing.
 *
 * `eligibleMovieIds` is the resolved pool after filters, or null when there is
 * none to compare against; then every movie counts and nobody is left out.
 */
export function buildBowlPeopleRows({
  members = [],
  movies = [],
  eligibleMovieIds = null,
  ownerId = null,
  ownerName = null,
  names = {},
  currentUserId = null,
}) {
  const eligible = eligibleMovieIds ? new Set(eligibleMovieIds.map(String)) : null;
  const totals = new Map();
  const inDraw = new Map();
  const guestLabels = new Map();

  getDrawablePoolMovies(movies).forEach((movie) => {
    const key = getContributorBucketKey(movie);
    // Starter pack titles belong to no one, so they are nobody's count.
    if (key === null) return;
    totals.set(key, (totals.get(key) || 0) + 1);
    if (!eligible || eligible.has(String(movie.id))) {
      inDraw.set(key, (inDraw.get(key) || 0) + 1);
    }
    if (key.startsWith("guest:") && !guestLabels.get(key)) {
      guestLabels.set(key, getMovieAttributionLabel(movie) || "Link guest");
    }
  });

  const describe = (key, name, extra = {}) => {
    const total = totals.get(key) || 0;
    const count = inDraw.get(key) || 0;
    return {
      key,
      name,
      initial: getDisplayInitial(name),
      count,
      isLeftOut: Boolean(eligible) && total > 0 && count === 0,
      isOwner: false,
      isYou: false,
      ...extra,
    };
  };

  const roster = ownerId && !members.some((member) => member.userId === ownerId)
    ? [{ userId: ownerId, role: "Owner", displayName: ownerName }, ...members]
    : members;

  const memberRows = roster
    .map((member) =>
      describe(`user:${member.userId}`, getProfileDisplayName({ display_name: member.displayName }, member.userId), {
        isOwner: member.userId === ownerId || member.role === "Owner",
        isYou: member.userId === currentUserId,
      })
    )
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));

  // Someone who left keeps their undrawn movies in the bowl, and the draw still
  // reaches them, so they are listed after the members like a link guest.
  const rosterKeys = new Set(memberRows.map((row) => row.key));
  const formerRows = [...totals.keys()]
    .filter((key) => key.startsWith("user:") && !rosterKeys.has(key))
    .map((key) => {
      const userId = key.slice("user:".length);
      return describe(key, getProfileDisplayName({ display_name: names[userId] || null }, userId), {
        isYou: userId === currentUserId,
      });
    });

  const guestRows = [...guestLabels.entries()]
    .map(([key, label]) => describe(key, label))
    .concat(formerRows)
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...memberRows, ...guestRows];
}
