# TV Draw Filters and Per-TV Preferences

Status: partly implemented September 4, 2026. The settings layer and every
boolean toggle are built (`src/tv/utils/tvDrawSettings.js`,
`src/tv/hooks/useTvDrawSettings.js`, `src/tv/components/TvDrawPreferences.jsx`).
Ratings are still to come. Genres and runtime stay phone-only by design — see
[What is editable on TV](#what-is-editable-on-tv).

## Decision Summary

TV can change the draw filters, and what it changes belongs to that television
rather than to the account.

Two kinds of preference, with different owners:

- **Account settings are my usual preferences.** They follow the person across
  every surface and every bowl, and are edited on the phone.
- **TV settings are what this room is in the mood for tonight.** They belong to
  one television and never leave it.

That split is the point of the feature. Relaxing a filter so the group can draw
something tonight should not quietly rewrite the preferences someone browses
with on their phone tomorrow.

## Why per-TV rather than account-wide

The television is a shared surface reached through one person's account. Anyone
in the room can pick up the remote, so a change made there is the group's
choice, not the account owner's. Writing it to the account would let whoever
holds the remote alter the owner's next solo draw, in every bowl, permanently.

## Where the settings live

On the television, in its own browser storage, keyed by account — the pattern
the TV already uses for its last-opened bowl and its recent-trailer list.

No new table, no device registry, and no server-side device identity. That is
worth stating plainly because it looks like a gap:

- A paired TV has no durable identity today. The pairing request lives at most
  fifteen minutes, is exchanged for an ordinary session, and is then consumed.
  Afterwards nothing distinguishes the living-room television from a phone.
- The usual objection to device storage is durability, and here it mostly
  dissolves. If the television's storage is cleared it loses its session too and
  has to pair again. Device-local preferences last exactly as long as that
  television's login does.

Follow the repository's rule for browser storage: wrap every read and write in
try/catch, and degrade rather than break. When storage is unavailable the TV
falls back to the account settings, which is today's behaviour — the worst case
is the feature being absent, never a broken screen.

## How the two layers combine

Store **only the settings someone actually changed on that television**, as a
sparse patch over the account settings. Not a snapshot.

The difference matters. With a sparse patch, turning off streaming priority on
the TV diverges that one setting; a ratings change made later on the phone still
reaches the television, because the television never had an opinion about
ratings. Settings added in future follow the account until someone touches them
on the TV.

With a snapshot, the first TV change silently freezes everything else, and a
later phone change appears to do nothing with no way to tell why.

## What the feature needs to be usable

**A way back.** A `Use my phone's settings` action clears the television's
overrides. Without it a TV drifts permanently and nobody remembers what was set
six months ago.

**Visible divergence.** The preferences sidebar already lists what is active; it
marks which lines are set on this television. Otherwise someone changes a filter
on their phone, sees no effect in the living room, and reasonably concludes the
app is broken.

As built, the sidebar *is* the control: a row that reports a setting is the row
that changes it, because on a D-pad a separate settings screen means navigating
away from the thing being described and back again. A circled mark is what says
a row can be changed; the phone-only facts keep their place in the list without
one. Divergence is a dot plus visually hidden text rather than a label, which
would otherwise repeat itself down the whole column.

## What is editable on TV

The remote is a D-pad, so the controls have to suit it.

| Setting | On TV | Why |
| --- | --- | --- |
| Prioritize streaming | Yes | A toggle |
| Use service ranking | Yes | A toggle |
| Include unknown ratings / genres / runtime | Yes | Toggles |
| Ratings | Yes | Five options; a short list of toggles suits a D-pad |
| Theater mode | Yes | Already a per-television concern |
| Genres | Not in the first version | A long multi-select; arrowing through dozens of checkboxes is miserable. Wants presets or a different control, designed on its own |
| Runtime | Not in the first version | A min/max range. Sliders are poor with a D-pad; steppers or a few presets would work, and that is its own design |
| Streaming services | No | Describes what the account subscribes to, not what this room prefers |
| Draw method | No | Per bowl and owner-controlled |

Genres and runtime keep pointing at the phone until they have a control that
suits a remote. Shipping them badly is worse than not shipping them.

## Effect on the draw

Draw options are already assembled on the client from these settings, so a
television's preferences narrow the draws made in that room and nowhere else.
That is the intended behaviour, not a limitation: the group gathered around the
television is the group the filter is for.

## Relationship to Theater mode

This settles an open question in
[`tv-theater-mode.md`](tv-theater-mode.md), which asks whether Theater mode
should be a user preference, a per-TV preference, or chosen each movie night.
Under this model it is plainly per-TV: it describes the room and the screen, not
the person.

## Settled: persistence

A television's settings persist until someone changes them back, rather than
resetting when the app restarts. Persisting matches *this television runs a bit
differently*; resetting would match *tonight only*, and would make the group
relax the same filter every movie night.

The risk of a persistent setting is that people forget they made it, so the two
things that answer it are part of the feature rather than polish: the reset
action, and the divergence marking that shows which lines this television is
deciding for itself.

## Verification

Cover at minimum:

- a TV change leaves the account settings untouched, confirmed from the phone;
- a phone change reaches the TV for every setting the TV has not overridden;
- a phone change does not disturb a setting the TV has overridden;
- `Use my phone's settings` clears every override at once;
- the sidebar marks exactly the overridden lines;
- unavailable or throwing browser storage falls back to account settings with
  the screen intact;
- two televisions on the same account keep separate settings;
- overrides survive a reload and an app restart;
- the draw uses the television's settings for draws made there; and
- remote-only operation of every control added, including the reset.

## Still to do

- **Ratings on TV.** Five toggles, which suit a D-pad; the row is currently a
  phone-only fact.
- **Revisit `MB-T03`.** The television shows `Drawing from up to N` for a bowl
  whose metadata the daily cron has not fully cached, on the grounds that an
  exact count is only worth resolving where a person can act on it. That
  argument was always scoped to a television that could not change filters.
