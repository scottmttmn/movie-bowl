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
4. Present provider launch buttons if automatic handoff is unavailable.

The preferred provider should follow the signed-in user's saved streaming-service
priority when the selected movie is available from more than one service.

Direct playback cannot be assumed across every television and provider. TMDB
provider data identifies availability but does not supply full provider playback
links. A production implementation will require a platform capability matrix and
possibly provider-specific content identifiers or partnerships.

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
