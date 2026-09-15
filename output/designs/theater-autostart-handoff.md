# Theater Auto-Start Handoff

Status: **implemented; verified on hardware for Max on the television and
Paramount+ on a desktop browser (September 14, 2026).** The remaining checks
under "Testing" are marked as such. Replaces the browser-era "Web Auto-Start
Handoff" plan, which was written before the Google TV app and the web pre-roll
existed.

When theater mode's pre-roll ends, the device that played it opens tonight's
movie on its streaming service by itself, instead of parking on a button. It is
the last unattended step of the ritual in `tv-theater-mode.md`: **draw, reveal,
trailers, feature presentation, movie.**

Theater mode runs on two surfaces, and this lands on both of them in different
ways and skips a third:

| Surface | Pre-roll | Auto-start | How |
| --- | --- | --- | --- |
| Google TV app | `TvTheaterPreroll` | Yes | Provider app opens on top of Movie Bowl |
| Desktop browser | `TheaterPreroll` | Yes | The tab goes to the provider's title page |
| Phone browser | `TheaterPreroll` | No | Ends on the reveal, as today |

## Where the ritual stops today

Both pre-rolls end with the "Feature Presentation" card for `FEATURE_CARD_MS`
(3.6 seconds), then call `onFinish`, which tears the overlay down over the
reveal. The television is then looking at a focused "Open [service]" anchor; the
web at the reveal modal's "Open on Web in [service]" link. Everything before
that point is automatic. The one step that asks the room to do something arrives
precisely when the lights are down.

## Why the old plan is out of date

The old plan assumed `/tv` in a television *browser*, which carried two costs: a
scripted `window.open` after a multi-minute pre-roll is popup-blocked, and a
top-level navigation leaves Movie Bowl on a browser with no Back. It also
assumed nobody watches the feature on the device that drew, which stopped being
true when theater mode came to the dashboard draw.

**In the Google TV app neither cost exists.**

- **Nothing is popup-blocked.** `MainActivity` sets
  `setJavaScriptCanOpenWindowsAutomatically(true)`, and every new window lands
  in `onCreateWindow`, which hands the URL to `openExternal` without loading it.
- **Movie Bowl survives the handoff.** `openExternal` fires an `ACTION_VIEW`
  intent pinned to the provider's package, so the streaming app opens on top of
  ours. Back returns to the reveal, which `externalReturn.js` restores for 30
  minutes.
- **Fallbacks already exist.** A missing app dispatches
  `moviebowl:provider-launch-error`, which the reveal renders as "[Service] isn't
  installed on this TV." beside the button.
- **The web can tell it is inside the app.** The shell appends
  `MovieBowlTV/0.1 AndroidTV` to the user agent, and has since `versionCode 1`,
  so none of this needs a new Android build.

**On a desktop browser one cost remains, and it is small.** The popup block
still applies, so a new tab is out. A same-tab `location.assign()` is not gated
on a recent click and works from a timer. It does leave Movie Bowl, but a
desktop browser has a Back button, which the old television browser did not.

**On a phone the handoff itself fails.** A provider's web title URL only opens
its app through Universal Links on iOS or App Links on Android, and both
platforms generally hand off to the app only when the navigation comes from a
tap. Navigation started by a timer is expected to stay in the browser, landing
on the provider's mobile site, which mostly tells people to get the app. That is
worse than the button a tap would have used, so the phone keeps the button. This
is platform documentation, not a device test; if a phone check ever shows
otherwise, the phone row can change.

## Two questions, answered separately

**Opening the movie, unattended — reachable now.** This is the feature. On the
television a title link opens the provider's app on the movie itself, confirmed
for Max on the onn Google TV box (`tv-android/README.md`). On a desktop it opens
the provider's title page in a signed-in browser.

**The movie then playing — mostly not reachable, and not in the first build.**
Watchmode supplies *detail* page URLs. Most providers open those on the title's
page, one press or click from play. Genuine autoplay needs a per-service rewrite
from detail URL to playback URL, and only services whose playback route reuses
the detail id are candidates:

| Service | Stored detail URL | Playback route | Rewritable? |
| --- | --- | --- | --- |
| Netflix | `/title/<id>` | `/watch/<id>` | Probably — same id |
| Prime Video | detail page | detail page + autoplay param | Maybe |
| Disney+ | `/movies/<slug>/<id>` | `/video/<uuid>` | No — different id |
| Hulu | `/movie/<slug>` | `/watch/<uuid>` | No — different id |
| Max | `/movie/<id>` | `/video/watch/<id>` | No — different id |
| Peacock | asset page | `/watch/playback/vod/<id>` | No — different id |
| Apple TV+ | `/movie/<id>` | no reliable param | No |
| Paramount+ | `/movies/<slug>` | `/movies/video/<id>` | No — different id |

Every row is expected behaviour, none of it verified. The Netflix row needs two
checks before any rewrite is built: sample a real Watchmode `web_url` for a
Netflix title out of the provider-links cache (every Netflix URL in this repo is
a synthetic test fixture), then open `/watch/<id>` in the Netflix app on the
television and in a signed-in desktop browser and see whether it plays. A
rewrite that is not verified does not ship; the detail page is a fine outcome
and a wrong one is not.

## The change

All of it is web code. No Android build, no migration, no API change.

**A pure decision in `utils/webLaunch.js`.**
`getAutoStartMode({ surface, launchCandidate, launchError })` returns
`"window"` (the TV app), `"navigate"` (desktop), or `null`. Pure and
table-tested, like the rest of that file. The environment is read once, outside
it, and passed in as `surface`: `"tv-app"` when the user agent carries
`MovieBowlTV`, `"desktop"` when `matchMedia("(pointer: fine)")` matches,
otherwise `"touch"`. The primary pointer is the right question rather than
screen width: a touchscreen laptop still reports a fine primary pointer, and a
phone or tablet reports a coarse one. When it guesses wrong it guesses toward
the button, which is the safe direction.

**One launch path per surface.** The television's anchor `onClick` and its
auto-start both call one `beginProviderLaunch` in `TvTonightScreen.jsx`: clear
`providerLaunchMessage` and `rememberExternalReturn`. The auto-start then opens
the URL as a new window, where the anchor's own `href` does the same.
The dashboard's auto-start calls `location.assign` with the same
`preferredWebLaunchCandidate` its "Open on Web" link renders, so the two can
never point at different pages. Both anchors keep their `href`.

**Two exits from each pre-roll, not one.** Both components currently route
every ending through the same `onFinish`: the timer after the feature card, and
the exits — Back on the television, Escape and the Exit button on the web.
Auto-start must follow only the first. Each pre-roll gains an `onComplete` for
the natural end, and `onFinish` stays the exit. The card is the countdown, and
the exit already works during it.

### When it fires

- **Only in theater mode, only at the natural end of the pre-roll.** Not after
  Back, Escape, or Exit; not on a draw with theater mode off; not when no
  previews could be found, since the pre-roll never plays then.
- **Only with `linkType: "title"`.** A search link means the lookup missed, is
  disabled, or the quota is spent. Dropping an unattended room on a provider's
  search screen is worse than the button.
- **Only once per draw,** and not after a launch error is already showing.
- **Television only:** never on a reveal restored by `readExternalReturn`.
  Coming back from the provider app must not throw the room straight back in.
- **Desktop only:** only when the dashboard would render the "Open on Web" link
  at all, which means `enablePreferredWebLaunch` is on — auto-start never
  launches something the reveal would not have offered. And only while the tab
  is visible: previews left playing in a background tab should not navigate it
  out from under someone working elsewhere.

Every other case ends exactly where it ends today.

### Fallbacks, in order

Television:

1. App installed → the app opens on the movie.
2. App missing → the shell's error event → "[Service] isn't installed on this
   TV." with the button still focused.
3. App installed but signed out → the provider's sign-in screen; Back returns
   to the reveal. Recoverable, so it ships.
4. Search link or no link → no auto-start; today's reveal.

Desktop:

1. Signed in → the provider's title page.
2. Signed out → the provider's sign-in page; browser Back returns to the bowl.
3. Search link, no link, or the setting off → no auto-start; today's reveal.

### What browser Back returns to

A desktop tab that navigated away comes back through a bfcache restore or a
fresh load. The bowl is there with tonight's pick in its watched list, but the
reveal modal is not, because the dashboard's drawn result lives only in React
state. The television solved the same problem with `externalReturn.js`; the
dashboard could reuse that pattern, but the watched list already shows what was
drawn, so the first build accepts it. Separately, `useAppUpdate` may reload on
that bfcache restore if a deploy landed during the movie, which is its intended
behaviour and loses nothing further.

## Consent and settings

No new setting. Theater mode is already an explicit, per-device choice of the
whole ritual — the ticket beside the draw button on the web, the ticket on the
television — and the Success Test names the movie as its last step. The feature
card is the confirmation, and the exit is the escape.

The one visible change: when auto-start is armed, the feature card shows the
service's logo under the title, so what happens next is announced without a
sentence of copy.

This is reversible in one commit per surface. The television half is visible
today only to the owner-only Play testers; the desktop half reaches every
desktop user who has both theater mode and the preferred-app setting on, which
is the reason it waits on the same checks rather than shipping first.

## Testing

- `getAutoStartMode`: every surface and condition above, true and false.
- `TvTonightScreen`: completing the pre-roll launches once; Back during it does
  not; a restored reveal does not; a search-link candidate does not.
- `BowlDashboard`: completing the pre-roll calls `location.assign` once on a
  fine pointer; Escape and Exit do not; a coarse pointer does not; the setting
  off does not; a hidden tab does not.
- Playwright does not cover it. The smoke suite has no YouTube player fake, so
  it cannot run a pre-roll to its end; the desktop/phone split is held by the
  `BowlDashboard` tests above, which stub the primary pointer instead.
- On the onn box, recorded in the compatibility record Milestone 5 of the Play
  roadmap asks for. Items 1-4 and 6 passed on September 14, 2026:
  1. Pre-roll ends → Max opens on the drawn title with no press. **Passed.**
  2. Back from Max → the reveal, and no second launch. **Passed.** It takes
     three presses of Back to get there, which is Max's own back stack rather
     than ours; accepted for now.
  3. Back during the feature card → the reveal, no launch. **Passed.**
  4. A service whose app is not installed → the error line, button focused.
     **Passed.** The button stays pressable beside the error, which is a
     follow-up in `TODO.md`.
  5. Provider links disabled → the reveal as today. *Not yet run.*
  6. Whether a script-opened window reaches `onCreateWindow` exactly as the
     anchor does. **Passed** — item 1 is the proof.
- On a desktop browser: the same flow in Chrome and Safari, signed in and
  signed out, including Back to the bowl. Paramount+ passed signed in on
  September 14, 2026: the tab lands on the provider's title page. The reveal
  flashes for a moment between the feature card and the provider page, because
  `completeTheater` tears the overlay down before `location.assign` has anything
  to show; that is a follow-up in `TODO.md`. Signed out, the second browser,
  and Back to the bowl are *not yet run.*

## Compliance

A launched URL is still Watchmode data. The free plan's linked-attribution
requirement and 29-day retention continue to apply; `ProviderLinksAttribution`
stays on both reveals, and the cache lifecycle is unchanged.

## Open Questions

- Should a draw with theater mode off also auto-start straight off the reveal?
  This plan says no: without the pre-roll there is no countdown and no consent.
- Is the Netflix playback rewrite worth building if only Netflix verifies, or is
  "opens on the movie" the finished feature?
- Should the dashboard restore its reveal after browser Back, as the television
  does, or is the watched list enough?
