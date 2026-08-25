# Five Bold Ideas

Status: brainstorm. Nothing here is scheduled, specified, or committed to. These
are deliberately larger than the `TODO.md` backlog — each one changes what Movie
Bowl *is*, not how a screen looks. Open questions are genuinely open.

The spine running through all five: Movie Bowl's real product is not a list, and
it is not a random number. It is **a fair, explainable ritual for deciding**.
Every idea below extends that promise. Anything that dilutes it — see
"Deliberately not on this list" — is out no matter how obvious it looks.

---

## 1. Showtime: make movie night a thing the app knows about

**The idea.** A draw currently assumes the person tapping is deciding for the
room. The contributor buckets do not: if three of six members are on the couch,
the other three still hold half the odds and can win a night they are not
present for. Showtime makes attendance explicit. Someone starts a night, people
join (a QR on the TV, a tap in the bowl), and the draw resolves against
contributors *who are here*. Rotation stops burning turns on absent people — a
turn is only spent when you were there to spend it.

**Why it fits.** The schema already treats attendance as real at write time: a
draw writes one `user_watch_events` row per participant. Showtime makes the same
idea true at *selection* time, which is where it actually changes the outcome.
The TV pairing flow (`/activate-tv`, `api/tv-pairing/*`) is already a
phone-approves-the-television handshake — joining a night is the same shape.

**Why it's bold.** It reframes the unit of the product from "a bowl" to "a
night," and a night is a thing you can schedule, remind people about, recap, and
miss. That is a much larger surface than a list with a shuffle button.

**Smallest bold version.** A "Who's here?" step in front of the draw on TV,
defaulting to everyone, plus attendance-scoped rotation. No scheduling, no
notifications.

**Risks and open questions.**
- Fairness copy. Person-first promises equal odds among contributors; "among
  contributors *present*" is a different promise and has to be said out loud in
  the `drawMethods` registry, not implied.
- A mis-set attendance list feels worse than an unlucky draw. Joining and
  leaving must work mid-night, and the fallback is always all members.
- Does a title added by someone absent stay eligible? (Probably yes — the pool
  is about people's turns, not people's titles. Needs a decision.)

---

## 2. The draw happens to everyone at once

**The idea.** Today one person taps and everyone else finds out by looking over
their shoulder. Put the reveal on every open client simultaneously over Supabase
Realtime — same couch or three time zones. Then go further and make the pull
itself collective: hold-to-draw already exists, so the draw fires when everyone
present is holding, and each device mixes entropy into the selection. Nobody
picked. Everybody pulled.

**Why it fits.** The hard part is already done. Rotation draws are atomic and
serialized in the database (`draw_bowl_movie_by_rotation` locks the bowl row), so
concurrent devices are already safe by construction. `utils/` takes `randomFn` as
an argument specifically so selection stays pure and testable — multi-party
entropy is a different `randomFn`, not a rewrite. What's missing is a
subscription and a reveal state machine.

**Why it's bold.** It is the first feature that makes Movie Bowl work for people
who are not in the same house, which is a different market than the one it has.
It also turns the app's most functional moment into its most emotional one.

**Smallest bold version.** Realtime reveal only: everyone watching the bowl sees
the same animation land at the same instant. Collective hold is phase two.

**Risks and open questions.**
- This puts a new failure mode inside the most sensitive flow in the repo. It
  has to degrade silently to exactly today's behavior when the socket is down —
  the offline work already established the copy patterns for that.
- What does a late joiner see: the reveal, or the result? (Result. A ceremony
  you missed is not a ceremony.)
- Collective hold needs a timeout and an override, or one person in the bathroom
  holds the night hostage.

---

## 3. Capture anywhere

**The idea.** The bowl only grows when someone remembers to open the app, but
almost no recommendation arrives while you are in it. They arrive in a text, in
a trailer on YouTube, in a Letterboxd link, at dinner — the movie-comments doc
literally uses "Recommended by Tim at dinner" as its example. Give each bowl a
capture endpoint: a share target from any app on an installed phone, a
forward-to-add email address, an iOS shortcut. The server resolves the title
against TMDB, adds it, and only asks a follow-up when the match is ambiguous.

**Why it fits.** `api/add-links/*` is already an authenticated-server,
not-signed-in write path into a bowl, with tokens, limits, and its own
authorization on the service-role client. A drop address is the same threat
model with a different transport. Titles TMDB cannot match already have a home:
negative synthetic `tmdb_id`s.

**Why it's bold.** Every other idea here makes movie night better for bowls that
are already full. This one is the only one that fixes the input problem, and
input is what decides whether a bowl is still alive in six months.

**Smallest bold version.** Web Share Target on the installed PWA, plus a
per-bowl forward-to-add email address. No SMS, no integrations.

**Risks and open questions.**
- It is an unauthenticated write path into a private bowl. Sender allowlist,
  rotation, revocation, and rate limits are part of the feature, not follow-ups.
- Ambiguous matches with no interactive session: hold in a pending tray for the
  next app open, or guess and let people fix it? (Pending tray. A wrong title
  silently in the bowl is worse than a title that shows up late.)
- Who is recorded as the contributor when a guest forwards? This decides odds,
  so it cannot be left implicit.

---

## 4. The stub: turn the bowl's memory into something you can hold

**The idea.** Two surfaces on top of history the app already keeps. First, every
draw mints a **ticket stub** — a shareable image in the app's own ticket
iconography: the movie, the bowl, the date, who was there, the contributor's
comment revealed. Second, a **season recap** per bowl: nights held, the longest
anyone waited between turns, the most-returned movie, whose picks the group
actually finished, and the title that has sat undrawn the longest.

**Why it fits.** `bowl_draw_events` is immutable by design, returns are
preserved as `returned_at` rather than deletions, `user_watch_events` survives
leaving or deleting the bowl, and comments now attach the *why*. This is the
richest data in the product and its entire current surface is a horizontal strip
and a CSV export. The ticket concept art is already sitting in
`output/designs/`.

**Why it's bold.** It converts a private utility into a group identity, and it is
the only growth loop here that does not require asking anyone to invite anyone —
a stub is a thing people post because it is about their friends.

**Smallest bold version.** The stub. One shareable image per draw, generated
server-side, opt-in per bowl.

**Risks and open questions.**
- Privacy is the whole design. A stub must never leak the undrawn list, and
  sharing must be opt-in per bowl with a way for a member to be left off.
- The recap must not become a leaderboard that shames returns. Returning a movie
  is a legitimate move the product deliberately supports; stats that punish it
  would quietly change behavior.
- Rendering images server-side is new infrastructure for this repo. Worth
  checking whether a static OG-image route is enough before reaching for more.

---

## 5. House rules: the draw method registry becomes a rules layer

**The idea.** `utils/drawMethods.js` is already a registry where each method owns
its selection mode *and* the copy every surface renders. Today the owner picks
one of three. Make the bowl instead declare its **house rules**, which the app
enforces and — critically — explains: attendance (idea 1), cooldowns ("you can't
win twice in a night"), veto tokens (N per season, public when spent, and using
one costs your next turn), personal ordering, within-person weights, the
once-per-day re-roll lockout already sitting in `TODO.md`.

**Why it fits.** Look at the backlog: personal movie ordering, within-person
weights, once-per-day lockout, solo draw. Those are four one-off settings today
and four rules under this model. `normalizeDrawMethod` already falls back safely
for values written by a newer deploy, which is exactly the forward-compatibility
a composable rule set needs.

**Why it's bold.** Groups already invent house rules out loud — the app that
writes them down, enforces them, and can state in one honest sentence what they
do to your odds owns something no streaming service is going to build.

**Smallest bold version.** Two composable rules on top of the existing method —
attendance and a cooldown — with a single generated disclosure sentence.

**Risks and open questions.**
- Explainability is the hard constraint, not correctness. Every combination must
  produce one true sentence about odds; a combination that cannot should not be
  offerable at all.
- Anything that changes odds has to run where rotation already runs — in the
  database, serialized — or two clients will disagree about whose turn it is.
- Combinatorics kill test coverage. A rules layer needs property-based tests
  over the composition, not one test per pair.

---

## Where I'd start

**Idea 3 first.** It is the cheapest, it compounds, and it fixes the input
problem every other idea assumes away. Ideas 1 and 2 are really one night seen
from two angles and should be designed together. Idea 4 is the highest ceiling
and the one most likely to be built at the wrong time — it wants a product with
a lot of history in it already. Idea 5 is the right refactor eventually and the
wrong one now: build two more rules as features first, then extract the layer
once the shape is obvious.

## Deliberately not on this list

**Recommendations.** Taste graphs, "movies like the ones your bowl finishes,"
algorithmic suggestion. It is the obvious idea and it is the wrong one: it
competes directly with the reason the product exists. Movie Bowl's promise is
that the *group* decides and the app is fair about it. An app that starts having
opinions about what you should watch is a worse version of five things you
already have.
