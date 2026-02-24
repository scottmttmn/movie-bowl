export function checkContributionBalance({
  movies = [],
  memberIds = [],
  userId,
  maxLead,
}) {
  if (!userId) {
    return { allowed: true, myCount: 0, minCount: 0 };
  }

  const normalizedLead = Number(maxLead);
  if (!Number.isFinite(normalizedLead) || normalizedLead < 0) {
    return { allowed: true, myCount: 0, minCount: 0 };
  }

  const activeMembers = new Set((memberIds || []).filter(Boolean));
  activeMembers.add(userId);

  const counts = new Map();
  activeMembers.forEach((id) => counts.set(id, 0));

  // Only count contributions from active members. Movies from departed members remain
  // in the bowl but should not affect balancing.
  (movies || []).forEach((movie) => {
    const addedBy = movie?.added_by;
    if (!addedBy || !activeMembers.has(addedBy)) return;
    counts.set(addedBy, (counts.get(addedBy) || 0) + 1);
  });

  const myCount = counts.get(userId) || 0;
  const minCount = Math.min(...counts.values());
  const allowed = myCount - minCount < normalizedLead;

  return { allowed, myCount, minCount };
}

