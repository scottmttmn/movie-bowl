# Future Ideas

Status: brainstorm, except for idea 3, which has a design specification and
implementation plan linked below. Nothing here is implemented by this document
or scheduled. These are deliberately larger than the `TODO.md` backlog — each
one changes what Movie Bowl *is*, not how a screen looks.

The spine running through all of them: Movie Bowl's real product is not a list,
and it is not a random number. It is **a fair, explainable ritual for deciding**.
Every idea below extends that promise. Anything that dilutes it — see
"Deliberately not on this list" — is out no matter how obvious it looks.

One piece of evidence worth writing down before anything else, because it should
decide what gets built: the app's owner watches more movies since it existed.
That is the outcome the product is for. Not titles added, not bowls created —
movies actually watched. Ideas 4 and 6 below are the two that take that number
seriously.

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

## 3. One bowl is the unit

**Design specification:** [Default Bowl and Global Add](default-bowl-and-global-add.md)
is the source of truth for the agreed behavior and UI. The
[implementation plan](default-bowl-and-global-add-implementation.md) resolves
persistence, migration, access repair, shared add state, testing, and rollout.
The first version is implemented locally as of August 31, 2026,
but has not been deployed. The concept and its original rationale remain here.
The next capture step now has a proposed
[Gemini-first voice roadmap](gemini-voice-capture.md); its Android App Action
spike is a release gate, not evidence that the integration already works.

**The idea.** Almost nobody has five bowls. People have one, maybe two. Before
this work, the app treated `/bowls` as its hub and put bowl additions inside
the dashboard. Adding cost navigation before it cost typing. Open the app, land
somewhere, get into the right bowl, find the add control, then search. The
search was never the expensive part.

Commit to one bowl as the default shape of the product:

- **A stable default bowl.** For new users, the first bowl they create or join
  becomes their default. Save the choice per account so it follows them across
  devices. Opening another bowl does not change it. This replaces `HomeRedirect`'s
  current last-opened routing convenience with an explicit product concept.
- **Add goes global.** A permanent plus/filmstrip button in `TopNav` wherever it
  appears for signed-in users opens the shared add dialog against the default
  bowl. Show the destination clearly in the modal; retain the existing bowl
  artwork beside the app name.
- **Multi-bowl becomes the exception path**, not a step everyone pays for. "Add
  to a different bowl" is a secondary control inside the modal: one extra tap in
  the rare case instead of a mandatory step in the common one. Switching for
  one addition does not change the saved default.
- **Home and the logo open the default bowl.** `/bowls` becomes the My Bowls
  management screen in the menu, where users can open another bowl or change
  their default.
- **Then voice capture is possible at all.** Prioritize Gemini on Android:
  “Hey Google, add Sinners to my Movie Bowl list” through an App Action works
  only when there is exactly one default destination and nothing to
  disambiguate at the bowl layer. Keep the capture contract assistant-neutral
  so Siri can become a later adapter. This is the piece an earlier draft of
  this document got wrong: it proposed sharing from other apps, which needs a
  link in your hand. The moments where you actually hear about a movie — a
  conversation, a podcast — have no link in them. They have a spoken title and
  a risk of forgetting it. A single unambiguous destination is what makes
  capturing that possible; the share sheet never was.

**Default selection and replacement — decided August 30, 2026.**

- **A star on each My Bowls card changes the default in one tap.** Follow the
  compact icon treatment of the pinned-movie control, but use an outlined star
  for other bowls and a filled star for the default. Call the action "Make this
  my default bowl" and the selected state "Default bowl". This is a personal
  choice available to owners and members, not a movie pin or a list-ordering
  control; it has no effect on draws or other members' defaults.
- **Exactly one default while the user has bowls.** Selecting another star
  moves the default. Tapping the selected star leaves it selected; there is no
  separate unset step. Selecting the star must not also open the bowl.
- **If the default is left, deleted, or otherwise no longer accessible, choose
  the remaining bowl with the most undrawn movies.** Count all persisted movies
  still in that bowl, across contributors, before draw filters or streaming
  preferences. Break ties alphabetically by bowl name, then by stable bowl ID
  if names also match. This also handles one remaining bowl and all-empty bowls.
- **Existing accounts use the same selection rule at rollout.** When an account
  has no saved default, choose its accessible bowl with the most undrawn movies,
  breaking ties by name then ID, exactly as when replacing a lost default. Do
  not use the first-created bowl or last-opened local storage value for this
  initialization, and do not overwrite an already saved, accessible default.
- **Save the chosen default once.** Do not keep changing the default as movie
  counts change. A failed load or offline state is not evidence that the user
  lost access. With no bowls left, clear the default and show My Bowls; the next
  bowl created or joined becomes the default.

**Why it fits.** The redirect already concedes the point, and the modal is
already bowl-agnostic — it emits a movie through `onAddMovie` and lets the
screen decide what happens.

**What it actually costs.** That same bowl-agnosticism is the catch: today the
screen's `useBowl` handler owns the write *and* the undrawn-limit guard, so a
global `+` needs a bowl-bound add handler living above the bowl routes. That is
the real work in this idea, and it touches the highest-risk file in the repo. It
is not a button.

**Smallest bold version.** The saved default, its star control and replacement
rule, Home routing, and the global `+` against that default. That prerequisite
has landed; the Gemini-first capture roadmap remains separate, unimplemented
work.

**Implementation risks and resolved questions.**
- The two-bowl user is the one who gets hurt if "add to a different bowl" is
  buried. It has to be visible in the modal, not hidden behind a menu.
- Persistence and migration are specified in the implementation plan: an
  account-owned preference table, authenticated RPCs, acquisition triggers,
  one shared fallback ranking, and repair after confirmed access changes.
- The shared add extraction must preserve existing guards and capture the
  destination before metadata loads. The plan covers pending/unknown writes,
  focus and scroll behavior, regression tests, and database-first rollout.
- The history distinction is resolved in the design spec: global Add always
  adds to a bowl; Watch History's separate `Log a watched movie` action retains
  the manual-history workflow. Do not introduce a mode switch in global Add.

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

## 6. The 80-movie problem

**The idea.** A bowl that works outgrows its own memory. At a title a week,
eighty movies is over a year of runway: most of what is in there will not come
up this year, some of it was added by someone whose taste has moved on since,
and nobody can say what is in the bowl without scrolling it. Filters narrow a
single draw. Nothing curates the bowl itself, and nothing tells you what has
been sitting in it since 2024.

Three pieces, in increasing order of nerve:

- **Tell the truth about the tail.** The data is already there: the oldest
  undrawn title, contributors whose slips have never come up, and titles the
  streaming filters can currently never reach. That last one is already in
  `TODO.md` as an odds-panel accuracy problem — it is the same fact seen from
  the curation side rather than the fairness side.
- **Last call.** A title that has sat undrawn past some threshold comes back to
  the person who added it for a decision: keep it, or let it go. Never automatic
  deletion, and never someone else's call.
- **Seasons.** A bowl can be closed out and started fresh, with everything
  unwatched rolling over by choice rather than by default. This is the one that
  needs the most convincing — it may be solving a tidiness itch rather than a
  real problem.

**Why now.** This is what success looks like from the inside. The bowl is doing
its job, more movies are getting watched, and the reward is a bowl too big to
hold in your head.

**Smallest bold version.** The informational slice only: show the oldest undrawn
titles and the ones the filters cannot reach. No workflow, no deletion, no
seasons. It may turn out that seeing it is the whole fix.

**Risks and open questions.**
- Retiring a title is not a draw and must never touch rotation history or
  anyone's odds. A cleanup that quietly changes whose turn is next would be a
  bug in the product's central promise.
- Only the contributor may retire their own title. Any flow that lets one person
  prune another's slips breaks the thing that makes a bowl feel safe to add to.
- The bowl is deliberately *not* a browsable catalogue — comments stay hidden
  until a draw for exactly this reason. A curation surface risks turning the
  bowl into a browse-and-pick list, which is the failure mode the whole product
  is arranged to avoid. That tension is real and unresolved.
- And the prior question: is a big bowl a problem, or just a fact about a
  healthy bowl? Worth answering before building anything past the informational
  slice.

---

## Where I'd start

**Idea 3 first**, but for a different reason than the version it replaces: not
because bowls run dry — an eighty-movie bowl plainly does not — but because
adding is annoying today, and because a single default bowl is the precondition
for every capture mechanism worth having later. Then the informational slice of
idea 6, which is cheap and addresses the problem that is live right now. Ideas 1
and 2 are one movie night seen from two angles and should be designed together.
Idea 4 has the highest ceiling and is the easiest to build at the wrong time —
it wants a product with a lot of history in it, which this one is quietly
accumulating. Idea 5 is the right refactor eventually and the wrong one now:
build two more rules as ordinary features first, then extract the layer once the
shape is obvious.

## Deliberately not on this list

**Recommendations.** Taste graphs, "movies like the ones your bowl finishes,"
algorithmic suggestion. It is the obvious idea and it is the wrong one: it
competes directly with the reason the product exists. Movie Bowl's promise is
that the *group* decides and the app is fair about it. An app that starts having
opinions about what you should watch is a worse version of five things you
already have.
