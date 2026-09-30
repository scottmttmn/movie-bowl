# Streaming-aware search

Status: planned September 30, 2026; not implemented.

## Decision

Help people find movies they can watch on the services in their profile. The
main use case is choosing a person in the search revamp -- for example, a
director -- and then narrowing or ordering that person's filmography by the
services the viewer already has.

Availability is discovery information, not a promise about a future movie
night. Do not explain that streaming catalogs change: people already understand
that, and permanent caveat copy would only add noise. Do keep the existing
honest failure state when availability cannot be checked.

The bowl preserves intent independently of provider data. A title is never
removed from a bowl because it leaves a service. Availability is checked again
when the title is drawn, using the existing provider and rental-link behavior.

## Experience

### Start with ranking

Add **On my services first** to a person's movie results. It promotes verified
matches on any service saved in the viewer's profile and leaves every other
movie visible below them. Keep each row's existing provider line so the reason
for the promotion is apparent.

This is the first release because the current result enrichment is deliberately
partial and asynchronous. An unchecked row is unknown, not a non-match, and a
failed provider lookup must stay visible. Reordering should be stable within
each group and should not move the row the keyboard highlight or open details
belongs to. Prefer applying the new order as a settled batch rather than moving
individual rows each time a provider request returns.

The control belongs beside the Acting / Directing control in the compact
person-filmography header. It applies to both roles and survives switching
roles for that person. A new query or a new search session resets it unless
product use shows that it should become a remembered preference.

### Add strict filtering only with complete answers

The later **On my services** filter hides nonmatching titles. Multiple selected
services use OR semantics: a movie available on any selected service matches.
There is no "available on all services" mode.

For this filter, "available" means the existing eligible provider groups:
subscription, free, or ad-supported. Rental and purchase availability do not
qualify. Individual provider chips can follow later if one combined filter is
not enough; do not put a multi-service editor in the first version.

Do not ship strict filtering by filtering only the rows whose provider requests
happen to have completed. It would produce false empty states and omit valid
movies. It needs a complete server-side answer for the selected person, role,
region, and provider IDs, or another bounded mechanism that can establish the
availability of the whole candidate set before presenting the filtered list.
Until that exists, ranking is the honest UI.

### States and copy

- With no services configured, omit or disable the control and point to the
  existing profile service editor only if the empty state needs an action.
- During ranking, retain ordinary results while provider checks settle. Do not
  replace the filmography with a full-page availability spinner.
- A failed check remains **Couldn't check availability** and never counts as a
  negative match.
- A true filtered empty state says that no movies in this filmography are
  currently on the viewer's services and offers to show all movies.
- Do not add generic "availability may change" copy or fetched-at timestamps.

Title-query results can adopt the same ranking later, but person results are the
first scope and the reason for the feature. Public add links need an explicit
privacy decision before using the signed-in viewer's profile services; do not
silently disclose a bowl owner's services to a guest.

## Engineering shape

Today `MovieSearch` enriches no more than eight rows at a time with four
concurrent provider requests. Person credits arrive as a complete list but are
revealed in local batches of twenty. That is suitable for row labels and a
progressive ranking experiment, not for a complete filter.

### Phase 1: provider-aware ranking

1. Add a person-result ranking state to `MovieSearch` or
   `usePersonDiscovery`; keep the unmodified role list as the source of truth.
2. Partition the settled visible batch into verified matches and everything
   else. A match uses the same normalized service comparison as the provider
   line. Preserve the existing filmography order inside both partitions.
3. Treat loading, unavailable, and failed entries as unknown and retain them in
   the second partition. Never present them as verified nonmatches.
4. Keep selection, Details -> Back restoration, Show more, role changes, and
   repeated adds working against movie identity rather than a transient row
   index.
5. Measure use of the ordering control and adds from matching versus other
   rows before investing in complete filtering.

The search-revamp plan says provider data must not reorder a list underneath
someone. That remains the default behavior; this explicit control is the
deliberate exception and must meet the settled-batch and stable-focus rules
above.

### Phase 2: complete filtering

1. Spike whether TMDB can return a complete person-and-provider result with the
   required exact Director classification. Do not replace the current
   `job === "Director"` credit rule with a broader crew match merely to use a
   discovery endpoint.
2. If TMDB cannot combine the constraints faithfully, compare a server-side
   bounded availability pass with a cached provider index. Record request and
   cache costs before choosing one.
3. Extend the existing TMDB search route rather than adding a Vercel function.
   Validate person ID, role, region, provider IDs, monetization groups, and
   pagination; never accept an arbitrary upstream path.
4. Return an answer whose count and pagination describe the filtered set, so
   Show more and the empty state cannot contradict each other.
5. Keep region explicit. The first version remains US-only, matching current
   search availability; region selection is separate work.

## Acceptance checks

- Selecting a director and enabling ranking puts verified movies from any of
  the viewer's configured services first without hiding the rest.
- A subscription/free/ad-supported match qualifies; rent-only and buy-only do
  not.
- Loading and failed provider lookups never make a title disappear or produce
  a false "no movies" state.
- Switching Acting / Directing, showing more movies, opening Details and going
  back, keyboard navigation, and adding several movies retain their current
  contracts.
- A provider change never removes or alters a saved bowl title.
- Draw-time provider lookup remains the current source of truth for watching
  the selected title.
- No generic catalog-volatility warning is added.

## Not in scope

- Guaranteeing future availability.
- Removing bowl titles when availability changes.
- Rentals or purchases qualifying for **On my services**.
- An AND mode across selected providers.
- Remembering the ranking/filter as an account preference in the first release.
- Changing bowl draw filters or their existing streaming-priority semantics.
