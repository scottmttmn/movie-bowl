# Search revamp: find movies through the people in them

Status: proposed September 15, 2026; revised and built September 23, 2026.
All three slices below are live: voice, the new rows and states, and people
(`usePersonDiscovery`, the `person` and `person-movies` actions on
`api/tmdb/search`). One step of slice 3 is not done: the match rule has not
been evaluated against real TMDB answers, so the popularity floor is still
its starting value (see `TODO.md`). The first draft proposed an explicit
**Title · Actor · Director · Keyword** selector. The revision drops Keyword for
v1 and replaces the selector with grouped results, which only became workable
once there were two kinds of result instead of four.

Phone and desktop mockups exist as of September 23, 2026 (see
"Mockups" below). They confirm the People row and a person's movies as
described here, and they add a polish pass on search itself -- rows,
availability, loading, empty and error states, and voice -- which is now part
of the plan as its own slices, ahead of people.

## Recommendation

Keep the one search field. Behind it, run the existing title search and a
people search together and show the answers in separate groups: a compact
**People** row above the movie results when the query strongly matches a
person, and the movie results in title search's own order. Choosing a person opens their movies,
with the role -- acting or directing -- chosen there rather than before
searching.

Title search already works; this is about **discovery**, and about the case
where someone cannot remember a title but remembers who was in it. "That Tom
Hanks one on the island" starts from a person, so a person is what search
should offer back.

The scope is catalog discovery wherever the shared search is used. Searching
movies already in a bowl or in watch history is a separate feature, not part
of this one.

## Why grouped, not modes

The first draft chose explicit modes for two reasons, and both have gone:

- **Four result types would not share a ranking.** Movies, people and themes
  in one list means deciding whether Michael B. Jordan outranks the movie
  *Jordan* outranks a tag. With Keyword gone there are two types, and grouping
  them means they never compete: people sit in their row, movies keep title
  search's own order.
- **Actor and Director made you name the role before finding the person.**
  People do not think "I am searching for a director"; they think of the
  person. The role is a property of that person's credits, so it is picked
  after them.

Grouping also keeps the case that works today exactly as it is. Someone who
types a title gets the same movie results in the same order, with nothing added
unless the query is plainly a name.

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

## Mockups

`Search Revamp.dc.html` and `Search Phone.dc.html` in the Movie Bowl
claude.ai/design project: a live phone prototype, twelve phone states (idle,
title query, name query, a name that is also a title, keyboard highlight, a
person in both roles and in one, Details from a person, loading, nothing
found, offline, voice) and a 640px desktop dialog. Sample data only.

What they settle for the People row and a person's movies matches the
sections below: above the movies, at most three, no Add, the three-part match
rule (the prototype shows "tom han" matching, "big" not, and an obscure
namesake held back by the popularity floor), Change person, the role switch
only for both roles, opening on the role a person is known for, staying on
their list after an add, and Back from Details naming where it returns to. On
desktop the chips wrap instead of scrolling.

What they add, beyond this design as first written:

1. **Rows, not cards.** The row opens Details and one **+** adds, replacing
   the stacked Add/Details pair; a result drops from about 104px to 84px.
2. **Availability on one line.** The viewer's services lead in green ("On
   your Netflix · +1 more"). Loading is a shimmer bar, and a failed check says
   "Couldn't check availability" -- never "none". This is the four-state
   contract under "Engineering boundaries", made visible.
3. **Loading moves nothing.** The spinner sits inside the field and the
   skeletons are the height of real rows. Today the status lines under the
   field push results down.
4. **Empty and error differ.** Nothing found makes the custom slip the main
   action, drawn as the paper it becomes; an error says "Can't reach the movie
   service" and offers Try again.
5. **Voice inside the field.** The mic moves into the field and the field
   becomes the listening state, showing words as they are heard, stopping on a
   pause or Done, and searching at once. The mockup's prompt, "Say a title or
   someone in it", waits for slice 3: until people are searchable it would
   send names into a title-only search. Today `interimResults` is false,
   so nothing appears until you stop and you cannot tell whether you were
   heard.

Three things in the mockups are corrected here rather than built as drawn:

- **Enter with nothing highlighted keeps today's meaning.** Today it adds the
  first movie. In the mockup it opens the first person whenever a People row
  shows, so "washington" + Enter would stop adding the movie. People are
  reached by arrowing to them; a bare Enter never opens one.
- **A people-only result still offers a custom slip.** When a name matches
  people and no titles, the mockup offers no custom action at all. The
  explicit custom action stays available there ("something with Tom Hanks" is
  a slip people really make), under the rule in "Custom entries".
- **Rows are not listbox options.** Each mockup `role="option"` still holds
  two buttons, the row and the **+**, which is the nesting the redesign set
  out to remove. Rows with two actions are a plain list with two buttons each
  (or a grid), not a listbox. The Acting · Directing tabs need
  `aria-selected`.

## Proposed experience

### The People row

When the query strongly matches a person, up to three people appear above the
movie results, each with a photo (or placeholder), name, and two or three
identifying credits: "Tom Hanks · *Cast Away*, *Big*". Those credits identify
the person; they must not read as a complete filmography.

"Strong match" is what keeps title search clean, and it is the one rule to
tune against real queries in the spike. The starting rule:

- the query is at least three characters;
- the person's name matches the query closely -- every query word matches the
  start of a name word, so "tom han" matches Tom Hanks and "anks" matches no
  one. A title can still start a name ("big" starts "Bigg"), which the next
  rule is for;
- the person clears a popularity floor, so a lone obscure name-match does not
  outrank a title someone was actually typing.

When nothing clears it, the row does not render and the page is today's page.
Movie results never wait for the people lookup, and the people row never
shifts movie rows that are already on screen: if people arrive after movies
have rendered, the row may appear only while the list is still settling.

A person row has no Add action. People are navigation, never slips.

### A person's movies

Choosing a person opens their movies under a small context header -- "Tom
Hanks's movies" -- with **Change person** returning to the search, query and
position intact. The movie rows are the ordinary ones, with Add and Details;
actor results may also show the character name.

An **Acting · Directing** switch appears only when the person has feature
credits in both roles, and opens on the one they are known for. Directing is
crew entries whose `job` is exactly `Director`; primary department is not
evidence that a person directed a particular movie. A person with no feature
credits in a role simply has no such tab.

Details → Back restores the person, role, list position, and loaded pages. The
outer modal's close action stays distinct from returning to the search.

After a successful add, stay on the person's movies so someone can add several
from one filmography. Clear any submitted comment and keep the existing
duplicate and pending protections. Plain title results keep their current
reset behavior. An explicit reset or new session clears everything.

### Custom entries

Keep the custom-title path as it is. A query that produced a People row still
offers "Add *Tom Hanks* as a custom title" only through the existing explicit
custom action, never as a side effect of choosing a person, so no one ends up
with an accidental "Tom Hanks" slip. Network failure must remain
distinguishable from a search that found nothing.

### Mobile, keyboard, and voice

- The People row is one compact line of touch-sized chips on a phone and does
  not push the first movie row below the fold with the keyboard open.
- Arrow keys move through people and then movies as one sequence. Enter on a
  person opens their movies; Enter on a movie keeps today's behavior, and only
  for settled results. Editing the query invalidates any earlier selection.
- Voice fills the query, live, inside the field (see "Mockups"). There is no
  spoken command parser.
- Announce loading, result counts (people and movies separately), the selected
  person, and errors. Rows carry two actions, so they are a list of buttons
  rather than listbox options (see "Mockups"). Escape must not unexpectedly
  close the outer add flow.

## Retrieval and ordering

TMDB supports separate searches for movies and people. Both run through the
server proxy so the credentials stay server-side. Official references checked
September 15, 2026:

- Title: preserve [movie search](https://developer.themoviedb.org/reference/search-movie)
  ordering, and return page metadata so users can load further results.
- People: [people search](https://developer.themoviedb.org/reference/search-person).
  Its `known_for` supplies the identifying credits, so the row needs no
  per-person fetch. Do not fetch any candidate's filmography while typing.
- A chosen person: fetch [movie credits](https://developer.themoviedb.org/reference/person-movie-credits)
  once. Cast entries are Acting; crew entries whose `job` is exactly `Director`
  are Directing. Deduplicate by movie ID, keeping character information.
  Confirm these fields with fixtures in the implementation spike.
  Discover's `with_crew` cannot stand in for the directing check, because it
  does not specify the person's job.

The two searches are two independent requests from the browser, fired
together for each settled query and both served by the existing search route.
Title search is the call it is today and never waits for people: a combined
response could isolate a people failure but not a slow one, and would make
every title search depend on it. The people call has its own short timeout; a
people lookup that fails or times out simply leaves no People row.

A person's movies are feature films only, excluding TV, shorts and uncredited
appearances, and sorted popular first, then release date and movie ID as
deterministic tie breakers, labelled "Popular first". Defer sort controls
until that default has been lived with. Keep title relevance unchanged. Never
promote or hide movies by streaming availability: provider data arrives later
and must not reorder a list underneath someone.

Show 20 movies initially with **Load more**. Person credits are normalized
once and revealed in local batches; title search pagination must preserve
access beyond the first page. Use distinct loaded counts and totals; on a
later-page error keep the existing rows and offer retry. Apply one explicit,
consistent adult-content exclusion, including to credit-derived movies. Keep
movies with missing dates or posters.

The credits lookup is shared with starter-pack filmographies
(`starter-packs.md`), but only its base: fetching a person's movie credits,
deduplicating them by movie, and classifying Directing by `job`. The filters on
top are each product's own. Search shows every feature credit in the chosen
role, because the movie someone half-remembers may be a small part. A pack
also keeps only principal roles above a minimum vote count, because a pack is
a curated selection and cameos would fill it. Whichever ships first builds the
base once; neither inherits the other's filters.

## Engineering boundaries

1. Keep `searchTmdbMovies(query)` backward compatible. Add typed-result helper
   contracts for people and movies; movie results keep the shape used today
   for hydration and adding. People can never reach add handlers.
2. Extend the existing search handler with validated actions -- title
   search, people search, and a person's movies -- rather than adding a
   function: the deployment is at Vercel Hobby's 12-function limit. Validate
   actions, positive IDs, bounded query length and page values; never accept
   an arbitrary upstream URL.
3. Extract retrieval state into a focused hook, e.g. `useMovieDiscovery`,
   rather than adding more independent effects to the large search component.
   Track query, selected person, role, phase, page, and request identity
   explicitly. Keep submission ownership in the existing add flow.
4. Invalidate requests on input change, selection change, role change, reset,
   and unmount. Add abort support where practical and keep generation checks.
   The current generation increments when a request starts, so the debounce
   interval needs care: old results must not become actionable during it.
5. Cache bounded search and credit results briefly by all relevant
   parameters and deduplicate in-flight requests. Start with a five-minute
   session cache of at most 50 entries and measure before tuning. No database
   migration or new search service is expected.
6. Keep search independent of provider enrichment. Load providers only for
   visible movie rows, with bounded concurrency and the existing cache, never
   for people or a whole filmography. Distinguish unchecked, loading, failed,
   and confirmed-empty availability; today's empty-array fallback cannot
   express these, and needs a small contract extension that preserves other
   callers.

## Delivery sequence and review gates

Three slices, each its own pull request, in this order. The first two change
search as it exists today and are useful without people; the third is the
discovery work and builds on the new rows.

### Slice 1 -- Voice

Live transcription (`interimResults` on), the mic inside the field, the field
as the listening state, and stop on a pause or Done and search at once. The
prompt still asks for a movie title. Small, self-contained, and it fixes
something that feels broken now.

### Slice 2 -- Rows, availability, loading, empty and error

Mockup items 1-4 on today's title search, with no people yet: rows with one
**+**, one-line availability with its four states, an in-field spinner and
row-height skeletons, and distinct empty and error states. Rows move off
listbox semantics here, and bare Enter keeps adding the first movie. Every
shared consumer -- the bowl add dialog, public add links, the standalone
modal, watch-history entry -- keeps its add, retry and destination contracts.

### Slice 3 -- People

Everything else in this document, in the steps below. This is also where the
voice prompt becomes "Say a title or someone in it", and the placeholder
"Movie title or person", because only now is either true.

#### 1. Validate the match rule and the data

The mockups cover the interaction. What is left is the data: exercise
authenticated TMDB requests to check people search, credits, language
behavior and large-filmography payloads.

The match rule gets its own evaluation set, recording which queries should and
should not show people: exact title, partial title, a title that is also a
name, same-name people, a person who both acts and directs, a lesser-known
director, missing images, and a large filmography. Record expected membership
and identity, not volatile popularity positions.

#### 2. Implement

The parallel title and people searches, the People row and its match rule, a person's movies with
the role switch, pagination, the request lifecycle, and preserved discovery
context. Gate acceptance on correct role membership, on title queries looking
exactly as they do after slice 2, and on unchanged add behavior across every
shared consumer.

#### 3. Verify and release

- Unit/API fixtures: validation, the match rule, role filtering, duplicate
  credits, content exclusion, pagination, a people lookup failing on its own,
  upstream failures, and backward-compatible title calls.
- Interaction tests: stale responses during debounce; choosing a person cannot
  add; the People row does not move rendered movie rows; Details/Back restores
  context; repeated adds keep the person; failed adds keep drafts; explicit
  reset clears context.
- Regression checks: existing search suites plus bowl destination and retry
  flows, public add, the standalone modal, and watch-history selection.
- Browser checks: phone and desktop, keyboard-only navigation, a narrow
  viewport with the keyboard open, voice input, slow or offline requests, and
  Load more.
- Request budget: two parallel lookups per settled query (title and people),
  one credits request after choosing a person, and bounded visible-row
  provider enrichment. Title search latency should stay comparable
  to today's.

Before release, check that people find a known title as quickly as before and
can add a movie through a person. If measurement is added, prefer aggregate
people-row, latency, empty/error and search-to-add events, without raw queries
or names.

## Decided against for v1

- **Keyword / theme search** ("heist", "time travel"). TMDB's keyword tags are
  uneven -- applied inconsistently across the catalog -- so results would
  promise more than they deliver, and a third result type would bring back the
  ranking problem grouping avoids. Revisit only with evidence that people want
  it and a way to make the tags trustworthy.
- **An explicit mode selector.** Replaced by grouped results. It returns only if
  the People row proves too noisy to tune.

## Still open, not in this design

- **Describing a plot or scene** when neither title nor person is remembered.
  TMDB has no such search, so it would need something beyond it.
- **Searching movies already in a bowl or in watch history.**
- **Newest-first sorting, or hiding self and documentary appearances,** in a
  person's movies. Default: popular first, complete and accessible.
