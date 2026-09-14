# The Seam Between the Web App and the Television

Status: **in progress.** The decision in "The Supported Surfaces" is settled, and
so is the shape of the dashboard affordance — a theater mode switch beside the
draw button, revised September 12, 2026 from an earlier offer-shaped proposal.
The device override layer it stands on landed September 14, 2026
(`src/utils/deviceDrawSettings.js`); the ticket and the web pre-roll have not
been built. The remaining open questions are genuinely open.

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
| A device with nothing stored | follows the account setting | off |

**Armed is the consent that lets the dashboard start on its own.** The offer
shape was compensating for an absence: an account flag set for a television,
honoured silently on a laptop, with nothing on screen that said so. A switch on
the same screen as the draw button, off until someone turns it on, removes the
absence rather than working around it. You armed it here, moments before you
drew, and previews then starting is what you asked for. One model serves both
surfaces instead of two, which is less to build and less to explain.

**So there is no confirmation step, on either surface.** Draw, reveal, previews
— the same sequence the television runs today, where `isTheaterPending` resolves
the queue and hands straight to `isTheaterPlaying` with no prompt in between. A
"start previews?" dialog would reintroduce the offer this section just removed,
one step further along, and ask a question the switch has already answered. The
pre-roll's own opening card is the heads-up: it announces the count and the
feature, and then it plays. Note the television also gives up rather than
stalling — `MAX_PREVIEW_WAIT_MS` abandons the pre-roll if the lookups are slow,
landing on the reveal with the movie waiting. The web wants the same escape for
the same reason.

**Where it goes: the hero, beside `HoldToDrawButton`** (`BowlDashboard.jsx:829`)
— not inside the "Narrow the draw" panel. `TvTheaterTicket`'s own comment makes
this argument for the television: theater mode is the only setting on that
screen about the occasion rather than about filtering, and wearing the same pill
as the filters made it read as one of them. The dashboard's filters sit behind a
modal opened from `BowlStatLine`, so filing the ticket there would bury a state
control behind a button *and* class it as filtering. Both are wrong, for the
same reason.

**One part of the ticket does not port.** `TvTheaterTicket` takes `isOverridden`
and draws a divergence mark, with an sr-only "set on this TV," when the device
disagrees with the account. On the dashboard that mark would be lit whenever the
ticket is on and never otherwise, because the web's base is `false` — so it would
stop reporting divergence and start restating the switch beside it. Either leave
it on the television, or have it compare against the surface default rather than
the account.

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
  iOS hands each video to the native fullscreen player. That is not a styling
  complaint: the video then ends *outside* our overlay, and getting back in for
  the next preview needs a fresh gesture, so `0` breaks the queue rather than
  merely relocating it. No device is needed to settle this — the question was
  never whether `1` is right but what `0` does, and that is known. The builder
  already varies by caller through its `preroll` option, so this is another
  option rather than a change to what the television sends.
- **Autoplay is detected, not assumed.** Two versions of one risk: the
  hold-to-draw press is a real gesture, but the queue resolves through TMDB
  lookups before any player exists, so the browser may not count the first
  preview as gesture-initiated; and the television's `loadVideoById()` trick for
  keeping that gesture alive across videos may not hold everywhere. Neither is
  worth predicting. Call `playVideo()`, and if the player has not reached
  `PLAYING` within about a second, draw a tap-to-start target over the
  announcement card — on tap, `playVideo()` runs inside a genuine gesture handler
  and cannot be refused. The same check covers a stall on preview two.

  This is the pattern the pre-roll already uses one layer up: `TvTheaterPreroll`
  requests fullscreen, catches the rejection, and falls back to the full-viewport
  overlay. Doing the same for playback costs one tap in the worst case, keeps it
  inside the ceremony rather than in front of it as a dialog would, and answers
  the question on every browser rather than only the ones anyone tested. It also
  does not disturb the no-confirmation decision above: the tap appears only when
  autoplay has already failed, never as a step in the normal path.
- **Pause needs a pointer gesture.** The television binds it to Select on
  `window`. The key handler already accepts Space, so the web wants
  click-to-pause on the overlay added beside it.

**There is no iOS device available to test on**, and the design above is shaped
by that rather than merely inconvenienced by it. Every iOS-specific risk here is
either decidable from reasoning (`playsinline`) or handled by a runtime fallback
that triggers on the failure itself (autoplay), so none of them blocks shipping
and none should be written up as "verify on hardware first" again. What a real
iPhone would still improve is judgement rather than correctness — whether the
exit control is reachable one-handed, whether the announcement card holds long
enough on a small screen — and that is the kind of thing revised after living
with it anyway. A cloud device session or two minutes with a borrowed phone
covers it whenever someone wants to look; neither is a prerequisite.

Two files move, which answers a question this document previously left open.
`theaterQueue.js` belongs in `src/utils/` — it is pure and dependency-free,
which is the layer rule — and `youtubePlayer.js` in `src/lib/`, since it wraps an
external service. Move rather than copy: one clear implementation per feature is
a working agreement, and a forked pre-roll would drift.

## What Settings Keeps

Both controls stay, and the section around them gets rewritten.

The plain reason is `theaterTrailerCount`. It has no override layer — the count
is deliberately absent from `DEVICE_OVERRIDABLE_SETTINGS`, because a television
cannot act on a number it has no control for, and `TvTheaterTicket`'s comment
explains why the stub says on or off instead. So the count is account-level on
both surfaces and Settings is its only home. The section exists either way, and
a count sitting alone, governing a feature with no visible on or off anywhere
near it, is stranger than a toggle beside it.

The supporting reason is a television that cannot write to storage at all.
`deviceDrawSettings.js` catches an accessor that throws — some Android WebView
configurations do — and `useDeviceDrawSettings` surfaces that as `isPersisted`,
which is the warning the tonight screen already shows: *"This TV can't remember
settings, so these last until it restarts."* The override still applies for the
evening, because the hook holds it in React state regardless of whether the
write landed. It simply is not written down. On the next start the television
reads `{}` and falls through to whatever is underneath. With the account setting
underneath, someone who turned theater mode on once, anywhere, gets it back every
restart. With nothing underneath, they would get `false` every restart, press the
ticket, and lose it again — a setting that appears to work each time you touch it
and silently reverts, with no durable layer left to hold it.

That case is narrower than it first appears and should not be oversold: since
`theaterModeEnabled` defaults to `false`, it only reaches accounts that turned
theater mode on *and* own a television whose storage is broken. It is a small
population and a total failure for them, which is enough to keep a control that
is staying anyway.

What has to change is the copy. The heading "TV & playback" and the subtitle
"How the TV app behaves once a movie is drawn" both stop being true the moment
the count governs the dashboard too. The toggle also needs to say what it now
does — previews on televisions, unless a device has been told otherwise — since
the dashboard deliberately does not read it. The per-device half of that story
is told by the ticket, where you meet it, rather than by more words here.

## The Preference Trap

`theaterModeEnabled` currently *means* "on the television." The moment the
dashboard honours the same flag, that meaning silently widens for every existing
account — everyone who enabled it for their television starts getting previews
offered on their laptop, without having asked for anything.

The per-device mechanism that existed when this was written pointed the wrong
way to help. `src/tv/utils/tvDrawSettings.js` stored a `localStorage` patch,
keyed by account, that let a *television* diverge from the account. There was no
laptop-side override, because only the television surface ever read it.

This document once offered two ways out and preferred the cheaper one: let the
dashboard affordance be opt-in on its own terms, since an offer rather than an
automatic start costs a surprised user at most one ignorable control. That
option dies with the offer shape. A switch has to write somewhere.

So take the other one: **generalise the override from "this television" to "this
device."** The file was most of the way there already — keyed by account,
deliberately a patch rather than a snapshot so later account edits still
propagate, already degrading silently when storage throws, and already listing
`theaterModeEnabled` among the settings that may diverge. What was
television-specific was the filename, the storage prefix, and the reasoning for
*which* settings may diverge, which is argued from what a D-pad can operate.

**Done.** It now lives at `src/utils/deviceDrawSettings.js` with
`src/hooks/useDeviceDrawSettings.js` beside it, `DEVICE_OVERRIDABLE_SETTINGS`
unchanged in content, and the storage prefix deliberately untouched.

The switch must not write the account setting. Turning theater mode off on a
laptop would otherwise reach across and disarm a television in a room nobody was
standing in — the same failure as the trap above, pointed the other way.

Three things need care:

1. **A web device with nothing stored starts off; a television falls through to
   the account setting.** The television's fall-through is correct there: someone
   who enabled theater mode enabled it *for* a television. The dashboard cannot
   inherit that reading without silently widening it, so the web surface treats a
   missing override as off, and the ticket is how you arm it. In code this is a
   surface default sitting *between* the account and the device overrides, not a
   second preference and not a floor beneath everything: it has to beat the
   account value, or the laptop would inherit the very setting it is declining,
   while still losing to an override somebody set on the device in front of
   them. `mergeDeviceDrawSettings` spreads them in that order.

   This asymmetry is smaller than it looks, and it is worth saying so before
   someone budgets a migration for it. `theaterModeEnabled` already defaults to
   `false` — `DEFAULT_DRAW_SETTINGS` sets it, and `normalizeDefaultDrawSettings`
   coerces anything missing to the same — so for every account that never opened
   the setting, "follow the account" and "start off" return the identical answer
   on every device. The two rules only diverge for accounts that deliberately
   turned theater mode on, and for them the divergence is the intended behaviour
   rather than a cost: it is precisely the widening this section exists to
   prevent. No stored value changes, and nothing needs migrating.
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
   not today.** `DEVICE_OVERRIDABLE_SETTINGS` is short because a television shows
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
3. ~~Does the "TV & playback" settings section need renaming, and does the
   account toggle survive the per-device switch?~~ Renaming yes, and the toggle
   stays. See "What Settings Keeps" above. The wording itself is still unwritten,
   which is drafting rather than a design question.
4. ~~Is `theaterTrailerCount` right for both?~~ Yes — the count stays as it is,
   one account-level number for every surface. A phone-specific default would
   mean either a second surface default or a widened override list, and neither
   is worth carrying before anyone has complained that three is too many. The
   setting already spans one to four, so someone who finds it long on a laptop
   has the control. Revisit if cellular data on a phone turns out to be the
   thing people actually notice.
5. ~~Does anything else want per-device divergence?~~ Moot: the switch forces the
   per-device override regardless, because it cannot write the account setting
   without reaching across to the television. Whether any *other* setting wants
   to diverge is still unasked, and `DEVICE_OVERRIDABLE_SETTINGS` stays as it is
   until one does.
6. **What is the install route for a cohort member?** A Play link, an email
   invitation to the test track, or something the web app renders. A
   distribution question rather than a product one.
7. ~~Does the ticket belong on the bowl page for a member who cannot draw?~~ No
   — hide it when `canCurrentUserDraw` is false (`BowlDashboard.jsx:230`).
   Theater mode describes what happens *after* a draw, so to someone who cannot
   draw in this bowl the switch is not merely disabled, it is about an event they
   will never trigger. That it then appears and disappears between bowls is
   correct rather than inconsistent: draw access is per bowl, so the control
   follows the permission that gives it meaning.

   Worth noting the deliberate difference from its neighbour. `HoldToDrawButton`
   stays visible and `disabled` for the same member, because a greyed draw button
   is what explains why they cannot draw — paired with `drawGuardMessage`, it
   answers a question they are actually asking. A greyed ticket answers no
   question; it advertises a feature and then refuses it. Disable the control
   that carries an explanation, hide the one that does not.

## Sketch of the Work

1. The dashboard pre-roll, armed by a ticket beside the draw button and started
   by the draw. Three pieces, in this order: ~~generalise `tvDrawSettings.js` to
   a device override (keeping its storage prefix) with an off-by-default surface
   default for the web~~ (landed as `src/utils/deviceDrawSettings.js`); move
   `theaterQueue.js` and `youtubePlayer.js` out of `src/tv/`; then the ticket and the web pre-roll overlay, with a visible exit,
   `playsinline=1`, and the tap-to-start fallback for a refused autoplay. The
   ticket renders only when `canCurrentUserDraw`, and the pre-roll starts on the
   draw with no confirmation. This is the real feature
   and the rest depends on it.
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
