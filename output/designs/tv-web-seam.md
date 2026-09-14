# The Seam Between the Web App and the Television

Status: idea, recorded for later. Nothing here is implemented. The decision in
"The Supported Surfaces" is settled; the dashboard pre-roll is a proposal with
real cost; open questions are genuinely open.

## The Supported Surfaces

- **The Google TV app**, on certified Google TV hardware. The only supported
  television.
- **Ordinary browsers** — phone, laptop, desktop — for the web app.
- **Other televisions' built-in browsers are out of scope.** In practice this
  excludes very little: Roku ships no browser, Google TV and Android TV have
  none preinstalled, and the Tizen and webOS browsers are buried deeply enough
  that hardly anyone opens one. It is a path almost nobody can take rather than
  a risk being managed, and verifying it would mean a matrix of engines and
  remote-key behaviours each needing physical hardware.

The line is drawn at what can be verified without buying televisions.

## What This Decision Is Not

It is not a rewrite, and it deprecates no code.

The release build of the Google TV shell loads `https://moviebowl.app/tv` in a
fullscreen WebView (`tv-android/README.md:109-111`; the URLs live in
`app/build.gradle.kts`). The app *is* the web route, running in a known browser
on known hardware. `src/tv` remains the only implementation of the television
experience, and the native project supplies capabilities a page cannot have.

The supported path and the excluded one are therefore the same code. What
narrows is the claim, not the surface area — which is why honouring this costs
nothing to build.

## Current State, Verified

**Television to web is in good shape.** The tonight screen tells an empty bowl
to "Add some movies from a phone before starting the draw"
(`TvTonightScreen.jsx:1472`), tells a returned movie's owner to add it again
from their phone (`:788`), and points at the phone for preferences (`:255`). The
pairing screen shows a QR and a typed URL, which is itself a handoff to the web
app.

The handoff is deliberately not a navigation. The picker once carried an
`Exit TV mode` button and an `Open the full app` button, both of which routed to
`/`; both are gone. On a television that destination is the phone interface,
which `MainActivity.dispatchKeyEvent` leaves undrivable because it consumes
every D-pad key, so the Google TV shell now closes itself whenever the web app
leaves `/tv` (`MainActivity.doUpdateVisitedHistory`). Back is the only exit, and
in a browser the back button says the same thing.

**Web to television is one unlabelled link.** `TopNav.jsx:158` offers a menu
item reading "TV mode" that navigates to `/tv`, with no explanation of what it
is or where it is meant to run.

**`/activate-tv` has no inbound links at all.** The only reference in `src/` is
the route definition (`App.jsx:276`). It is reachable exclusively by typing the
URL the television displays — the correct shape for device pairing, but it means
nothing in the web app ever mentions that connecting a television is possible.

**The dashboard already does everything `/tv` does, except one thing.** It
draws, and it opens the movie on a service: `BowlDashboard.jsx:16` uses
`useDrawProviderLinks` and `:33` `resolvePreferredLaunchTarget`. The single
exclusive capability of the television route is **theater mode** — the trailer
pre-roll. `TvTheaterPreroll`, `TvTheaterTicket` and `theaterQueue` live only in
`src/tv`, and the dashboard has no trailer of any kind.

## The Real Seam

The web app asks you to configure a feature it will not run.

`UserSettings.jsx:506` has a section headed **"TV & playback"**, subtitled "How
the TV app behaves once a movie is drawn," holding the theater mode toggle and
the preview count. Those write to the account's `defaultDrawSettings`. A laptop
user can turn theater mode on, and then nothing happens anywhere they normally
go — the setting only takes effect on `/tv`, a route the menu labels "TV mode,"
which is precisely the label that tells a laptop user not to bother.

That is the seam, and it is sharper than "the two apps do not refer to each
other." A setting and its effect live in different places, and the only thing
that says so is one subtitle.

## Why the Laptop Does Not Want Big-Screen Mode

An earlier draft of this document argued for promoting the television route to
laptop users. That was wrong, and the reason it was wrong is worth keeping.

On a laptop at a desk the dashboard is strictly better: it draws, it opens the
movie, it has the full add and settings surface, and it needs no D-pad metaphor.
Sending a laptop user to `/tv` offers a second way to do what they can already
do — the sort of redundant choice this product is otherwise careful to avoid.

The technical facts that made the earlier argument tempting are still true and
still worth recording, because they mean the route is *safe* on a laptop even if
it should not be advertised there:

- Focus is native. `useTvSpatialNavigation` moves focus with `element.focus()`
  (`:241`, `:287`) rather than tracking an index in React state, so a mouse
  click and a D-pad press drive the same mechanism.
- Tab is never intercepted. The handler claims Enter, the arrows,
  Escape/Backspace and the television back key, and nothing else.
- Every control is a real button with a real `onClick`.
- `src/tv/tv.css` is built on `clamp()` with `vw`/`vh` terms and pixel minimums,
  so it degrades sensibly below television dimensions.
- `e2e/tv.e2e.js` runs under the `desktop-chromium` project at 1440×960 and
  explicitly skips `mobile-chromium` — "TV smoke coverage uses the desktop
  viewport" (`:7`).

So: safe on a laptop, tested on a laptop, and not the right place to send a
laptop user. The one genuine exception is a laptop connected to a television for
a group, which is the Google TV app's scenario without the app, and which needs
no promotion to work.

## The Fix: Bring the Pre-Roll to the Dashboard, Quietly

If theater mode is the only thing the television route uniquely offers, the
answer is not to route people to the television. It is to let the ceremony
happen where the draw happens.

**But it must be quieter on the dashboard than on the television**, because the
two situations are not the same. Someone drawing on a television is sitting in
front of the screen they will watch on. Someone drawing on a laptop usually is
not — they are picking for a room whose screen is somewhere else. Previews that
seize a laptop after a draw would be an interruption, not an occasion.

So the behaviours differ deliberately:

| | Television | Dashboard |
| --- | --- | --- |
| With the setting off | nothing | nothing |
| With the setting on | previews start automatically after the draw | an affordance appears; the viewer chooses to start them |
| Where it is configured | Settings, plus a per-device override | Settings only |

**No control on the bowl page when the setting is off.** Theater mode stays a
Settings-page concept on the web, surfaced beside a draw result only for
accounts that asked for it. The dashboard does not grow a previews button for
everyone, and it never starts playing on its own.

That also dissolves the "annoying trailers on my laptop" problem without new
machinery: the worst case for someone who draws on a laptop but watches on a
television is one ignorable affordance, not an interrupted room.

## The Preference Trap

`theaterModeEnabled` currently *means* "on the television." The moment the
dashboard honours the same flag, that meaning silently widens for every existing
account — everyone who enabled it for their television starts getting previews
offered on their laptop, without having asked for anything.

The existing per-device mechanism points the wrong way to help. `tvDrawSettings.js`
stores a `localStorage` patch, keyed by account, that lets a *television* diverge
from the account (`TV_OVERRIDABLE_SETTINGS` currently allows `prioritizeStreaming`,
`useStreamingRank` and `theaterModeEnabled`). There is no laptop-side override,
because `readTvSettingsOverrides` is only consumed by the television surface.

Two ways out, and the first is probably enough:

1. **Let the dashboard's affordance be opt-in on its own terms.** Because the
   web behaviour is an offer rather than an automatic start, the widened meaning
   costs a user at most one ignorable control. No migration, no new preference.
2. **Generalise the override from "this television" to "this device."** The file
   is most of the way there — keyed by account, deliberately a patch rather than
   a snapshot so later account edits still propagate, already degrading silently
   when storage throws. What is television-specific is the name and the
   reasoning for *which* settings may diverge, which is argued from what a D-pad
   can operate. A laptop has a pointer and a keyboard, so that list deserves a
   fresh answer per device class rather than a rename.

Start with (1). Reach for (2) only if people actually want per-device divergence
for something other than theater mode.

## The Menu Item Goes; the Route Stays

Once the dashboard carries the pre-roll, the reasons for a laptop user to visit
`/tv` are down to the ten-foot layout itself and the owner's own testing.
Neither needs a menu entry.

**Remove the "TV mode" item from `TopNav`.** `TopNav.test.jsx:49` pins its
presence and `:190` its absence in another state; both need updating.
`e2e/tv.e2e.js` navigates by URL and is unaffected.

**Keep the `/tv` route exactly as it is.** The Google TV shell loads
`https://moviebowl.app/tv` directly and never sees the web navigation, so
removing the item is invisible to it — and removing the route would break the
app outright. This distinction is the one thing in this document that must not
be got wrong.

## Later: What the Web App May Say About the App

Each phase of `google-play-tv-private-distribution-roadmap.md` licenses more
copy. Write it once and gate it behind a single constant, so opening it is a
one-line change rather than a design exercise repeated under time pressure.

- **Owner-only internal test (today).** No mention of the app anywhere.
- **Friends and family.** A line in User Settings or Bowl Settings — "Movie Bowl
  on Google TV" — with the install route for people added to the test. Nothing
  on the About page: it is public, and the app is not.
- **Open distribution.** The About page gains the television, most naturally as
  a fourth flow step, since its existing three stop one beat before the moment
  the television owns. A store badge belongs here and nowhere earlier.

The ordering rule: **the About page is the last surface to speak, not the
first.** It is the only unauthenticated page, so anything it claims is a promise
made to people who cannot yet check it.

## The Pairing Seam

One piece of near-term work is worth doing regardless of copy, because the
friends-and-family cohort will hit it: someone installs the app, sees a code,
and must reach `/activate-tv` by typing what the television shows them.

The flow is right. What is untested is whether it is *pleasant* — the URL's
length on screen, the code's legibility at viewing distance, and what happens
when someone mistypes. `TODO.md` already carries the related item: the pairing
typography was hard to read on physical onn hardware at Full HD, with the
fallback code too small, and that fix is wanted before the cohort. Treat them as
one piece of work; they are the same screen and the same audience.

## Open Questions

1. **What does the dashboard affordance look like?** A line beside the draw
   result, a button on the result card, something in the reveal — it has to read
   as an offer rather than a feature announcement, and it only exists for
   accounts with the setting on.
2. **Does the web pre-roll reuse `theaterQueue` as-is?** It resolves previews
   from other titles in the bowl and is not obviously television-specific, but
   it lives in `src/tv/utils/` and moving shared logic out of that directory is
   a decision about where the boundary sits.
3. **Does the "TV & playback" settings section need renaming** once it governs
   two surfaces? Its subtitle currently says "the TV app," which would become
   untrue.
4. **Is `theaterTrailerCount` right for both?** Three previews is a cinema on a
   television; it may be long on a laptop where someone is about to walk away.
5. **Does anything else want per-device divergence**, or is theater mode the
   only case? This decides whether option (2) in "The Preference Trap" is ever
   worth building.
6. **What is the install route for a cohort member?** A Play link, an email
   invitation to the test track, or something the web app renders. A
   distribution question rather than a product one.

## Sketch of the Work

1. The dashboard pre-roll, setting-gated and offered rather than automatic.
   This is the real feature and the rest depends on it.
2. Remove the `TopNav` item; update `TopNav.test.jsx`.
3. Settings copy, once the section governs two surfaces.
4. Pairing screen typography, together with the existing `TODO.md` item.
5. Draft the phase-gated Google TV copy, shipped dark behind one constant.

Steps 2 through 5 are small. Step 1 is a feature and should be scheduled as one.

## Deliberately Not Doing

- **Verifying `/tv` across television browsers.** The point of the decision is
  to not spend this.
- **Promoting the television route to laptop users.** The dashboard is better
  for them, and after step 1 it is better in the only way it currently is not.
- **Promoting the Google TV app** before its distribution can honour the
  promise.
- **A previews button on the bowl page for everyone.** Theater mode stays
  something you turn on, not something the dashboard advertises.
- **Building a separate marketing page for the television.** The About page
  gains a step when it is earned.
