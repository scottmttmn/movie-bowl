import { getSoloDrawGroups } from "./soloDrawSelection";

const SOLO_METHOD = {
  id: "solo",
  label: "Solo",
  steps: [{ title: "One of your titles, at random" }],
  revealPending: "Picking one of your titles",
};
const PINNED_METHOD = {
  ...SOLO_METHOD,
  steps: [{ title: "One favorite, at random" }],
  revealPending: "Picking one of your favorites",
};

// The same grouping as selection: copies get one slip, and eligible pins
// replace the pool. Bowls do not become piles in a draw among titles.
export function getSoloDrawRevealPreview(pool) {
  const groups = getSoloDrawGroups(pool);
  if (groups.length === 0) return null;
  return {
    methodId: "solo", stage: "bowl", mode: "random", people: [],
    sharedCount: 0, total: groups.length, scope: "solo",
    pinnedPool: groups.some((group) => group.isPinned),
  };
}

export function getSoloDrawReveal(pool) {
  const preview = getSoloDrawRevealPreview(pool);
  if (!preview) return null;
  return {
    methodId: "solo", person: null,
    title: { mode: "random", scope: "solo", count: preview.total, pinnedPool: preview.pinnedPool },
  };
}

export function getSoloDrawRevealMethod(preview) {
  return preview?.pinnedPool ? PINNED_METHOD : SOLO_METHOD;
}
