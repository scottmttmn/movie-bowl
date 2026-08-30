# TV Theater Mode

Status: future product concept; not scheduled for implementation. The roadmap
below sequences the work if it is picked up; it is not a commitment to build.

## Product Idea

Theater mode is an optional post-draw experience for Movie Bowl on a television.
After the bowl selects and reveals tonight's movie, the app plays a short sequence
of trailers from other movies still in the bowl. When the trailers finish, Movie
Bowl hands off to the selected feature.

This is deliberately different from playing trailers before the draw. The group
honors the bowl's selection first; the trailers then become a theatrical pre-roll
and a preview of possible future movie nights.

## Intended Flow

1. The group draws a movie normally.
2. Movie Bowl reveals the selected feature.
3. If Theater mode is enabled, the app announces how many trailers will play.
4. Trailers from other undrawn movies in the current bowl play automatically.
5. A short "Feature Presentation" transition appears.
6. Movie Bowl starts the selected film when direct playback is supported.
7. When direct playback is unavailable, the experience ends on a focused
   "Start feature on [service]" action.

## Experience Principles

- Theater mode is opt-in and is never the default.
- The draw result is final before the trailer sequence begins.
- Theater mode must not alter draw eligibility, contributor fairness, or draw odds.
- Do not play the selected movie's own trailer.
- Prefer trailers from movies that remain eligible in the current bowl.
- Avoid repeating a trailer until the available trailer pool has cycled.
- Keep setup off the main TV surface when possible; configuration can live in
  user settings on a phone.
- Preserve a simple remote experience with clear pause, skip, and exit behavior.
- Captions and predictable volume should be supported where trailer sources allow.

## Possible Settings

- Theater mode on/off
- Number of trailers, such as 1-4
- Approximate pre-roll duration
- Automatically start the feature when supported
- Trailer captions preference

The first version should favor one simple choice, such as "Play three trailers,"
instead of exposing a dense set of TV controls.

## Playback Handoff

The handoff should use progressive enhancement:

1. Start the exact feature through a verified provider playback deep link.
2. Open the selected movie's provider detail page.
3. Open the preferred provider with the title and year already searched.
4. Show the exact voice command for the room's TV assistant
   (for example: "Hold the mic button and say: Play [title] on [service]").
5. Present provider launch buttons if automatic handoff is unavailable.

The preferred provider should follow the signed-in user's saved streaming-service
priority when the selected movie is available from more than one service.

Direct playback cannot be assumed across every television and provider. TMDB
provider data identifies availability but does not supply full provider playback
links; a separate deep-link data source closes that gap (see below).

## Handoff Feasibility Ladder

Research notes as of mid-2026. Steps 1-2 are not reachable from a web page
running in a TV browser, but they are reachable by other routes.

### Step 0 (any version): per-title deep-link data

Services such as Watchmode and the Streaming Availability API (Movie of the
Night) map TMDB IDs to per-provider title links (web URLs plus iOS/Android
deep links). This upgrades the current provider *search* link to a direct
title page — which on a signed-in browser effectively starts the movie.
This is the single cheapest improvement and benefits phone and TV alike.

### Web app on a TV browser (current architecture)

Ceiling: a direct provider title link plus the voice-command card (ladder
steps 2-5). A browser tab cannot launch native TV apps, and assistant
platforms (Gemini on Google TV, Alexa, Siri) expose no third-party API for
injecting "play X on Y" commands — the voice command must be spoken by a
person, so we display it rather than send it.

### Personal/LAN setups (full auto-start, not distributable)

- Roku External Control Protocol: unauthenticated LAN HTTP
  (`POST :8060/launch/<channel>?contentId=...&mediaType=movie`) launches a
  provider channel directly into a title. Needs a small LAN bridge (for
  example a Home Assistant webhook) because HTTPS pages cannot call LAN HTTP.
- Android TV / Fire TV via ADB: fire a VIEW intent at the provider title
  URL; Home Assistant's androidtv integration wraps this.

These fully realize draw → trailers → feature-starts-itself for a household
that runs the bridge, and are a good validation step before any native app.

### Native shell app (the distributable version of steps 1-2)

A thin Android TV WebView shell around the existing `/tv` route, with a small
JS bridge exposing a `launchDeepLink(url)` call that fires an ACTION_VIEW
intent. The intent carries the cached *web* URL, not a native scheme: Android
App Links resolve it into the provider's app. Confirmed end to end for Max on
an onn Google TV box running Android 14 — see the hardware note in
`provider-deep-links.md`. The existing spatial navigation already handles D-pad input, so the
web UI carries over as-is. Most provider apps open on the title's detail page
(one OK-press from play); some start playback directly. Roku/tvOS/Tizen/webOS
ports are separate platforms and are out of scope for a first native version.

Target Google TV / Android TV, not Fire TV. Amazon is replacing Fire OS (an
Android fork) with Vega OS, a Linux platform that does not run Android apps
and has no consumer sideloading. The Fire TV Stick 4K Select (2025) and Fire
TV Stick HD (2026) already ship with Vega, and Amazon has said future sticks
will too. An Android shell therefore covers Google TV plus older Fire OS
hardware only, and the Fire OS share shrinks over time.

## Test Hardware

No specific television is required — every route below runs on a streaming
device plugged into any HDMI set.

- Most of the TV UI (layout, D-pad focus order, draw and reveal flow) can be
  exercised in a desktop browser using arrow keys; hardware is only needed for
  autoplay policy and the playback handoff.
- Google TV device with developer options and network ADB enabled: the primary
  target. Covers sideloading the native shell, firing VIEW intents for
  auto-start, and testing the Gemini voice-command card. A browser must be
  sideloaded (Google TV ships without one) to test the pure-web tier.
- Fire TV Stick 4K Max or 4K Plus (Fire OS, not Vega): useful because Silk is
  a preinstalled browser, so the web tier can be tested with no sideloading.
  Treat as a compatibility check, not the build target.
- Roku (any current model): the quickest end-to-end auto-start demo through
  ECP on port 8060, with no developer account or ADB. Roku has no web browser,
  so the TV UI cannot run on it; drive the draw from a phone for this test.

## Cost and Quota Protection

Theater mode should stay effectively free at hobby scale and degrade
gracefully instead of billing anyone if usage spikes:

- Deep-link lookups must be cached server-side (for example a Supabase table
  keyed by TMDB ID and region, refreshed on the order of weeks). Lookups then
  scale with unique movies added, not with draws, viewers, or movie nights.
- Free tiers (Watchmode ~2,500 requests/month; Streaming Availability API
  ~100/day) require no payment card, so the overrun failure mode is a 429
  response, never a surprise bill. Keep no card attached until scale demands it.
- The API key lives server-side behind the existing serverless proxy, with a
  monthly usage counter and a kill switch.
- When the quota is exhausted or a lookup fails, the handoff silently falls
  back to the current provider search link — the feature never blocks on the
  paid data source.
- Trailers are YouTube iframe embeds driven by TMDB video keys: no YouTube
  Data API quota and no cost.
- One-time platform costs if a native shell ships publicly: Google Play
  developer registration (about $25 once); Amazon Appstore registration is
  free; sideloading for personal use costs nothing.

## Roadmap

Each phase is independently useful and ships on its own, and each de-risks the
one after it. Phase 1 stands alone; phases 3 and 4 both need the deep-link data
from phase 2. Three of the open questions below block phase 1: trailer count,
whether skip is offered alongside pause and exit, and whether theater mode is a
user preference or a per-TV choice.

### Phase 1 — Trailer pre-roll (web only, no new services) — SHIPPED

Ships the ritual itself: draw → reveal → trailers → "Feature Presentation" →
the existing "Open in [service]" action.

Implemented in `src/tv/utils/theaterQueue.js`, `src/tv/components/TvTheaterPreroll.jsx`,
and the theater settings in `src/utils/drawSettings.js`. Decisions taken from
the principles above: three previews by default (1-4 configurable), pause plus
skip plus exit on the remote, and a per-user preference set on the phone.

- Trailer queue state in `TvTonightScreen`, entered only after the pick is kept.
- Reuse a single `YT.Player` and call `loadVideoById()` between trailers instead
  of remounting the iframe, so the draw button press keeps satisfying autoplay
  policy and fullscreen is requested once.
- Build a candidate pool from `bowl.remaining`; TMDB detail lookups supply the
  trailers. Exclude the drawn title and anything without an official trailer,
  and preload the next trailer while the current one plays.
- Rank that pool through `getResolvedDrawPool`, the same resolver the draw uses,
  so previews lead with titles tonight's filters could still reach. The rest of
  the bowl only backfills, which keeps "prefer trailers from movies that remain
  eligible" true without ever losing the pre-roll. See
  `deterministic-draw-preview.md` for how far this idea can be pushed.
- Keep a recently-played video-key list per device so trailers do not repeat.
- Handle pause, skip, and exit through the existing spatial navigation chain.
- One setting to start: theater mode on/off plus trailer count, stored with the
  existing profile draw settings.

Gate: does the group enjoy the pre-roll, or do they want the movie now? If it is
not fun, stop here — every later phase is handoff work that stands on its own.

### Phase 2 — Real deep links and the voice card (web only)

Implemented in `provider-deep-links.md`, disabled by default until configured.
That document covers the vendor, cache, quota enforcement, and current
free-plan limitations. Summary:

- Add a deep-link provider behind the existing serverless API layer, with the
  key server-side, a monthly usage counter, and a kill switch.
- Look a title up after a member adds it and when it is drawn; cache the answer
  in Supabase keyed by TMDB ID and region. Public adds do not spend quota.
- Upgrade the launch candidate to prefer a direct provider title URL, falling
  back to today's search URL when a lookup is missing or the quota is spent.
- Show the spoken assistant command on the handoff card.

This improves the phone experience too, so it is worth doing even if theater
mode never ships.

### Phase 2.5 — Web auto-start (optional probe, web only)

Navigate the television to the feature at the end of the pre-roll instead of
ending on a focused button. Reaches real playback only where a provider's detail
URL rewrites into a watch URL, so it is partial by nature — but it is a pure
client change on top of phase 2 and answers phase 3's gate without hardware.
Skippable: phase 3 does not depend on it. See `web-autostart-handoff.md`.

### Phase 3 — Personal auto-start over the LAN (household only)

A Roku ECP call or an ADB VIEW intent fired by a bridge on the home network.
Not distributable and not a product feature; the point is to feel the complete
ritual end to end and learn whether automatic playback actually beats a single
OK press.

The intent half is already demonstrated: fired by hand from a laptop over
wireless debugging, a title URL cold-starts Max on the title (see the hardware
note in `provider-deep-links.md`). What remains is the glue that fires it when a
draw lands, since an HTTPS page cannot reach the LAN. The gate question is
therefore answerable before any bridge exists — draw, then fire the intent by
hand from the couch, and see whether the room cares.

Gate: if this does not feel like magic in the room, do not build phase 4.

### Phase 4 — Android TV shell

A Kotlin WebView around `/tv` plus a `launchDeepLink(url)` bridge firing an
ACTION_VIEW intent. Sideload for personal use first; a store listing is a
separate decision carrying its own review and maintenance burden.

### Not on this roadmap

tvOS, Roku native (BrightScript), Samsung Tizen, LG webOS, and any attempt to
drive a TV assistant programmatically — no third-party API exists for the last.

## Likely Dependencies

- Reliable trailer discovery for undrawn movies
- Trailer queueing, preloading, and failure recovery
- A record of recently played trailers to prevent repetition
- TV-safe autoplay behavior after the user starts Theater mode
- Provider launch mappings and platform-specific native bridges
- Graceful handling for authentication, profile selection, parental controls,
  unavailable titles, and blocked autoplay

## Open Product Questions

- Should Theater mode be a user preference, a per-TV preference, or chosen each
  movie night?
- Should the group be able to skip trailers, or should only pause and exit be
  available?
- Should trailer selection remain completely random or lightly favor movies from
  different contributors and genres?
- If a trailer fails, should it be silently replaced or should the pre-roll become
  shorter?
- Should the selected feature launch immediately after the final trailer or after
  a brief confirmation countdown?

## Success Test

The experience should feel like a miniature movie theater ritual:

**draw, reveal, trailers, feature presentation, movie.**

It should add anticipation without reopening the choice or encouraging the group
to scroll for a different movie.
