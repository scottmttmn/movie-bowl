# Restaurant Bowls

Status: built, all five steps, behind the Settings switch: the schema,
restaurant bowls drawn with a Directions link, added through Google search or
by name, the Cuisine and Open filters with the drawn sheet's place details,
and a draw made for a later day that can go back in the bowl until that day
ends.

## Why

A user asked for "the same thing for restaurants". The problem is the paper
bowl's again: a couple or household keeps a list of places they like and
places they mean to try, nobody can decide, and one person's picks win by
default. The bowl makes it fair whose pick comes up, and asks you to stick
with it.

It is a second kind of bowl in this app rather than a second app, so a
restaurant bowl keeps members, invites, draw access, all three draw methods,
rotation, the reveal and returning a draw, with one account and one deploy.

## Decisions

- **Hidden behind a setting.** `profiles.restaurant_bowls_enabled`, off by
  default, turned on in Settings. Off, creating a bowl looks exactly as it
  does today. Being invited to a restaurant bowl shows that bowl regardless,
  or the invitation would lead nowhere.
- **A restaurant is a slip.** `bowl_movies` rows in a bowl whose `kind` is
  `restaurants`, with a non-positive `tmdb_id` like any custom title, so every
  TMDB path (filter cache, provider links, departures, snapshot refresh,
  starter packs, public add links) already leaves them alone. A trigger keeps
  TMDB titles out of restaurant bowls and restaurant fields out of movie bowls.
- **No personal watch history.** A restaurant draw writes the bowl's
  `bowl_draw_events` row, carrying `cuisine` and `place_id`, and no
  `user_watch_events`: Watch History is a record of movies.
- **Google Places, on the free tier.** Chosen over Foursquare (hours and
  booking links are paid from the first call), Yelp (no free tier) and
  OpenStreetMap (in Decorah, 6 restaurants mapped and 1 with hours).
  Only `place_id` may be stored under Google's terms; the slip's name is the
  adder's own label, prefilled from search and editable (Scott, November 8).
  Hours are never stored, so the Open filter makes a live, budgeted call.
- **Drawing ahead.** People draw on Wednesday for Saturday. The Open filter
  takes Now, Tonight or a chosen day and time, and a draw made for a day can
  be returned until that day ends.
- **No typed booking link.** Nobody would fill it in. The drawn sheet offers
  Reserve a table (Google Maps, only where Google says the place takes
  reservations), Directions, Website and Call.

## Steps

1. Schema: `bowls.kind`, `cuisine` and `place_id` on slips and draw events,
   the setting, `create_owned_bowl(id, name, kind)`, and the kind in the
   account's bowl context. **Built.**
2. Restaurant bowls behind the setting, adding by name with a cuisine chip,
   paper slips in place of posters, and the drawn sheet with Directions.
   Hidden from the TV and solo draw, and kept out of Watch History; Bowl
   Settings leaves out starter packs, the streaming chart and add links.
   The bowl page reads the kind through `BowlKindContext`. **Built.**
3. Google search through a places route in `api/movie-cache.js`
   (`/api/places/search`): Autocomplete (New), one call per settled
   keystroke under one session token per search, biased toward the caller by
   Vercel's IP location. Results are kept to places to eat by their Google
   types, and the first type that names a cuisine prefills the chip. Picking
   one opens the slip prefilled with Google's name, which the adder can
   change; only the place id is stored. "Not listed?" and a deploy without
   the key both add by name. The daily Autocomplete quota is set in Google's
   console, not counted here. **Built.**
4. The restaurant filter sheet: Cuisine, and Open with a monthly budget in
   Supabase for the hours lookups (1,000 free a month), plus Reserve,
   Website and Call. **Cuisine is
   built:** one chip per cuisine the bowl holds (a cuisine off the add
   sheet's list counts as Other), each in or out, with "Only" to keep just
   one. The filter stores what is left out, per account per bowl on the
   device, so a cuisine added later is in the draw. It runs as a cheap stage
   in `getDrawCandidates` and so narrows the count, My Restaurants and the
   draw alike. The Filters button shows once the bowl holds two cuisines.
   Copy written for movies (draw method steps, the draw button, the people
   sheet, add messages, Bowl Settings) reads through `inBowlWords`.
   **The drawn sheet is built:** the drawn pick (only) asks
   `/api/places/details` for open now, Reserve, Website and Call, against a
   monthly budget in Supabase (`begin_place_details_fetch`). A slip opened
   from My Restaurants or Been there keeps Directions alone.
   **No photos (Scott, November 13).** Google's photo shipped on the drawn
   sheet alone and read as the odd one out. Showing one everywhere would pay
   on every view, because Google's terms forbid keeping it, so restaurants
   stay paper slips everywhere. The function's `photo` budget line is unused.
   **The Open filter is built (November 15):** Any time, Now, Tonight or a
   picked day and time, today through six days ahead, which is as far as
   Google's hours for the week ahead reach. It needs hours for every slip, so
   three rules keep it inside the free allowance. It asks only when asked:
   the choice starts on Any time every visit and is never remembered, so an
   idle bowl spends nothing. One batch through `/api/places/hours` asks once
   per place, and the page holds each answer in memory for thirty minutes, so
   moving between Now, Tonight and a picked time is free. And hours have a
   monthly budget of their own (`begin_place_hours_fetch`, sku `hours`),
   because an hours-only request bills on Google's Place Details Enterprise
   line while the drawn sheet's bills on Enterprise + Atmosphere, each free
   for 1,000 a month. The filter removes only places known to be closed: a
   slip added by name, one Google has no hours for, or any slip once the
   budget is spent stays in the draw, and the sheet counts those as "without
   hours". Tonight means 7 PM until 7 PM has passed, then now, decided on
   the restaurant's own clock like every other time; the phone's clock stands
   in only when Google names no zone. A place marked temporarily closed is
   out for any time. A draw started while hours are loading
   waits for them. It runs beside Cuisine in the same stage of
   `getDrawCandidates` (`restaurantFilter`), so the count, My Restaurants and
   the draw agree.
5. Returning a draw until the end of the day it was drawn for. **Built
   (November 16).** A draw made with the Open filter on Tonight or a picked
   day sets `bowl_draw_events.return_until` to the midnight that ends that
   day on the drawer's phone, through `set_bowl_draw_return_window` after the
   draw is saved. The draw RPCs are untouched: if that call fails, the pick
   simply keeps the ordinary two hours. The function only lengthens, only for
   the person who drew, only in a restaurant bowl, only once and only inside
   the two hours, and never past a week after the draw.
   `return_bowl_draw_to_bowl` allows a return until the later of the two
   hours and that deadline. Been there says so on the slip ("until the end of
   Saturday"); a draw for now or Any time says nothing, as before.

Later: a distance filter. Not possible for free: how busy a place is.
