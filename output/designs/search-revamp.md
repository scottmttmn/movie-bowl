# Search revamp: find movies through titles, people, and themes

Status: proposed, September 15, 2026. Planning only; no application changes.
Branch: `codex/search-revamp-plan`, based on `main` at `4c10948` for review.
Initially drafted against `44a4702`; that mobile work has since merged into `main`.

## Recommendation

Keep the familiar search field and movie cards. Add a compact selector above
the field: **Title · Actor · Director · Keyword**, with Title selected when a
new search session opens. People and keywords become paths to the same movie
results and Add/Details actions already in use.

This makes intent explicit with one tap. Someone searching “Jordan” can choose
whether they mean a title or a person; someone searching “heist” can choose
titles containing that word or movies about it. Avoid silently guessing intent
or mixing people, topics, and movies into one relevance ranking in the first
release. A unified search can follow if real usage shows the selector creates
friction.

The scope is catalog discovery wherever the shared search is used. Searching
movies already in a bowl or watch history is a separate feature.

## What works today

- `src/components/MovieSearch.jsx` searches after a 400 ms debounce, supports
  voice input and keyboard selection, shows progress, and offers custom entries.
- Results have posters, years, streaming information, and Add/Details actions.
  Provider enrichment starts with the first eight movies after results arrive.
- `src/lib/tmdbApi.js` calls `api/tmdb/search.js`, which only queries TMDB's
  movie-title endpoint and discards pagination metadata.
- Search is shared by the bowl add dialog, public add links, the standalone
  add modal, and watch-history entry. The bowl flow has its own submission,
  retry, destination, and session-state contracts that must survive this work.
- Existing tests cover voice, offline behavior, feedback, custom additions,
  details, and add failures. Extend these rather than replacing their contracts.

## Proposed experience

| Mode | What the user types | First results | After selection |
| --- | --- | --- | --- |
| Title | A movie title | Existing movie cards | Add or open Details |
| Actor | A person's name | People with photo, name, and recognizable credits | Movies featuring that person |
| Director | A person's name | People with identifying context | Movies they directed |
| Keyword | A theme, such as “time travel” | Named keyword suggestions | Movies tagged with the selected keyword |

Actor and Director should have distinct labels even though they use the same
person lookup. A person can work in both roles. Do not exclude a candidate just
because their primary department is different; verify the selected role from
their movie credits. If that role has no movies, explain this and let the user
switch roles or choose another person.

### People and topics are navigation

Selecting a person or keyword opens movie results with a small context header:
“Movies directed by Sofia Coppola” or “Movies about time travel.” Include
**Change person** or **Change keyword**, returning to the original suggestions
with the query and scroll position intact. Person and keyword rows never have
an Add action. Show missing-photo placeholders and avoid implying that the
small set of identifying credits is the complete filmography.

Movie cards remain familiar. The context header explains why the movies match;
actor results may also show the character name when available. Details → Back
restores mode, selection, result position, and loaded pages. The outer modal's
close action remains distinct from returning to suggestions.

After a successful add, preserve a selected person/keyword and movie list so
someone can add several films from the same discovery session. Clear any
submitted comment and retain existing duplicate/pending protections. Preserve
Title mode's current reset behavior. An explicit controller reset/new session
clears all search context; separate that from successful-add handling.

### Keywords need an honest promise

Use “Search themes, e.g. heist or time travel” as supporting copy. In the first
release, keyword means a catalog topic, not arbitrary plot-description or mood
search. Show the actual matching keyword labels before showing their movies.
Do not automatically combine loosely related tags or silently substitute one.
If no keyword matches, suggest a shorter theme or a switch to Title. Treat
synonyms, genres, and natural-language queries as later research questions.

### Preserve flexible custom entries

Keep the current custom-title/category path in Title mode. In other modes offer
an explicit “Add a custom title or category” action that opens an editable
field; do not automatically turn the person or keyword query into an addable
movie. This retains flexible draws while preventing accidental “Tom Hanks”
entries. Network failure must remain distinguishable from a successful empty
search.

### Mobile, keyboard, and voice

- Keep the selector on one compact row with readable labels and usable touch
  targets; validate at narrow widths with the keyboard open.
- Use an accessible labeled single-choice control for mode selection. Update
  the input's accessible name and helper text for its mode.
- Arrow keys navigate the active result type. Enter chooses a person/keyword
  or retains existing movie-add behavior only for current, settled movie
  results. Editing or changing mode immediately invalidates old selections.
- Voice fills the current mode's query, with mode-specific prompts. Continue
  to use the existing transcription behavior; no spoken command parser yet.
- Announce loading, result counts, selected context, and errors. Review the
  current listbox's nested Add/Details buttons during implementation and use
  semantics that support both keyboard selection and independently focusable
  actions. Escape must not unexpectedly close the outer add flow.

## Retrieval and ordering

TMDB supports separate searches for movies, people, and keywords. Use server
proxy calls with the existing credentials remaining server-side. Official
references checked September 15, 2026:

- Title: preserve [movie search](https://developer.themoviedb.org/reference/search-movie)
  ordering, and return page metadata so users can load further results.
- Person resolution: [people search](https://developer.themoviedb.org/reference/search-person).
  Preserve upstream relevance initially; names plus identifying credits help
  disambiguate. Do not fetch every candidate's filmography while typing.
- Selected person: fetch [movie credits](https://developer.themoviedb.org/reference/person-movie-credits)
  once. Proposed normalization uses cast for Actor, and crew entries whose
  `job` is exactly `Director` for Director. Deduplicate by movie ID, retaining
  useful character information. Confirm these response fields with fixtures
  in the implementation spike. Primary department is insufficient evidence
  that a particular movie was directed by that person.
- Keyword resolution: [keyword search](https://developer.themoviedb.org/reference/search-keyword),
  followed by [movie discovery](https://developer.themoviedb.org/reference/discover-movie)
  using the selected keyword ID in `with_keywords`. The older
  [keyword movies endpoint](https://developer.themoviedb.org/reference/keyword-movies)
  is deprecated. Discovery's `with_crew` should not stand in for a director-role
  check because the filter does not specify the person's job.

For person filmographies, start with popularity descending, then release date
and movie ID as deterministic tie breakers. For keyword discovery, request
popularity descending. Label both “Popular first”; defer sort controls until
the default has been evaluated. Keep title relevance unchanged. Do not promote
or hide movies based on streaming availability: provider data arrives later
and must not reorder a list underneath someone.

Show 20 movies initially with **Load more**. Person credits can be normalized
once and revealed in local batches; upstream title, people, keyword, and
discovery pagination must preserve access beyond the first page. Use distinct
loaded counts and totals; on a later-page error preserve existing rows and
offer retry. Apply an explicit consistent adult-content exclusion, including
credit-derived movies. Keep missing dates/posters and voice performances;
documentary/self credits remain included initially. Confirm actual response
coverage before promising a complete filmography.

## Engineering boundaries

1. Keep `searchTmdbMovies(query)` backward compatible. Add typed-result helper
   contracts for suggestions and movies; movie results retain the existing
   shape used for hydration and addition. Suggestions cannot reach add handlers.
2. Extend the existing search handler with validated actions for title search,
   people search, keywords, person movies, and keyword movies. Validate allowed
   modes, positive IDs, bounded query length, and page values; never accept an
   arbitrary upstream URL. Confirm route conventions before implementation.
3. Extract retrieval state into a focused hook, e.g. `useMovieDiscovery`,
   rather than adding more independent effects to the large search component.
   Track mode, query, selected entity, phase, page, and request identity
   explicitly. Keep submission ownership in the existing add flow.
4. Invalidate requests on input change, mode change, selection change, reset,
   and unmount. Add abort support where practical and retain generation checks.
   The current generation increments when a request starts, so the debounce
   interval needs special care: old results must not become actionable then.
5. Cache bounded search/credit results briefly by all relevant parameters;
   deduplicate in-flight requests. Start with a five-minute session cache and
   a maximum of 50 entries, measuring whether tuning is needed. No database
   migration or new search service is expected for this scope.
6. Keep search independent of provider enrichment. Load providers only for
   visible movie rows with bounded concurrency and the existing cache, never
   for person/keyword suggestions or a whole filmography. Distinguish unchecked,
   loading, failed, and confirmed-empty availability; today's empty-array
   fallback cannot reliably express these states and needs a small contract
   extension that preserves other callers.

## Delivery sequence and review gates

### 1. Validate the interaction and data

Create phone and desktop mockups for all four modes, including person
disambiguation, selected context, empty states, and returning from Details.
Exercise authenticated TMDB requests during the spike to verify credits,
keyword usefulness, language behavior, and large-filmography payloads; this
planning pass checked documentation and code, not live result quality.

Use a small evaluation set: exact title, partial title, same-name people, a
person who both acts and directs, a lesser-known director, a multiword theme,
no-match keyword, missing images, and a large filmography. Record expected
membership and identity, not volatile live popularity positions.

### 2. Implement Title + Actor + Director

Add the selector, suggestion navigation, normalized credits, pagination,
request lifecycle, and preserved discovery context. Gate acceptance on correct
role membership and unchanged add behavior across all shared consumers.

### 3. Implement Keyword and finish shared behavior

Add keyword suggestions/discovery, custom-entry separation, availability
states, accessibility, voice copy, and page retries. All four modes are required
for the planned revamp; phases are implementation slices, not a reduced scope.

### 4. Verify and release

- Unit/API fixtures: validation, role filtering, duplicate credits, content
  exclusion, pagination, upstream failures, and backward-compatible title calls.
- Interaction tests: stale responses during debounce/mode switches; suggestion
  selection cannot add; Details/Back restores context; repeated adds retain a
  discovery session; failed adds retain drafts; explicit reset clears context.
- Regression checks: existing search suites plus bowl destination/retry flows,
  public add, standalone modal, and watch-history selection.
- Browser checks: phone and desktop, keyboard-only navigation, narrow viewport
  with keyboard, supported voice input, slow/offline requests, and Load more.
- Request budget: one lookup per settled query, one credits/discovery request
  after entity selection, and bounded visible-row provider enrichment. Title
  search latency should remain comparable to today's baseline.

Before release, review whether people can find a known movie as quickly as
before and successfully add a movie via each new mode. If measurement is added,
prefer aggregate mode, latency, empty/error, and search-to-add events without
raw queries or names. Keep the title path available throughout rollout.

## Decisions to revisit after the first prototype

- Does explicit mode selection feel natural, or should an eventual All mode
  surface grouped matches? Default recommendation: keep modes for v1.
- Do keyword suggestions match how people describe movies well enough?
  Default: catalog themes first; evaluate a small alias vocabulary afterward.
- Do filmographies need newest-first sorting or filters for self appearances?
  Default: popular first with complete accessible results.
- Should people and themes combine, e.g. actor + heist? Default: one selected
  entity at a time; retain a state model that can evolve without exposing a
  complex filter builder now.
