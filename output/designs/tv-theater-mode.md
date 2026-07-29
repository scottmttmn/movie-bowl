# TV Theater Mode

Status: future product concept; not scheduled for implementation.

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
intent. One build covers Android TV and Fire TV. The existing spatial
navigation already handles D-pad input, so the web UI carries over as-is.
Most provider apps open on the title's detail page (one OK-press from play);
some start playback directly. Roku/tvOS/Tizen/webOS ports are separate
platforms and are explicitly out of scope for a first native version.

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
