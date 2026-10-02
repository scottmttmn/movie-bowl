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
recognizes. Each is kept only when TMDB has a movie by exactly those words
(both ways round, so "Alien" never stands in for "Aliens"), released within a
year of the one the model gave; anything else is dropped unseen. A result can
therefore never be invented, though a recognized title can still be the wrong
real movie. Scott chose this on October 2, 2026, after the first live tests
showed terms alone missing every quote; until then the rule was that the model
never names a movie.

## When it runs

Never for a title or a name. Title and people search run first, as always.
The description path runs only when:

- the query has three or more words,
- no title result is spelled by the words typed (`queryMatchesName`, the
  People row's own rule, against title and original title),
- people search found no one, and
- the misspelling retry did not correct it.

A long real title still matches itself, so length alone never sends it
(`src/utils/describedSearch.js`). A typed title never waits on it.

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

1. Groq, `openai/gpt-oss-20b` (`GROQ_API_KEY`): 1,000 requests a day free and
   fast enough to feel like search.
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

## Relaxing

A description rarely matches TMDB's tags exactly. When every term together
finds nothing, keywords are dropped first, then genres; people and the era
stay, and so does a language. TMDB files Cantonese films under its own `cn`
code beside Mandarin's `zh`, so "Chinese" searches both. The chips show the terms the results actually used, never one that was
dropped.
