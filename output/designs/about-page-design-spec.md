# Movie Bowl About Page — Design Specification

**Status:** Implemented in the `/about` route
**Route:** `/about`
**Purpose:** Explain why Movie Bowl exists, make its philosophy memorable, and let a visitor experience the core idea before creating or joining a bowl.

## 0. Revision — the page was cut in half

The first implementation of this spec shipped seven sections. It worked, and it
was too long, for two reasons worth recording so the next revision does not
rebuild them.

**It said one thing six times.** The hero, the comparison, three principle
cards, a use-case story, a three-step flow, and the closing call to action all
delivered "you fill the bowl, a fair draw picks tonight's." The story timeline
and the product flow were literally the same three beats — *over the month /
tonight / one draw later* and *collect over time / filter for tonight / draw
together* — set in different type one section apart. One list now carries both.

**Nothing had a pecking order.** Four consecutive sections used the same
template: rose eyebrow, centered heading, three-card grid, `mt-20`. When every
section is weighted the same, none of them reads as the important one, and the
page reads as filler even though each individual sentence is fine.

The cuts, and what replaced them:

| Removed | Why | Replacement |
| --- | --- | --- |
| Three interactive comparison demos | Two of the three animated a competitor's product in the page's best real estate | A static three-line comparison, demoted to the bottom third |
| Philosophy principle grid | Restated the demo and the story | One sentence — the thesis — at display size, alone |
| Three-step product flow | Duplicated the story timeline verbatim | Merged into that timeline, which now carries both the moment and the step |
| "Try the demo ↓" hero scroll button | The demo moved into the hero; the button scrolled to something already on screen | The product action is the only hero button |

The demo itself was promoted rather than trimmed: it is the only part of the
page that lets someone feel the product, so it now sits in the hero beside the
headline, visible without scrolling.

## 0.1 Revision two — the page is signed

The page was still written by a brand about a product. It staged a scene the
author had actually lived ("Tonight, 8:13 p.m.") and argued its position with a
three-across chart, while the real account sat unwritten. It is now first
person, signed once at the bottom, and it ends by teaching a reader how to run a
bowl out of paper instead.

| Removed | Why | Replacement |
| --- | --- | --- |
| "Tonight, 8:13 p.m." and its merged timeline | An invented scene standing in for a real one, and the three beats were onboarding the empty My Bowls screen already does | "Why there is a bowl" — the origin story, first person |
| `AboutComparison`, "Where this sits" | The story states the same tradeoff by living through it | "Then I started noticing things" — five things that went wrong with the paper bowl, each paired with the feature that answers it |
| "A little structure. One good surprise." | A closing line in a voice the rest of the page no longer uses | The directions for a paper bowl, then "Welcome." and the signature |

Three rules came out of the revision and are worth keeping:

- **The feature list is a history or it is nothing.** Each feature is stated as
  an answer to a specific thing that went wrong, in the order it went wrong. A
  feature stated on its own belongs in the product, not here.
- **One signature, at the very bottom.** It sat under the story first, while the
  page kept talking in first person afterwards, which read as a false ending.
- **The paper directions carry no visible heading.** The paragraph above them
  already issues the invitation; a heading over them issued it twice. The
  heading is there for screen readers only.

The author's words, as written, are the source for this copy. Edit them for
length and for obvious slips, never into marketing copy.

## 1. Product Story

Movie Bowl sits between two common ways of choosing what to watch:

1. **Browse everything:** People keep searching because the catalog never ends.
2. **Movie Bowl:** People choose the pool; a transparent, fair draw makes the final decision.
3. **Algorithmic recommendation:** A system chooses quickly, but the people watching give up more control over the pool and the reasoning.

The page should not argue that browsing or recommendation systems are bad. Both solve real problems. It should make Movie Bowl's particular tradeoff clear:

> **Human curation without decision fatigue.**

The key product distinction is not randomness by itself. It is that every title has an advocate: a significant other, family member, or other person who genuinely wants to watch it. The product does not imply that everyone agrees with every pick.

## 2. User and Job

### Primary visitor

A person choosing movies with a significant other or family who has heard about Movie Bowl, opened the About page, and wants to understand whether it is meaningfully different from a watchlist or recommendation service. Friend groups remain a supported but secondary audience.

### Primary job

> "Help my significant other or family stop debating what to watch without handing the entire choice to an opaque system."

### Secondary jobs

- Understand how a shared bowl is built over time.
- Understand that the draw can respect tonight's practical constraints.
- Understand that contributors are treated fairly.
- Feel enough of the product's personality to try it.

## 3. Experience Goals

The page should leave a visitor with four ideas:

1. **The household creates the possibility space together.**
2. **The draw ends the final debate.**
3. **The selection method is understandable and fair.**
4. **The result is watching sooner, not finding a mathematically perfect movie.**

A visitor should be able to understand the premise from the hero alone, because
the hero now contains a working draw. Everything below it adds conviction; none
of it is required to decode the product.

## 4. Voice and Tone

- Confident, warm, and lightly playful.
- Plainspoken rather than technical.
- Positive about Movie Bowl without caricaturing the alternatives.
- Let the comparison carry a little pointed humor, especially about endless browsing, but stop before either alternative becomes a straw man.
- Focused on the familiar moment when a couple or family is ready to watch but nobody wants to choose.
- Use "draw," "bowl," "your picks," "significant other," "family," and "the people you watch with."
- Avoid "content," "optimization," "engagement," and claims about finding a "perfect" movie.
- Say each thing once. A sentence that appears in two sections belongs in one.
- The middle and foot of the page are first person, in the author's own voice.
  Plain, specific, and occasionally funny about himself; never polished into
  copy. "Ours was a bowl" is the register.
- Leave first-run guidance to the empty My Bowls screen. This page explains why
  the app exists; a second set of steps here competes with the real onboarding.

## 5. Page Architecture

1. Public top navigation
2. Hero — headline and the live sample draw, side by side
3. The thesis, set alone
4. Why there is a bowl — the origin story
5. Then I started noticing things — the marked list of problems and answers
6. The paper directions, on paper
7. Welcome, the signature, and the closing actions
8. TMDB attribution

Six content blocks, no grid of cards anywhere, and one measure — `max-w-2xl` —
holding every block of prose from the story down, so the second half reads as
one continuous letter rather than a stack of sections.

## 6. Desktop Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Movie Bowl                                                   [menu]          │
├──────────────────────────────────────────────────────────────────────────────┤
│  A BETTER WAY TO CHOOSE MOVIE NIGHT      ┌──────────────────────────────────┐ │
│                                          │ A SAMPLE BOWL   75 movies · 2 mem│ │
│  Stop searching.                         │                                  │ │
│  Start watching.                         │           [bowl image]           │ │
│                                          │                                  │ │
│  Movie Bowl is the space between         │    [You · 47] [Significant · 28] │ │
│  endless scrolling and handing the       │                                  │ │
│  choice to an algorithm. …               │  Every option has someone rooting│ │
│                                          │  for it. …                       │ │
│  Built for couples, families, …          │                                  │ │
│                                          │  [ Draw tonight's movie ]        │ │
│  [ Start a bowl ]                        └──────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│        When every option in the bowl is one somebody wants to watch,         │
│        chance is not a compromise. It is a clean way to commit.              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│        HOW THIS STARTED                                                      │
│        Why there is a bowl                                                   │
│                                                                              │
│        Movie Bowl began because of a problem with my girlfriend.             │
│        We watched movies instead of TV because she didn't like TV …          │
├──────────────────────────────────────────────────────────────────────────────┤
│        Then I started noticing things                                        │
│                                                                              │
│        ○ One person could dominate the bowl …                                │
│        │    So the draw picks a person first, then one of their movies.      │
│        ○ There might be slips … we would rent for $3.99 on Amazon.           │
│        │    So you can narrow the bowl to what you already pay for.          │
│        ○ I wanted a record of the movies we watched …                        │
│        │    So a drawn movie moves itself to a watched list.                 │
│        ○ One evening a friend's two-year-old …                               │
│        │    Nothing here dissolves.                                          │
│        ● Most importantly, the bowl was in one location …                    │
│             So the bowl is wherever you are.                                 │
│                                                                              │
│        There are quite a few other features that have come along …           │
├──────────────────────────────────────────────────────────────────────────────┤
│        It wasn't an easy decision … Here is how we did it.                   │
│        ┌──────────────────────────────────────────────┐  (paper, −0.5°)      │
│        │ 1. Find a bowl and keep it somewhere safe.   │                      │
│        │ 2. Keep paper and a pen next to the bowl …   │                      │
│        │ …                                            │                      │
│        │ 7. … keep the drawn slips in a separate      │                      │
│        │    container.                                │                      │
│        └──────────────────────────────────────────────┘                      │
├──────────────────────────────────────────────────────────────────────────────┤
│           If it starts to fray the way ours did, this is here.               │
│                             Welcome.                                         │
│                             — Scott                                          │
│                  [ Start a bowl ]  [ Contact support ]                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 7. Mobile Wireframe

The page is linear. The hero stacks headline above the demo card, so the draw is
roughly one short scroll from the top rather than a section away.

```text
┌──────────────────────────┐
│ Movie Bowl        [menu] │
├──────────────────────────┤
│ A BETTER WAY TO CHOOSE   │
│ Stop searching.          │
│ Start watching.          │
│ Short hero explanation.  │
│ [ Start a bowl ]         │
│ ┌──────────────────────┐ │
│ │ A SAMPLE BOWL        │ │
│ │     [bowl image]     │ │
│ │ [You·47][Sig other·28]│ │
│ │ [ Draw tonight's … ] │ │
│ └──────────────────────┘ │
├──────────────────────────┤
│ When every option … is a │
│ clean way to commit.     │
├──────────────────────────┤
│ HOW THIS STARTED         │
│ Why there is a bowl      │
│ [five paragraphs]        │
├──────────────────────────┤
│ Then I started noticing  │
│ things                   │
│ ○ problem / answer × 5   │
│ [other features line]    │
├──────────────────────────┤
│ It wasn't an easy …      │
│ ┌──────────────────────┐ │
│ │ 1. Find a bowl …     │ │
│ │ …  (paper)           │ │
│ └──────────────────────┘ │
├──────────────────────────┤
│ … this is here.          │
│ Welcome.                 │
│ — Scott                  │
│ [ Start a bowl ]         │
│ [ Contact support ]      │
└──────────────────────────┘
```

Every band below the hero is a single column at every width, so the narrow
layout is the wide one with less room rather than a different page. The paper
card keeps its rotation on a phone; half a degree costs a few pixels, which the
page gutter absorbs.

## 8. Section Specifications

### 8.1 Hero

**Eyebrow**

> A better way to choose movie night

**Heading**

> Stop searching. Start watching.

**Body**

> Movie Bowl is the space between endless scrolling and handing the choice to an algorithm. You and the people you watch with fill the bowl with movies someone wants to see. A fair draw picks tonight's.

**Supporting line**

> Built for couples, families, and anyone tired of asking, "What do you want to watch?"

**Action**

- Signed out: **Start a bowl** → `/login`
- Signed in: **Open my bowls** → `/`

One button. The draw demo beside it is the second thing to do, and it is a
control rather than a link to one.

**Layout**

- Two columns from `lg`: text left, demo right, vertically centered.
- Below `lg`: text then demo, text centered.
- The hero keeps the `.about-hero` gradient surface.

### 8.2 Sample Draw (`AboutDrawDemo`)

The demo is a component, not a section — it renders inside the hero grid.

**Header**

> A SAMPLE BOWL · 75 movies · 2 members

**Idle visual**

- Reuse the shared `BowlIllustration`.
- Two contributor chips: `You · 47`, `Significant other · 28`.
- Idle line: *Every option has someone rooting for it. Press the button and one of them wins the night.*
- No posters, no external images.

**Primary interaction**

> Draw tonight's movie

**Draw result**

- Reuse the existing bowl shake and paper-slip reveal.
- Reveal one sample movie on an off-white paper ticket, with title and contributor.
- Follow with one sentence: *Your significant other was selected first, then one of their movies. Each member had an equal chance — the method every bowl starts with.*
- **Draw again** runs another draw. Sample draws avoid an immediate repeat.

**Representative draw titles**

| Contributor | Sample titles |
| --- | --- |
| You | *Moonlight*, *The Nice Guys*, *Knives Out* |
| Your significant other | *Arrival*, *Spirited Away*, *The Thing* |

The displayed bowl contains 75 movies, split 47/28 between its two members. The uneven split reinforces why the member-first draw matters: both members still have an equal chance to be selected. It does not add, draw, or modify real bowl data.

### 8.3 The Thesis

One sentence, centered, `text-2xl`/`text-3xl`, no eyebrow, no card, wide margins
above and below:

> When every option in the bowl is one somebody wants to watch, **chance is not a compromise.** It is a clean way to commit.

This is the page's only silent beat, and it is what the three philosophy cards
were trying to say. Do not surround it with supporting copy; the emphasis comes
from the space.

### 8.4 Why There Is a Bowl

**Eyebrow**

> How this started

**Heading**

> Why there is a bowl

Five paragraphs of the author's account, on the `.about-story` surface (the
former `.about-tonight` gradient, renamed when the invented scene left). The
copy lives in a `STORY` constant in `AboutPage.jsx` the way this screen's copy
always has.

The paragraphs, in order: the problem with his girlfriend; why they watched
movies rather than TV; browsing HBO Max and the trailers that never helped; the
bright idea; the year it worked. It ends there on purpose — what went wrong is
the next section's job.

Trim for length and fix a slip. Do not smooth the voice.

### 8.5 Then I Started Noticing Things

**Heading**

> Then I started noticing things

The marked list (`.about-marked-list`, the former `.about-moment-list`) carries
five entries. Each pairs a thing that actually went wrong with the feature that
answers it, problem in `text-slate-200`, answer in rose beneath it.

| What went wrong | What answers it |
| --- | --- |
| One person could dominate the bowl, and a less enthusiastic slip writer might seldom get their movies chosen. | So the draw picks a person first, then one of their movies. Adding more titles gives you more ways to be chosen, not a better chance of being the one chosen. |
| There might be slips in the bowl for movies on one of our streaming services, but they were just as likely to come up as the ones we would rent for $3.99 on Amazon. | So you can narrow the bowl to what you already pay for before you draw. |
| I wanted a record of the movies we watched, and two bowls of slips was deemed too confusing. | So a drawn movie moves itself to a watched list. Still one bowl. |
| One evening a friend's two-year-old found the slips and put some of them into a glass of water. | Nothing here dissolves. |
| Most importantly, the bowl was in one location. I would hear about an appealing movie out and about, and I would have to remember to write it down and then make sure that piece of paper made it into the bowl. | So the bowl is wherever you are. Add a movie the moment you hear about it. |

The rail's accent falls on the last dot, so the emphasis the author put on the
last entry is the one the eye lands on. Keep that entry last.

Closing line, quiet, below the list:

> There are quite a few other features that have come along, and I hope more yet to come in time.

It sits here rather than at the foot of the page. After five concrete features
"quite a few others" refers to something; at the foot it was a vague promise
between the paper directions and the sign-off.

### 8.6 The Paper Directions

**Heading** — screen readers only (`sr-only`):

> How to run a bowl out of paper

**Lead paragraph**, on the dark page above the card:

> It wasn't an easy decision to make this app, because the bowl with slips of paper is charming. If you, dear reader, like that idea, I encourage you to go right ahead. Here is how we did it.

**The card** (`.about-paper-card`) is an ordered list of seven directions:

1. Find a bowl and keep it somewhere safe.
2. Keep paper and a pen next to the bowl. Cut or tear off a little piece of paper.
3. Write a movie you want to watch on the piece of paper. Optionally include the date.
4. Put the slip of paper in the bowl, folded so that the title is hidden.
5. When it is time to watch, draw one slip.
6. Watch the movie.
7. If you want a record of what you watched, keep the drawn slips in a separate container.

These are directions, not persuasion. They contain no rule the author did not
use, and nothing here argues for the app — step 3 already carries the only rule
that matters, that a slip is a movie you want to watch, so do not restate it in
the lead.

The card is the only light surface on the page, sharing the draw ticket's paper,
rotated half a degree. Its type is raw slate-800 rather than the app's tokens,
which is deliberate: it is not a product surface. Do not restyle it into a
panel — once it matches the page it reads as another feature section, and the
joke, which is that this page will teach you how to not need it, is gone.

### 8.7 Closing

> If it starts to fray the way ours did, this is here.

> Welcome.

> — Scott

One signature, and it is the last text before the buttons. The page is a letter;
signing it in the middle read as a false ending.

**Primary action**

- Signed out: **Start a bowl**
- Signed in: **Open my bowls**

**Secondary action**

> Contact support

Retain the existing support mail link and TMDB attribution. This section has no
eyebrow and no heading — the signature is the last voice on the page.

## 9. Interaction State Table

| Component | State | Behavior |
| --- | --- | --- |
| Draw demo | Idle | Bowl, contributor chips, idle line, and draw button visible |
| Draw demo | Drawing | Button disabled; bowl animation and polite live status run |
| Draw demo | Revealed | Paper ticket, contributor explanation, draw-again action |
| Paper directions | Any | Static; no state |

## 10. Motion

- No section animates simply because it enters the viewport.
- The bowl draw is the only expressive animation:
  - Bowl shake: approximately 700 ms.
  - Slip lift and unfold: approximately 500 ms.
  - Total response: no more than 1.3 seconds.
- `prefers-reduced-motion: reduce` removes shake and movement. The result appears immediately with a subtle opacity change or no transition.

## 11. Visual System

### Color

- Canvas and surfaces: existing slate/near-black tokens.
- Primary emphasis: existing rose tokens, and spend them sparingly — the hero eyebrow, the demo, the thesis clause, the story eyebrow, the last dot on the marked list, the answers beneath each problem. A rose eyebrow over every section is what flattened the old page.
- Demo paper: warm off-white, used in the bowl result and again, larger, for the paper directions. Those two are the page's only light surfaces and they use the same paper.
- Do not introduce a separate "AI blue" or "scrolling warning amber."

### Type

- Continue the current Avenir Next / Manrope / Inter stack.
- Hero heading: `text-4xl` mobile, `text-6xl` desktop, tight tracking.
- Section heading: `text-3xl` mobile, `text-4xl` desktop.
- The thesis sits between them in weight: large, but `font-medium`, not `font-semibold`.
- The paper card sets its own type: slate-800 on paper, rose-800 markers.
- Body measure: 58–68 characters.

### Shape and depth

- Use existing `rounded-2xl` and `rounded-3xl` surfaces.
- The demo gets a restrained rose halo; no neon treatment.
- Paper slips provide the physical contrast and reinforce the bowl metaphor.
- Avoid movie posters in the About demo. They add visual noise, licensing/loading concerns, and shift attention from the decision model.

## 12. Responsive Behavior

| Viewport | Layout |
| --- | --- |
| 320–639 px | Single column throughout; the paper card keeps its rotation |
| 640–1023 px | Single-column hero; prose blocks hold their `max-w-2xl` measure |
| 1024 px and above | Hero is text + demo side by side; everything below stays one column |

- Primary buttons become full width below 480 px.
- No horizontal scrolling is required.
- Hero and demo remain useful at 200% browser zoom.
- Paper result copy may wrap to two lines without clipping.

## 13. Accessibility

- Preserve a single page-level `h1` and sequential heading levels. The demo's "A sample bowl" is an `h2` because it sits inside the hero.
- Demo buttons use visible focus styles and a minimum 44 px target height.
- The bowl illustration remains decorative; meaningful state is announced in text.
- Drawing uses a polite live region:
  - `Drawing from the sample bowl.`
  - `Arrival was drawn from your significant other's picks.`
- The paper directions are a section without a visible heading, so they carry an `sr-only` one. A section a sighted reader can see the shape of still needs a name in the outline.
- The marked list's dots are decorative (`aria-hidden`); the list itself is an `ol` with an accessible name.
- The paper card is the one place on the page with dark text on light, so check its contrast against the app's dark surfaces rather than assuming the token pairs apply.
- Rose/slate combinations must meet WCAG AA contrast for their text sizes.
- Reduced-motion behavior is required, not optional polish.

## 14. Content and Technical Constraints

- `/about` remains available without authentication.
- The demo makes no TMDB, Supabase, streaming-provider, or other network requests.
- The demo never reads or mutates a visitor's real bowls.
- Reuse the existing bowl asset and animation vocabulary.
- Do not add a carousel library, animation dependency, or analytics dependency for this work.
- The page should remain functional if CSS motion is unavailable.
- The demo may use a small pure helper for contributor-first selection, but it should not call the production provider-enrichment flow.

## 15. Component Structure

```text
src/screens/AboutPage.jsx              hero, thesis, story, problems, paper, closing
src/components/about/AboutDrawDemo.jsx the stateful sample draw
```

The demo is the only component here, because it is the only part with state.
Everything else is markup used once, with its copy in constants at the top of
the screen. `AboutComparison` was deleted with the section it drew.

## 16. Test Coverage

### Page tests (`src/screens/__tests__/AboutPage.test.jsx`)

- Renders the hero, the thesis, and the origin story.
- Puts a working draw in the hero.
- Pairs each thing that went wrong with the feature that answers it.
- Renders all seven paper directions under their `sr-only` heading.
- Asserts one signature, and that it is the last of the page's voice — the guard against putting it back under the story.
- Asserts the collect/filter/draw beats and "Where this sits" are gone — the guard against reintroducing onboarding the empty My Bowls screen already does.
- Keeps the support mail link and TMDB attribution.
- Uses the correct signed-in or signed-out action.

### Demo tests (`src/components/about/__tests__/AboutDrawDemo.test.jsx`)

- Presents the sample bowl before anything is drawn.
- A draw selects a contributor first and then one of their titles.
- A revealed result offers another draw and replaces the idle line.
- Drawing status and result are exposed through a live region.

### Visual QA

- Review at 320, 390, 768, 1024, and 1440 px.
- Review at 200% zoom.
- Review with reduced motion enabled.
- Review long sample titles and wrapped contributor names.

## 17. Success Criteria

The concept is successful when:

- A first-time visitor can explain Movie Bowl as "we choose the list; it chooses one" from the hero alone.
- A reader who prefers paper leaves with working directions and no hard feelings.
- Every section earns its scroll — remove any one of them and something is lost.
- The page sounds like the person who made it, and the case for each feature is a thing that actually went wrong.
- The contributor-first method reads as fairness, not probability homework.
- The page creates a clear path into the product for both signed-in and signed-out visitors.

## 18. Non-Goals

- A complete interactive copy of the bowl dashboard.
- Live movie search or real streaming availability.
- An onboarding tutorial for every feature.
- A debate about whether human or algorithmic taste is objectively better.
- Detailed owner, invite, permission, and account-management documentation.
- Changes to the production draw algorithm.
- A section for every capability the product has. The About page is an argument, not an index.
