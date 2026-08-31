export function sortBowlsByRecentActivity(bowls) {
  const activity = (bowl) => new Date(bowl.lastActivityAt || 0).getTime() || 0;
  return [...bowls].sort((a, b) => activity(b) - activity(a)
    || String(a.name).localeCompare(String(b.name))
    || String(a.id).localeCompare(String(b.id)));
}

export function orderBowlChoices(bowls) {
  return [
    ...sortBowlsByRecentActivity(bowls.filter((bowl) => bowl.role === "Owner")),
    ...sortBowlsByRecentActivity(bowls.filter((bowl) => bowl.role !== "Owner")),
  ];
}
