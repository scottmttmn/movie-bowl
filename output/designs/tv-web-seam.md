# The Seam Between the Web App and the Television

Status: idea, recorded for later. Nothing here is implemented. The decision in
"The Supported Surfaces" is settled, and so is the shape of the dashboard
affordance — a theater mode switch beside the draw button, revised September 12,
2026 from an earlier offer-shaped proposal. The work itself is unbuilt, and the
remaining open questions are genuinely open.

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

## The Fix: The Television's Own Control, on the Dashboard

If theater mode is the only thing the television route uniquely offers, the
answer is not to route people to the television. It is to let the ceremony
happen where the draw happens.

**An earlier draft of this section asked for a quieter dashboard**: previews
offered rather than started, the offer appearing beside the draw result only for
accounts with the setting already on, and no control on the bowl page at all.
The instinct behind it was right and is worth keeping. Someone drawing on a
television is sitting in front of the screen they will watch on; someone drawing
on a laptop usually is not, and previews that seize a laptop after a draw are an
interruption rather than an occasion.

The mechanism was wrong. An affordance that appears only after the draw can
never tell you theater mode is *armed* — it can only announce itself at the one
moment the room is waiting on something else. It gives you nowhere to turn the
feature off except the place you did not come from: Settings, two screens away,
under a heading that says "TV & playback." And it invents a second behaviour for
a feature that already has one, so the same stored flag would mean "previews
start" on a television and "previews are offered" on a laptop.

The television already solved this. `TvTheaterTicket` is a `role="switch"` sitting
beside the draw controls on the tonight screen, and its entire job is to read *on*
or *off* from across a room. Put the same control on the dashboard.

The distinction the earlier draft missed is the one that matters. What this
document was right to refuse is an **action** — a "Play previews" button, which
advertises a feature and adds a second way to do what the setting already does.
A **state** switch is a different kind of object. It does not offer previews; it
says whether tonight has them. So the two surfaces stop diverging:

| | Television | Dashboard |
| --- | --- | --- |
| The control | A ticket beside the draw filters | A ticket beside the draw button |
| What it is | `role="switch"`, on or off | The same |
| With it off | nothing | nothing |
| With it on | previews start once the pick is revealed | the same |
| What toggling writes | a per-device override | a per-device override |
| A device with nothing stored | follows the account setting | **off** |

**Armed is the consent that lets the dashboard start on its own.** The offer
shape was compensating for an absence: an account flag set for a television,
honoured silently on a laptop, with nothing on screen that said so. A switch on
the same screen as the draw button, off until someone turns it on, removes the
absence rather than working around it. You armed it here, moments before you
drew, and previews then starting is what you asked for. One model serves both
surfaces instead of two, which is less to build and less to explain.

**Where it goes: the hero, beside `HoldToDrawButton`** (`BowlDashboard.jsx:829`)
— not inside the "Narrow the draw" panel. `TvTheaterTicket`'s own comment makes
this argument for the television: theater mode is the only setting on that
screen about the occasion rather than about filtering, and wearing the same pill
as the filters made it read as one of them. The dashboard's filters sit behind a
modal opened from `BowlStatLine`, so filing the ticket there would bury a state
control behind a button *and* class it as filtering. Both are wrong, for the
same reason.

**The cost, stated plainly.** The ticket is visible to every account, including
the ones that will never turn it on — which is the thing this document
previously listed under "Deliberately Not Doing." It is worth paying, because it
is also the only thing that makes theater mode discoverable on the web at all:
today the feature is configured in a Settings section headed "TV & playback" and
runs on a route the navigation menu labels "TV mode," which is precisely the
label that tells a laptop user not to bother. A small ticket that plainly reads
*Off* is a smaller imposition than a feature nobody can find.

## What the Web Pre-Roll Must Do Differently

These are facts about the surface rather than about the affordance, so they hold
whatever shape the control takes.

The pre-roll is closer to portable than it looks. `TvTheaterPreroll` already
requests fullscreen and catches the rejection, falling back to a full-viewport
overlay — which *is* the web behaviour, already written. `theaterQueue.js` is
pure, takes `fetchTrailer` and `random` injected, and contains nothing
television-specific. Four things do not carry over:

- **The exit must be visible.** The television deliberately ships no controls,
  because Back carries the exit and the phase 1 revision in `tv-theater-mode.md`
  verified that on hardware. A laptop has Escape. A phone has neither Escape nor
  a Back the page can claim — the Android back gesture would navigate the SPA
  route, and iOS offers nothing inside a modal. The web pre-roll therefore needs
  a control the television refuses to have, which is a real divergence from "a
  cinema has no controls" rather than an oversight to be tidied away later.
- **`playsinline` must be `1`.** `getAutoplayTrailerUrl` sets it to `0`, which on
  iOS hands each video to the native fullscreen player and takes the queue
  overlay off screen entirely. The builder already varies by caller through its
  `preroll` option, so this is another option rather than a change to what the
  television sends.
- **Autoplay chaining needs hardware.** The television reuses one `YT.Player` and
  calls `loadVideoById()` so the draw press keeps satisfying autoplay policy.
  Whether that gesture still carries across videos in iOS Safari is unverified,
  and a reel that stalls on the second preview is worse than no reel at all.
  Test on a phone before the phone ships.
- **Pause needs a pointer gesture.** The television binds it to Select on
  `window`. The key handler already accepts Space, so the web wants
  click-to-pause on the overlay added beside it.

Two files move, which answers a question this document previously left open.
`theaterQueue.js` belongs in `src/utils/` — it is pure and dependency-free,
which is the layer rule — and `youtubePlayer.js` in `src/lib/`, since it wraps an
external service. Move rather than copy: one clear implementation per feature is
a working agreement, and a forked pre-roll would drift.

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

This document once offered two ways out and preferred the cheaper one: let the
dashboard affordance be opt-in on its own terms, since an offer rather than an
automatic start costs a surprised user at most one ignorable control. That
option dies with the offer shape. A switch has to write somewhere.

So take the other one: **generalise the override from "this television" to "this
device."** `tvDrawSettings.js` is most of the way there already — keyed by
account, deliberately a patch rather than a snapshot so later account edits still
propagate, already degrading silently when storage throws, and already listing
`theaterModeEnabled` among the settings that may diverge. What is
television-specific is the filename, the storage prefix, and the reasoning for
*which* settings may diverge, which is argued from what a D-pad can operate.

The switch must not write the account setting. Turning theater mode off on a
laptop would otherwise reach across and disarm a television in a room nobody was
standing in — the same failure as the trap above, pointed the other way.

Three things need care:

1. **A web device with nothing stored starts off; a television falls through to
   the account setting.** This is the one deliberate asymmetry, and it is also
   the whole migration. The television's fall-through is correct there: someone
   who enabled theater mode enabled it *for* a television. The dashboard cannot
   inherit that reading without silently widening it, so the web surface treats a
   missing override as off and the ticket is how you arm it. Nobody's stored
   settings change, and no laptop plays previews at anyone unasked. In code this
   is a surface default laid under the account settings, not a second preference.
2. **One override store per device, not one per surface.** A laptop that visits
   both `/tv` and the dashboard is one device, so arming theater mode on one
   should arm it on the other. That also means the existing storage prefix stays
   as it is. Renaming it would silently forget every override a television has
   already stored — `readTvSettingsOverrides` carries a comment warning about the
   sibling hazard, where dropping a name from the overridable list retires
   whatever a television saved under it. Keeping the prefix is less code than
   migrating it and cannot lose anything. (The recent-trailer key next door is
   not in this category: losing that history costs a repeated preview, so it can
   be renamed freely.)
3. **The list of what may diverge deserves a fresh answer per device class, but
   not today.** `TV_OVERRIDABLE_SETTINGS` is short because a television shows
   what the room can decide, and because genres and runtime have no control a
   D-pad can work. A pointer and a keyboard dissolve the second argument but not
   the first. Theater mode is the only setting the dashboard wants to override,
   so leave the list alone until something else asks.

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

1. ~~What does the dashboard affordance look like?~~ The television's own
   control: a theater mode ticket beside the draw button, `role="switch"`,
   reading on or off before the draw rather than offering previews after it. See
   "The Fix" above for why the earlier offer shape was refused.
2. ~~Does the web pre-roll reuse `theaterQueue` as-is?~~ Yes, and it moves to
   `src/utils/` where the layer rule puts it, with `youtubePlayer.js` going to
   `src/lib/`. Moved, not copied.
3. **What does the settings section become** once it governs two surfaces? The
   heading "TV & playback" and the subtitle "How the TV app behaves once a movie
   is drawn" are both untrue the moment the dashboard honours the same flag.
   This is now certain to need doing rather than a question of whether — what is
   open is the wording, and whether the per-device switch means the account-level
   count is the only thing left worth showing there.
4. **Is `theaterTrailerCount` right for both?** Three previews is a cinema on a
   television; it may be long on a laptop where someone is about to walk away,
   and it is three HD trailers of cellular data on a phone. Note that the count
   is deliberately not overridable per device today, so an answer of "fewer on a
   phone" means either a surface default or a widened override list.
5. ~~Does anything else want per-device divergence?~~ Moot: the switch forces the
   per-device override regardless, because it cannot write the account setting
   without reaching across to the television. Whether any *other* setting wants
   to diverge is still unasked, and `TV_OVERRIDABLE_SETTINGS` stays as it is
   until one does.
6. **What is the install route for a cohort member?** A Play link, an email
   invitation to the test track, or something the web app renders. A
   distribution question rather than a product one.
7. **Does the ticket belong on the bowl page for a member who cannot draw?**
   Draw access is per bowl, and a member outside the allow-list will never arm
   anything. Showing them a switch for a ceremony they cannot start is the
   clutter this document was trying to avoid; hiding it makes the control appear
   and disappear between bowls.

## Sketch of the Work

1. The dashboard pre-roll, armed by a ticket beside the draw button and started
   by the draw. Three pieces, in this order: generalise `tvDrawSettings.js` to a
   device override (keeping its storage prefix) with an off-by-default surface
   default for the web; move `theaterQueue.js` and `youtubePlayer.js` out of
   `src/tv/`; then the ticket and the web pre-roll overlay, with a visible exit
   and `playsinline=1`. This is the real feature and the rest depends on it.
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
- **A previews *action* on the bowl page.** The ticket says whether tonight has
  previews; it never plays them. A "Play previews" button would be a second way
  to do what the switch already does, and adding one is still refused. The
  earlier form of this line refused the switch as well, on the grounds that
  theater mode should stay something you turn on rather than something the
  dashboard advertises — see "The Fix" for why a state control and an action
  turned out not to be the same imposition.
- **Building a separate marketing page for the television.** The About page
  gains a step when it is earned.
