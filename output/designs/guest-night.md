# Guest Night

Status: idea, recorded for later. Phase 1 is specified closely enough to build;
phases 2 and 3 are not. Nothing here is implemented. Open questions in each
phase are genuinely open.

## Product Idea

A shared bowl with someone you do not live with goes stale. You create it for a
visit, add six titles, use it once, and it sits there. The bowl model assumes
continuous co-habitation, but watching a movie with a friend is an *occasion* —
it happens on a Saturday and then not again for two months.

Guest night makes the sharing episodic instead of persistent. A friend comes
over, their titles join yours for one draw, the movie lands in both people's
watch histories, and nothing permanent is created. No bowl to name, no
invitation to accept, no membership to clean up afterward.

The reframe matters more than any single mechanic below: **this product's
multiplayer should be per-evening, not per-relationship.** Persistent shared
bowls are right for a household and wrong for everyone else.

## Why the Schema Already Fits

Most of the described behavior is what falls out of the existing tables rather
than something that has to be built.

`20260724123000_add_durable_watch_history.sql` split bowl activity from personal
activity, and the split lands exactly where guest night needs it:

- `bowl_draw_events` is the bowl's record, exposed by
  `bowl_draw_events_select_members`. A guest is not a member, so the draw does
  not appear in their app — only the host bowl's watched strip shows it.
- `user_watch_events` is personal, `user_watch_events_select_own`, and fully
  denormalized: `title`, `poster_path`, `genres`, and `bowl_name` are copied in
  as plain values, `source_draw_event_id` is nullable and `on delete set null`.
  Nothing about a watch event requires membership in the bowl it came from.

So "the movie shows in both histories but only the host's strip" is not a
feature to design. It is what happens if the draw writes a second
`user_watch_events` row. That is the single strongest argument for the idea.

Two more pieces of leverage:

- **Filters are already the host's.** `retire-draw-filter-defaults.md` put draw
  filters in `profiles.default_draw_settings` — per user, following that person
  across bowls, not per bowl. "Use the host's streaming services and priority"
  therefore means "use the filters of whoever's phone is running the draw,"
  which is the host by construction. No new mechanism, and no guest logging
  into services they do not have.
- **Anonymous guests already bucket as one person.** `getContributorBucketKey`
  buckets link adds under `guest:<name>`, so under person-first a guest who adds
  six titles counts once, not six times. Noted in `bowl-draw-methods.md` as a
  caveat for title-first; for guest night it is precisely the desired behavior.

Guest night is also the mirror of `solo-draw.md`. Solo draw is one person across
many bowls, writing *no* `bowl_draw_events` row. Guest night is many people
across many bowls, writing one `bowl_draw_events` row and extra
`user_watch_events` rows. Both need the same missing primitive: resolving one
eligible pool that spans more than one bowl. Whichever ships first should build
that primitive so the second one inherits it.

## Three Features, Not One

These are separable and increase sharply in cost. They are listed in the order
they should be considered, which is not the order they were thought of.

The bar to beat is not the coin flip. It is "the guest says three titles out
loud and the host types them," which takes ninety seconds and works today.

---

## Phase 1 — Recently-watched filter

Standalone and useful with no guest infrastructure at all. It does not depend on
phases 2 or 3, and it should ship first regardless of whether they ever do.

**Optional, not mandatory.** It is an ordinary draw filter that a person turns
on, sitting alongside rating, genre, and runtime in the "Narrow the draw"
overlay.

### What it actually catches

Worth being honest about the scope, because it is narrower than it first sounds.
`draw_bowl_movie` stamps `bowl_movies.drawn_at`, and a stamped slip leaves the
eligible pool for good. Within one bowl you already cannot re-draw what you just
watched. The filter earns its place in four other cases:

1. **Draws returned after the undo window.** `return_bowl_draw_to_bowl` deletes
   the generated `user_watch_events` rows only when the return happens within
   two hours (`20260831200000_bound_return_history_cleanup.sql`). Return it
   later and the title is back in the bowl *and* still in your history — you
   genuinely watched it and put it back. This is the clearest case.
2. **The same title sitting in two of your bowls.** Filters follow the user
   across bowls; so does watch history. Watch it in one bowl, and the copy in
   another stays drawable.
3. **Manually logged watches.** `create_manual_watch_event` records things you
   saw in a theater or on someone else's TV while your own slip stays undrawn.
4. **Re-added titles.**

### Where it goes

- **New keys in `profiles.default_draw_settings`.** No migration, no new table,
  no API route. The column, the normalization shape, and `saveDefaultDrawSettings`
  merge semantics are unchanged; the Filters overlay sends only its own keys.
  The TV picks it up on load like every other filter.
- **A new stage in `getResolvedDrawPool`, after runtime and before streaming
  priority.** The order is not cosmetic. Streaming prioritization falls back to
  the full incoming pool when nothing matches, so a recently-watched stage
  running *after* it would have its exclusions handed back by that fallback.
  It is an ordinary filter and belongs with the ordinary filters.
- Feeds `useDrawPoolCount` and `getStreamingPriorityPool`'s eligibility readouts
  like every other filter, so the live count and the phone/TV readouts agree.
- Gets its own specific empty-pool message, per the house rule that each filter
  explains itself when it empties the pool.

### Matching rule

Match on `tmdb_id` only where `Number(tmdb_id) > 0`. Custom titles carry
negative synthetic ids and `user_watch_events.tmdb_id` is nullable, so those and
manual entries fall back to a normalized-title comparison scoped to the same
user. The `includeUnknown` analog here is a toggle for whether hand-logged
watches count.

### Window

Off / 1 month / 3 months / 6 months / 1 year. Three months when first enabled.
No "ever" — this is a rewatch-friendly product and a permanent exclusion is a
different feature wearing the same label.

### Default: off

Open to argument, and it is a close call. Reasons for off:

- The house precedent is that new draw behavior does not silently change
  existing odds. `bowl-draw-methods.md` required its migration to be a no-op in
  observable behavior, and Reset restores shipped values.
- Given the scoping above, the filter usually does nothing. A stage that is
  normally inert and occasionally removes a title without being asked is a bad
  trade for a default.

The reason for on is that the people it helps most are the ones who never open
the Filters overlay. If that argument wins, the honest middle is not a silent
default but a post-draw nudge — "you watched this in March, redraw?" — which
teaches the setting instead of hiding it.

---

## Phase 2 — Guest adds a few titles for tonight

The cheap social version. The guest opens the host's public add link on their
own phone, drops in three to five titles, and the draw is an ordinary draw.

Almost all of this exists: `/add-to-bowl/:token`, `bowl_add_links`,
`consume_bowl_add_link`, `bowl_movies.added_via_link_id`, and `guest:<name>`
bucketing. **The guest never signs in**, which is most of the friction gone.

What is new is ephemerality: those slips should expire rather than silently
becoming permanent bowl members. They need a distinct look in the bowl, and an
answer for what happens to the unwatched ones at the end of the night.

What phase 2 cannot do is credit the guest's watch history or filter against
what they have seen, because nothing knows who they are. That is the whole
reason phase 3 exists.

---

## Phase 3 — Bring your whole bowl

The full idea. The guest signs in on their own phone, grants their bowl to one
evening's draw, and both people's histories and watch records participate.

### The permission

Mirror `bowl_add_links`: a scoped, expiring, single-use, revocable capability
token, consumed from the guest's phone. Same object, arrow reversed. The host
shows a code; the guest opens it, picks which of their bowls to bring, and
confirms. Nothing about this requires the guest to touch a television.

### The merged pool must be resolved server-side

Not a preference — RLS forces it. The host cannot read the guest's
`bowl_movies`, and `user_watch_events_select_own` means the host can never read
the guest's watch history from the client. A security-definer RPC returns the
merged, already-filtered candidate list. The host's client sees the guest's
candidate *titles*, which is the point, and never their viewing history, which
is not. The privacy-correct architecture is the only one that compiles.

All of it is RPC work. No new serverless function, which matters at 12/12 on
Vercel Hobby.

### Bucketing: by person present, not by contributor

Merging a three-contributor guest bowl into a two-contributor host bowl gives
the guest side 60% of the odds, which is not what "two people on a couch" means.
Guest sessions should re-key buckets to the *attendees* — an override in
`drawBuckets.js`, small — so it is one bucket each.

This also means guest night should **force person-first regardless of the bowl's
configured method**, and should not advance rotation. Title-first across a merged
pool is "whoever has the bigger library wins," and rotation is history-aware and
serialized in the database, so a guest evening would either corrupt the host
bowl's turn order or need an exemption. Forcing person-first is one sentence to
explain, which is the test `bowl-draw-methods.md` sets for method copy.

### Recently-watched across everyone present

The host's own history comes along free, since filters are per-user and follow
the drawing device. Only the guest's needs the RPC, and it is the same
comparison from phase 1 run over a second person's events.

Use the **union of everyone present**, not "whoever is not drawing." Your own
bowl is not self-clean — you watch things elsewhere and do not prune — and
scoping to the non-drawer means the same two people get a different pool
depending on who taps the button, which makes the odds readout shift for no
visible reason. "Skips anything anyone here has watched recently" is one
sentence; the alternative is a paragraph.

### Guest titles that lose to the host's filters

If the guest curated for one service and the host ranks another first,
`getStreamingPriorityPool` can leave zero guest titles eligible and the evening
silently becomes an ordinary host draw wearing a guest-night hat. The session
needs a readout before the draw — "9 of Sam's 40 titles play on your services" —
not a discovery afterward.

## Open Questions

- **`bowl_draw_events.source_bowl_movie_id` is a unique FK into `bowl_movies`.**
  If a guest's title wins, it points into the *guest's* bowl, and the host's
  watched strip now shows a movie that was never in the host bowl. Return-to-bowl
  becomes ambiguous: whose bowl does it return to? Options are a nullable
  `guest_source_bowl_id` alongside it, or treating guest titles as snapshot-only
  with no return path. This is the real design decision in phase 3, and it is
  not a permissions problem.
- Does a guest evening advance the host bowl's rotation history? Proposed: no.
- The guest's watch event carries `bowl_name` for a bowl they cannot open. Is
  that confusing, or is it the good part — "Movie Night at Sam's" showing up in
  their history months later?
- Do the guest's unwatched titles vanish at the end of the night, or does the
  host get an offer to keep any of them?
- What does the guest see on their own phone during the draw — nothing, a
  spectator view, or the ability to tap Draw themselves?

## Deferred

- More than two people. Everything above assumes one host and one guest; the
  bucketing generalizes, the UI does not.
- Any notion of a persistent "friend" relationship. Guest night exists
  specifically to avoid creating one.
- Guest participation from a television. The permission is designed for phones
  on purpose.
