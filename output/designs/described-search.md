# Described search

Status: built October 2, 2026. Signed off by Scott from a mockup the same day.

## What it is

The add sheet's one search field also understands a description: "space movie
where Matt Damon is stranded", "90s heist movie with Denzel", "tom hanks
movies", "napalm in the morning". The model reads the description into TMDB's
own terms -- people, genres from TMDB's fixed list, up to two plot keywords,
an era and a language -- and TMDB's discover endpoint returns real titles.

A quote or a famous scene has no such terms: "Chinese movie with California
Dreamin'" is *Chungking Express*, but nothing in it is a person, a genre or a
keyword TMDB tags. So the model may also name up to three titles it
recognizes. Each is kept only when TMDB has a movie whose title has exactly
those letters and digits, so "Alien" never stands in for "Aliens" while a
model's "Chung-King Express" still finds *Chungking Express*; anything else is
dropped unseen. The model's year only chooses between remakes of one title.
It is not a filter, because models misremember years: the first live test
gave *My Dinner with Andre* as 1978 (it is 1981), and a one-year window
dropped it. A result can
therefore never be invented, though a recognized title can still be the wrong
real movie. Scott chose this on October 2, 2026, after the first live tests
showed terms alone missing every quote; until then the rule was that the model
never names a movie.

The prompt asks for a movie, an actor or a director, not only a movie: since
an empty search reaches the model too, a misspelled name ("leanardo decapiro")
or a described one ("the guy who played Gandalf") is as likely as a plot.

It no longer ends "Leave a list empty rather than guess." That line made the
model hold back the one title a scene points to ("just 2 guys having dinner"),
and guessing a title costs nothing here: one TMDB does not have by those words
is never shown.

## When it runs

Never for a title or a name. Title and people search run first, as always.
The description path runs only when:

- the query has three or more words,
- no title result is spelled by the words typed (`queryMatchesName`, the
  People row's own rule, against title and original title), and
- people search found no one.

These are judged on the words as typed, before the misspelling retry, and the
model goes first: the retry "corrects" a description by dropping words, so
"brad pitt baseball movie" became "brad pitt", whom people search then found,
and the model never heard it. A search the model does not answer still gets
the retry.

A long real title still matches itself, so length alone never sends it
(`src/utils/describedSearch.js`). A typed title never waits on it.

One more case sends it whatever the word count or spelling retry: four or more
characters that found no title and no person at all. An empty result has
nothing to lose, and a short misspelling the retry cannot fix ("leanardo
decapiro") is exactly what the model reads well. Scott chose this over a
separate smart-search button on October 2, 2026.

## What it looks like

Show, don't tell:

- **Read by the model:** the field's magnifier becomes a gold sparkle, and a
  row of chips under the field shows what it read -- a person badge for a
  person, then genres, keywords, a language and an era. The results are the
  recognized titles first, then what the terms found in TMDB popularity
  order, replacing the title results. Recognized titles have no chip: they
  came from the words, not the terms.
- **Removing a chip** searches the remaining terms through TMDB alone; the
  model is not asked again, and the recognized titles stay first. Removing the last chip returns to the title
  results for the words as typed.
- **No model answered** (unconfigured, over the free limit, or down): the
  sparkle is struck through and dim, one line says "Smart search is resting.
  Try a title or a name.", and the results are exactly what title search found.
  This only ever appears for a search that would have gone to the model.

A description the model read but TMDB found nothing for, or a request that
failed, shows today's results with no sparkle: it is a search that found
nothing, not an outage.

## Providers

`api/_lib/describedSearch.js`, through the `describe` and `discover` actions
on `api/tmdb/search` (the deployment has no function slots left). Both speak
OpenAI's chat format and are tried in order, each with a five-second limit:

1. Groq, `openai/gpt-oss-120b` at medium reasoning (`GROQ_API_KEY`): free,
   and fast enough to feel like search. It started as `gpt-oss-20b` at low
   effort, which named the movie behind a scene ("just 2 guys having dinner")
   only some of the time; Scott found 120B at medium reliable in Groq's
   playground on October 2, 2026. `GROQ_MODEL` and `GROQ_REASONING_EFFORT`
   override both without a deploy of code.
2. Cloudflare Workers AI, `@cf/openai/gpt-oss-20b`
   (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`): 10,000 free neurons a day,
   several hundred short requests. The same model as Groq's, so one prompt
   serves both. The first choice here, Llama 3.1 8B, had been retired on
   May 30, 2026 and answered 410 -- which the sheet shows as "resting", so a
   retired model looks exactly like an outage. `CLOUDFLARE_AI_MODEL` overrides
   it.

Gemini's free tier was ruled out: Google may use and human-review what is
sent, and its terms bar serving EU or UK users on it.

Both actions require a signed-in session, so a public add link never spends
the quota and never shows the sparkle.

## Measuring it

`npm run eval:search` sends the searches in
`scripts/smart-search-eval/cases.json` (quotes, scenes, an actor and a topic,
described or misspelled people, misspelled titles, and categories) through the
same model call and TMDB lookups as the describe action, and scores where the
known answer lands: a movie in the top three, a person named, or a category's
terms read. It waits past the app's five seconds so a slow answer is measured,
then counts it as one the app would not show. `--config 120b:medium,20b:low`
compares settings and `--runs 3` shows how consistent one is. It spends the
app's Groq quota. Trying the same five searches by hand could not tell a better
model from a luckier day, which is why it exists.

## Relaxing

A description rarely matches TMDB's tags exactly. When every term together
finds nothing, keywords are dropped first, then genres; people and the era
stay, and so does a language. TMDB files Cantonese films under its own `cn`
code beside Mandarin's `zh`, so "Chinese" searches both. The chips show the terms the results actually used, never one that was
dropped.
