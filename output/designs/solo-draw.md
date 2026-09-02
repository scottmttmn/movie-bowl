# Solo Draw

Status: idea, recorded for later. Not specified in detail and not scheduled.
Open questions below are genuinely open — they should be answered before this
gets a build plan.

## Product Idea

Sometimes you are watching alone. You still want the bowl to decide for you, but
it should not spend the group's movie night. Solo draw picks from **only your own
titles** — in one bowl, or pooled across every bowl you belong to — and keeps the
result private: the other members never see it in the bowl's history, and the
title leaves the bowl so it cannot be drawn again for the group.

The draw itself is still a draw. The point is not to browse and pick; it is to
hand the choice to the bowl on a night when nobody else is in the room.

## Why the Schema Already Fits

`20260724123000_add_durable_watch_history.sql` split bowl activity from personal
activity into two tables, and that split is exactly what this feature needs:

- `bowl_draw_events` — the bowl's shared, immutable record. RLS exposes it to
  every member (`bowl_draw_events_select_members`).
- `user_watch_events` — a person's own record, already carrying a
  `source_kind check (source_kind in ('bowl_draw', 'manual'))` and readable only
  by its owner.

`draw_bowl_movie` today does three things in one transaction: stamps
`bowl_movies.drawn_at/drawn_by`, inserts one `bowl_draw_events` row, and inserts
`user_watch_events` rows for participants.

A solo draw is the same transaction **minus the `bowl_draw_events` insert**, with
a new `source_kind` such as `'solo_draw'`. That single omission produces the whole
requested behavior: the title is gone from the bowl, it is in your watch list, and
it is in nobody else's. No new tables.

## The Real Conflict

"Removed from the bowl" and "invisible to the other members" cannot both be fully
true. If `bowl_movies.drawn_at` is stamped with no corresponding draw event, the
title vanishes from every member's remaining list with no trace anywhere they can
see it — a silent hole in a shared object. Someone will eventually ask where a
movie went, and the app will have no answer.

Options, roughly in order of how much they respect the group:

1. **Silent removal.** Exactly as asked. Simplest, and the hole is real.
2. **Visible withdrawal, private title.** The bowl shows that *a* title left the
   pool and who removed it, without naming the movie or creating a draw event.
   Preserves the accounting; keeps the pick private. Probably the honest default.
3. **Named but not a draw.** The bowl shows "Scott watched this solo" as a
   distinct, non-draw event. Most transparent; least private.
4. **No removal at all.** You watched it; the group still might want to. The
   title stays drawable. This is a materially different feature — "solo pick"
   rather than "solo draw" — and it sidesteps the conflict entirely.

Worth noting that (4) is the only option where nothing is taken from the group,
and the fact that it removes the tension is an argument for it.

### Why (4) may be most of the feature

The aftermath of watching alone already shipped. Logging a manual watch on the
Watch List finds your own undrawn slips of that title and offers to pull them
out of whichever bowls hold them (`handleRemoveFromBowls`, scoped to
`added_by = auth.uid()` and `drawn_at is null` — the comment above it explains
that RLS would let a bowl owner delete other people's slips, so the client
deliberately does not offer that). It is an offer, not automatic.

So the existing path already covers recording the watch, and removing the title
when you want it removed. Everything solo draw adds on top of that is the
*picking* — the part where you hand the choice to the bowl instead of choosing.

That reframes the cost. Under option (4), solo pick writes nothing to any bowl:
it selects from your own undrawn titles, shows you one, and stops. No
`draw_solo_movie` RPC, no new `source_kind`, no reversibility path, no draw
permission question, and no visibility decision — because nothing left the pool
and no other member's view changed. If you then watch it, you log it the normal
way, and the shipped removal offer handles the slip.
`create_manual_watch_event` already accepts the whole snapshot
(`p_tmdb_id`, `p_poster_path`, `p_release_date`, `p_runtime`, `p_genres`,
`p_overview`, `p_note`), so a solo pick screen can hand its chosen title
straight to that call with the fields prefilled.

Nearly every open question below exists only because options (1) through (3)
take a title away from the group. Option (4) does not, and most of them stop
applying. The remaining question is the honest one: on a night alone, is "the
bowl chose it" actually what you want, or would you just pick something? That
is worth answering before building even the cheap version.

## Open Questions

- **Is it reversible?** The existing "return to bowl" flow works off
  `bowl_draw_events.returned_at`, and `source_bowl_movie_id` is `unique` on that
  table. A solo draw with no draw event has nothing to return, so undo would need
  its own path — or its own nullable marker on `bowl_movies`.
- **Does it require draw permission?** `can_draw_from_bowl` gates drawing today.
  A solo draw does not consume the group's turn, which argues no; but it does
  permanently remove a title from a shared pool, which argues yes. Leaning yes,
  because the removal is the part that affects other people.
- **What is the cross-bowl scope?** Pooling across all your bowls is a different
  surface from the bowl dashboard — closer to "draw from my library." Each
  candidate still carries its own `bowl_id`, so the per-title permission check and
  removal stay per-bowl; but the entry point, the empty state, and the result
  screen would all be new UI rather than a toggle on an existing screen.
- **Which filters apply?** Your own default draw settings (rating, genre,
  runtime, streaming priority) are the obvious answer and need no new plumbing.
- **What does the bowl's draw method mean here?** Nothing: a solo pool has one
  contributor, so person-first, title-first, and rotation all collapse to a
  uniform pick over your own titles. The one setting that would still matter is
  within-person title weights — see `bowl-draw-methods.md`. Solo draw and those
  weights are the same selection step, which is a good reason to build weights
  first.

## Sketch of the Work

Not a plan, just scale. A first version scoped to a single bowl would need a
`draw_solo_movie(p_bowl_movie_id)` RPC alongside `draw_bowl_movie`, a
`'solo_draw'` value on the `user_watch_events.source_kind` check, a candidate
filter on `added_by = auth.uid()` before the existing selection pipeline, an
entry point on the bowl dashboard, and whichever visibility option above gets
chosen. Cross-bowl pooling is a second, larger phase and should not gate the
first.

The solo-pick version of the same idea is a fraction of that: the candidate
filter, a selection call over the resolved pool, and a screen. It touches no
migration and no RPC, and it hands off to `create_manual_watch_event` if the
night goes ahead. If solo draw is ever built, this is the version to try first —
not as a compromise, but because it is small enough to learn from.
