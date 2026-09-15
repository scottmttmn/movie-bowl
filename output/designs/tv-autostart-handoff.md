# TV Auto-Start Handoff

Status: **plan, not implemented.** Replaces the browser-era "Web Auto-Start
Handoff" plan, which was written before the Google TV app existed and whose
two costs no longer apply.

At the end of the trailer pre-roll, the television opens tonight's movie in its
streaming app by itself, instead of parking on a focused "Open [service]"
button. It is the last unattended step of the ritual in `tv-theater-mode.md`:
**draw, reveal, trailers, feature presentation, movie.**

## Where the ritual stops today

`TvTheaterPreroll` runs the previews, shows the "Feature Presentation" card for
`FEATURE_CARD_MS` (3.6 seconds), then calls `onFinish` — `endTheater` in
`TvTonightScreen.jsx`, which tears the overlay down and returns to the reveal.
The room is now looking at the "Open [service]" anchor, holding autofocus,
waiting to be pressed. Everything before that point is automatic; the one step
that asks the room to do something arrives precisely when the lights are down.

## Why the old plan is out of date

The old plan assumed `/tv` running in a television *browser*, which carried two
costs: a scripted `window.open` after a multi-minute pre-roll is popup-blocked,
and the `location.assign()` workaround navigates away from Movie Bowl with no
way back on a browser that has no tabs.

The Google TV app is now the only supported television, and neither cost exists
inside it:

- **Nothing is popup-blocked.** `MainActivity` sets
  `setJavaScriptCanOpenWindowsAutomatically(true)`, and every new window lands
  in `onCreateWindow`, which hands the URL to `openExternal` without ever
  loading it.
- **Movie Bowl survives the handoff.** `openExternal` fires an `ACTION_VIEW`
  intent pinned to the provider's package, so the streaming app opens on top of
  ours. Back returns to the reveal, which `externalReturn.js` restores for 30
  minutes.
- **Fallbacks already exist.** A missing app dispatches
  `moviebowl:provider-launch-error`, which the reveal already renders as
  "[Service] isn't installed on this TV." beside the button.
- **The web can tell it is inside the app.** The shell appends
  `MovieBowlTV/0.1 AndroidTV` to the user agent, and has since `versionCode 1`,
  so this needs a web deploy and no new Android build.

## Two questions, answered separately

**Opening the movie in its app, unattended — reachable now.** This is the
feature. A title link opens the provider's app on the movie itself, confirmed
for Max on the onn Google TV box (`tv-android/README.md`).

**The movie then playing — mostly not reachable, and not in the first build.**
Watchmode supplies *detail* page URLs. Most provider apps open those on the
title's page, one OK press from play. Genuine autoplay needs a per-service
rewrite from detail URL to playback URL, and only services whose playback route
reuses the detail id are candidates:

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
checks on the television before any rewrite is built: sample a real Watchmode
`web_url` for a Netflix title out of the provider-links cache (every Netflix URL
in this repo is a synthetic test fixture), then fire `/watch/<id>` at the
Netflix app and see whether it plays. A rewrite that is not verified on hardware
does not ship; the detail page is a fine outcome and a wrong one is not.

## The change

All of it is on the web side, inside the TV surface.

**One launch path.** Extract the button's behaviour — clear
`providerLaunchMessage`, `rememberExternalReturn`, open `webLaunchCandidate.url`
as a new window — into a single `launchProvider` in `TvTonightScreen.jsx`. The
anchor's `onClick` and the auto-start both call it, so an auto-start and a
press can never diverge in what they remember or where they go. The anchor keeps
its `href` so the press still works without JavaScript's help.

**A pure decision in `utils/`.** `shouldAutoStartProvider({ isTvApp,
launchCandidate, launchError })` returns true only when every condition below
holds. Pure and table-tested, like the rest of `webLaunch.js`.

**The trigger.** `TvTheaterPreroll` already ends in `finishRef.current()` after
the feature card. `endTheater` gains a second step: if the decision allows it,
call `launchProvider`. The card is the countdown — Back during it already calls
`endTheater` through `onBack`, so that path must end theater *without*
launching. That means two exits, not one: a finish that launches and a Back that
does not.

### When it fires

Narrow on purpose:

- **Only inside the Google TV app** (`MovieBowlTV` in the user agent). Never on
  a laptop, a phone, or the dashboard draw's theater mode — nobody there is
  watching the feature on the device that drew it.
- **Only at the natural end of the pre-roll.** Not after Back, not on a draw
  with theater mode off, not when no previews could be found (theater never
  plays then), and never on a reveal restored by `readExternalReturn` — coming
  back from the provider app must not throw the room straight back into it.
- **Only with `linkType: "title"`.** A search link means the lookup missed, is
  disabled, or the quota is spent. Dropping an unattended room onto a provider's
  search screen is worse than the button.
- **Only once per draw,** and not after a launch error is already showing.

Every other case ends exactly where it ends today: the reveal, the focused
"Open [service]" button, the attribution line.

### Fallbacks, in order

1. Title link, app installed → the app opens on the movie.
2. Title link, app missing → the shell's error event → the reveal shows
   "[Service] isn't installed on this TV." with the button still focused.
3. Title link, app installed but signed out → the provider's sign-in screen;
   Back returns to the reveal. Recoverable, so it ships.
4. Search link or no link → no auto-start; today's reveal.

## Consent and settings

No new setting. Theater mode on the television is already the room's explicit
choice of the whole ritual, and the Success Test names the movie as its last
step. The feature card is the confirmation, and Back is the escape — the same
unlabelled escape the pre-roll has already proven on hardware.

The one visible change: when auto-start is armed, the feature card shows the
service's logo under the title, so what happens next is announced without a
sentence of copy.

This is reversible in one commit, and the only people who can see it today are
the owner-only Play testers, which is what makes deciding by living with it
cheap.

## Testing

- `shouldAutoStartProvider`: every condition above, true and false.
- `TvTonightScreen`: the pre-roll finishing launches once; Back during the
  pre-roll does not; a restored reveal does not; a search-link candidate does
  not; outside the TV app user agent it does not.
- Playwright stays as is; it runs in a desktop browser, where auto-start must
  not fire, and one assertion there holds that.
- On the onn box, recorded in the compatibility record Milestone 5 of the Play
  roadmap asks for:
  1. Pre-roll ends → Max opens on the drawn title with no press.
  2. Back from Max → the reveal, and no second launch.
  3. Back during the feature card → the reveal, no launch.
  4. A service whose app is not installed → the error line, button focused.
  5. Provider links disabled → the reveal as today.
  6. Whether a script-opened window reaches `onCreateWindow` exactly as the
     anchor does. The shell settings say it will; this is the one mechanism the
     plan has not seen work, so it is the first thing to check.

## Compliance

A launched URL is still Watchmode data. The free plan's linked-attribution
requirement and 29-day retention continue to apply; `ProviderLinksAttribution`
stays on the reveal the room returns to, and the cache lifecycle is unchanged.

## Open Questions

- Should a draw with theater mode off also auto-start straight off the reveal?
  This plan says no: without the pre-roll there is no countdown and no consent.
- Is the Netflix playback rewrite worth building if only Netflix verifies, or is
  "opens on the movie" the finished feature?
