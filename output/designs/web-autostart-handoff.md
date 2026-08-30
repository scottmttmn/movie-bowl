# Web Auto-Start Handoff

Status: **plan, not implemented.**

Closes the last gap in the theater ritual without a LAN bridge or a native
shell: at the end of the pre-roll, the app navigates the television to the
feature itself instead of parking on a focused button. It ships on the web tier
that exists today, and it is the cheapest way to answer the question phase 3 of
`tv-theater-mode.md` was built to ask — does automatic playback actually beat a
single OK press?

This is a probe, not a replacement for phases 3 and 4. See "What this does not
replace" below.

## Where the ritual stops today

`TvTheaterPreroll` runs the previews, shows the "Feature Presentation" card for
`FEATURE_CARD_MS`, then calls `onFinish` — `endTheater` in `TvTonightScreen.jsx:886`,
which tears the overlay down and returns to the reveal. The room is now looking
at an anchor at `TvTonightScreen.jsx:565` reading "Open [service]", holding
autofocus, waiting to be pressed.

Everything before that point is automatic. The last step is the only one that
asks the room to do something, and it arrives precisely when the lights are
down.

## Two problems wearing one name

"Autoplay on web" is really two questions with different answers, and conflating
them is why this looked blocked.

### Navigating without a press — solved, with a cost

Nothing platform-level stops the app from leaving on its own. One constraint
shapes the implementation: the current anchor opens in a new tab, and a scripted
`window.open` after a multi-minute pre-roll is popup-blocked, because transient
activation expires seconds after the draw press that started the sequence. A
top-level `location.assign()` is not gated that way and works from a timer.

The cost is real and is the main thing to decide: top-level navigation leaves
Movie Bowl. On a television browser with no tab affordance, returning means
navigating back by hand. There is no version of this that both starts the movie
unattended and keeps the app alive behind it.

### The provider then playing — mostly not reachable

Watchmode sells us *detail* pages, not playback. The stored shape is
`https://www.netflix.com/title/123` and `https://www.hulu.com/movie/arrival`;
`resolvePreferredLaunchTarget` labels exactly this case `linkType: "title"`.
Auto-navigating there still leaves a Play press — it just leaves it on the
provider's screen instead of ours.

Whether a detail URL can be rewritten into a playback URL is per-service, and
the answer turns on one thing: whether the playback route reuses the id already
in the detail URL.

| Service | Stored detail URL | Playback route | Rewritable? |
| --- | --- | --- | --- |
| Netflix | `/title/<id>` | `/watch/<id>` | Yes — same id |
| Prime Video | detail page | detail page + autoplay param | Probably |
| Disney+ | `/movies/<slug>/<id>` | `/video/<uuid>` | No — different id |
| Hulu | `/movie/<slug>` | `/watch/<uuid>` | No — different id |
| Max | `/movie/<id>` | `/video/watch/<id>` | No — different id |
| Peacock | asset page | `/watch/playback/vod/<id>` | No — different id |
| Apple TV+ | `/movie/<id>` | no reliable param | No |
| Paramount+ | `/movies/<slug>` | `/movies/video/<id>` | No — different id |

**Every row of this table is expected behavior, not verified behavior.** It must
be checked against real Watchmode payloads in a signed-in browser before any of
it is written into code — `provider-deep-links.md` records what a live lookup
actually returned and when, and this deserves the same treatment. The Netflix row
is the one worth verifying first; it carries the feature on its own.

So the honest ceiling: auto-navigate always, genuinely autoplay on one or two
services of eight, and only where that television browser is signed in.

## The change

Three pieces, all inside the TV surface.

**A rewrite step in `utils/webLaunch.js`.** A `resolvePlaybackUrl(launchTarget)`
that returns a playback URL for the services whose transform is verified, and
`null` for everyone else. Pure, table-driven, unit-testable without a network —
the same shape as the existing search-URL map it sits beside.

**A navigation hook at the end of the pre-roll.** The "Feature Presentation"
card is already a timed phase that ends in `finishRef.current()`; auto-start is
that same moment calling `location.assign()` instead. The card is the
confirmation countdown — the room can hit back or exit during it.

**A setting.** `theaterAutoStart` alongside `theaterModeEnabled` and
`theaterTrailerCount` in `drawSettings.js:34-36`, default off, set on the phone
like the rest of theater mode.

### When it is allowed to fire

Narrow on purpose:

- Only with `linkType: "title"`. A `"search"` candidate means the lookup missed
  or the quota is spent, and dumping an unattended room on a search results page
  is strictly worse than the button.
- Only when `resolvePlaybackUrl` returns a URL. A detail page reached by a press
  is a fine outcome; a detail page reached by silently teleporting the
  television is a confusing one.
- TV only. The phone's `enablePreferredWebLaunch` path
  (`BowlDashboard.jsx:322`) is untouched — nobody is watching the feature on the
  device they drew from.

Every other case ends exactly where it ends today: the focused "Open [service]"
button, the voice card, the attribution line.

## What this does not replace

Phase 4's realistic outcome is also a press: the roadmap says most provider apps
open on the title's detail page, one OK-press from play. So this gets close to
the same end state for a fraction of the work — but "close" hides what the
native shell is actually for. It launches the provider's *native app* rather
than a browser page: a better player, a remote that behaves, and a Movie Bowl
session that survives the handoff. None of that is reachable from a tab.

What this buys is the answer to phase 3's gate, months earlier and without
hardware. If the room does not care that the movie started itself, phases 3 and
4 lose their reason to exist and the roadmap gets shorter. That is worth
knowing before buying a Roku.

## The real trade

The television browser tier is thin, and this feature lives entirely inside it.
Google TV ships without a browser and Roku has none, so per the Test Hardware
notes in `tv-theater-mode.md` the realistic audience is Fire OS Silk or a laptop
on the HDMI input. This is a feature for the setups that already run `/tv` in a
browser, which is not most televisions.

Set against that: it is a pure-client change, it spends no vendor quota beyond
the lookups phase 2 already makes, and it is deletable in one commit if the room
hates it.

One compliance note. A rewritten URL is still derived from Watchmode data, so
the free plan's linked-attribution requirement and the 29-day retention rule
both continue to apply — `ProviderLinksAttribution` stays rendered, and nothing
about the cache lifecycle changes.

## Open Questions

- Should the "Feature Presentation" card gain a visible countdown when
  auto-start is armed, or does an unannounced navigation read as more magical?
- If the room is not signed in to the service, the provider bounces to a login
  wall with the lights down. Is that recoverable enough to ship, or does
  auto-start need a way back to Movie Bowl?
- Should auto-start imply theater mode, or can a bowl auto-start straight off
  the reveal with no previews at all?
- Is one verified service (Netflix) enough to ship behind the setting, or does
  a feature this invisible need broader coverage before anyone is offered it?
