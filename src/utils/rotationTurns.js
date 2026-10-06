/**
 * Places in line from the rotation queue, keyed by contributor bucket. Every
 * person who has never been drawn shares the first place, because the draw
 * breaks that tie at random -- listing them one after another would promise
 * an order nobody has decided. Everyone after them has a place of their own.
 */
export function getRotationTurns(queue) {
  const turns = new Map();
  if (!Array.isArray(queue)) return turns;
  let place = 0;
  let previousNeverDrawn = false;
  queue.forEach((entry, index) => {
    const key = entry?.bucket_key;
    if (!key || turns.has(key)) return;
    const neverDrawn = Boolean(entry.never_drawn);
    if (index > 0 && !(neverDrawn && previousNeverDrawn)) place += 1;
    turns.set(key, place);
    previousNeverDrawn = neverDrawn;
  });
  return turns;
}

// Rows in turn order; anyone the line does not include (no title in tonight's
// draw) keeps their place after everyone who has one.
export function sortRowsByTurn(rows, turns) {
  if (!turns?.size) return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const turnA = turns.has(a.row.key) ? turns.get(a.row.key) : Infinity;
      const turnB = turns.has(b.row.key) ? turns.get(b.row.key) : Infinity;
      return turnA === turnB ? a.index - b.index : turnA - turnB;
    })
    .map(({ row }) => row);
}
