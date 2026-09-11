# Scaling and Cost

Status: plan, not implementation. The instrumentation in "Do This Soon" is
wanted near-term; everything past the first threshold is a set of decisions to
make in advance rather than work to schedule. **Every vendor figure below needs
verifying before it is relied on** — see "Numbers To Go Check."

## The Governing Fact

Movie Bowl runs on three services whose terms require it to be
**non-commercial**: TMDB's free API, Watchmode's free plan, and Vercel Hobby.
That is not a pricing tier to be upgraded. It is a constraint on what the app is
allowed to be.

The consequence is the thing to plan around: **there is a scale at which the
free tiers are exhausted and revenue is forbidden.** Growth costs money, and the
ordinary way to pay for growth — ads, subscriptions, anything that makes the
site commercial — is closed. Past a certain size the app is funded out of
pocket or not at all.

So the planning question is not "how do we scale." It is **"what is the monthly
figure the owner is willing to spend, and what happens at it?"** Everything else
in this document works backwards from that number.

## Where the Money Goes

| Surface | Serves | Constraint |
| --- | --- | --- |
| Vercel (Hobby) | Hosting, the 12 functions, the daily cron | Non-commercial **wall**, plus usage limits |
| Supabase | Auth, Postgres, RLS, egress | Wallet |
| Resend | Invite mail, and the custom SMTP behind magic-link auth | Wallet |
| TMDB | Search, details, filter metadata | Non-commercial **wall** |
| Watchmode | Provider deep links | Non-commercial **wall**, ~1,000 credits/month |
| Google Play | TV app distribution | One-time developer fee, already paid |
| Domain | `moviebowl.app` | Annual, trivial |

## What the Architecture Already Got Right

**The expensive caches are sublinear in users.** `tmdb_filter_metadata` and
`title_provider_links` are both keyed `(tmdb_id, region)` — global, not per bowl
and not per user. Ten thousand people with overlapping taste share one lookup
per title, and the daily cron refreshes distinct titles rather than rows. A
popular title costs the same whether one bowl holds it or a thousand do.

This is worth stating plainly because it is the reason the cost curve bends the
right way, and because several product decisions elsewhere lean on it: the
starter-packs plan argues for few, small, fixed lists partly on these grounds,
and any future feature that mints distinct TMDB ids per user works against it.

**What scales linearly** is auth mail, database rows, egress, and function
invocations. None of those is exotic; all of them are ordinary bills.

## The Cliffs, In the Order They Arrive

### 1. Resend's daily cap — during the growth spike, not in steady state

Two things send mail: Supabase magic-link auth through the custom SMTP, and
`api/invites/send.js`. TV pairing does not — it uses a code and a token hash.

Steady state is genuinely quiet. Sessions persist, so an established user logs in
rarely, and invites are bounded by the social graph. The daily cap does not bind
on ordinary use.

**It binds precisely during the event this document is about.** If the app is
shared somewhere and two hundred people try it in one day, that is two hundred
auth mails, and the two hundred and first person cannot get in. The failure is
not a degraded feature — it is *nobody new can sign in*, on the one day that
matters, with no signal to the owner that it happened.

That combination — invisible, total, and triggered by success — is what makes
this first rather than largest.

### 2. Watchmode, at roughly 1,000 credits a month

The configured budget already sits at the vendor ceiling: `PROVIDER_LINKS_MONTHLY_BUDGET`
defaults to 500 requests, a TMDB-id lookup costs two credits, and the free plan
allows about a thousand. Five hundred title lookups a month, shared across every
user.

It is dormant today because `PROVIDER_LINKS_ENABLED` defaults off. It becomes
the binding constraint the moment it is switched on with real traffic. The
saving grace is that this is the best-behaved surface in the app: the budget is
reserved atomically before any HTTP call, exhaustion degrades to the existing
search fallback rather than an error, and the whole feature has a working kill
switch.

### 3. Vercel Hobby

Bandwidth and invocation limits, and the non-commercial term. A hobby project
serving real traffic is also the kind of thing that attracts attention on that
plan.

### 4. Supabase storage and egress

The 500MB database and the egress allowance arrive well before the monthly
active user limit, which is generous. Bowl reads are the egress; rows accumulate
in `bowl_movies`, `bowl_draw_events` and `user_watch_events`, and the history
tables are immutable by design, so they only grow.

## Rough Shape by Size

Orders of magnitude, not forecasts, and each depends on figures that need
checking:

- **~100 users.** Free throughout, with the Resend daily cap as the only
  plausible surprise during a signup burst.
- **~1,000 users.** Supabase and Resend want paying tiers. Tens of dollars a
  month.
- **~10,000 users.** Vercel too, and Watchmode's free plan is no longer viable
  at any usage worth having. Low hundreds a month, and the first point at which
  the non-commercial constraint becomes a practical problem rather than a
  theoretical one.
- **~100,000 users.** A different application with a different legal posture.
  Not a scaling exercise.

## Do This Soon

**Instrument it.** Nothing here can be managed against numbers nobody can see,
and today exactly one thing is measured: `title_provider_link_usage`.

A small monthly counters table — mail sent, TMDB calls, function invocations,
row growth per table — turns this entire document from speculation into a
reading. It is a few hours of work and it is the prerequisite for every decision
below. Follow the shape `title_provider_link_usage` already sets: keyed by
month, incremented server-side, private to the service role.

**Give the mail path a budget and a warning**, the way provider links already
have one. The goal is not to refuse mail; it is to know the ceiling is near before
someone discovers it by failing to sign in. Same pattern, same table.

**Audit the kill switches.** `PROVIDER_LINKS_ENABLED` exists and works. There is
no equivalent for TMDB search, and none for signups. Knowing which levers exist
is cheaper to establish now than during an incident.

**Read the three non-commercial terms and write down what they forbid**,
particularly on donations. Whether the wall is a wall or a speed bump is the
single fact the rest of this depends on, and it is currently an assumption.

## Decisions To Make In Advance

Each of these is better decided while calm than during a spike.

1. **The monthly figure.** What the owner will spend before the answer becomes
   "no." Everything else is downstream.
2. **What gets shed first.** Provider links are the obvious candidate: highest
   marginal cost, hardest vendor cap, already kill-switched, and the search
   fallback survives without them. Ordering the rest now avoids improvising it.
3. **Whether growth is capped deliberately.** The app is already invite-shaped —
   bowls have members, and `/invites` is a real surface. Gating signup by
   invitation makes growth track actual use and gives a throttle that reads as a
   product decision rather than a failure. This is the cheapest structural lever
   available and it costs nothing until it is needed.
4. **What "too big" triggers.** Cap growth, shed features, or go commercial with
   paid TMDB licensing and a real Watchmode plan. The last is probably not what
   this project wants, which is worth admitting up front rather than discovering
   under pressure.

## Numbers To Go Check

Every figure below came from memory rather than from the vendor, and vendor
pricing moves:

- Resend's free tier: monthly total and the daily cap.
- Supabase free tier: database size, egress, monthly active users; and the Pro
  price.
- Vercel Hobby: bandwidth and invocation allowances; the exact wording of the
  non-commercial term; the Pro price.
- Watchmode: credits per month on the free plan, credits per TMDB-id lookup, and
  what the first paid tier costs.
- TMDB: what their terms count as commercial use.
- Whether any of the three non-commercial terms permit donations.

Record the answers here with the date checked, the way
`output/designs/provider-deep-links.md` dates its vendor verification.

## Deliberately Not Planning For

- **Ads or subscriptions.** They break the terms the whole stack rests on.
- **Migrating off Supabase or Vercel to chase free capacity.** The migration
  costs more than the bill it avoids at every size in this document.
- **Optimising the caches further.** They are already global by title; the next
  gain is small and the complexity is not.
