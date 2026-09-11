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

## 5. Page Architecture

1. Public top navigation
2. Hero — headline and the live sample draw, side by side
3. The thesis, set alone
4. Use-case story with the merged moment/step timeline
5. Where this sits — static comparison
6. Closing call to action and support
7. TMDB attribution

Five content blocks, and the three-across grid appears exactly once, at the
bottom, in the quietest type on the page. The maximum content width remains the
page container, with narrower measures inside sections.

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
│ TONIGHT, 8:13 P.M.                        ○ OVER THE MONTH                   │
│                                           │ Collect over time                │
│ Everyone is ready to watch.               │                                  │
│ Nobody wants to browse.                   ○ TONIGHT                          │
│                                           │ Filter for tonight               │
│ Movie Bowl does not need to guess …       │                                  │
│                                           ● ONE DRAW LATER                   │
│                                             Draw together                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ WHERE THIS SITS                                                              │
│   YOU CHOOSE EVERYTHING     YOU CHOOSE THE POOL      A SYSTEM CHOOSES        │
│   ──────────○────────────────────●────────────────────────○─────────────      │
│   Browse everything         Draw from the bowl       Take a recommendation    │
│   Every movie is still …    You decide what is …     A confident answer …     │
├──────────────────────────────────────────────────────────────────────────────┤
│         A little structure. One good surprise. No endless scroll.            │
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
│ TONIGHT, 8:13 P.M.       │
│ [story and timeline]     │
├──────────────────────────┤
│ WHERE THIS SITS          │
│ [three stacked entries]  │
├──────────────────────────┤
│ [ Start a bowl ]         │
│ [ Contact support ]      │
└──────────────────────────┘
```

The comparison rail is a wide-viewport device — three labels cannot sit side by
side legibly below 640 px — so each narrow-layout entry carries its own label
above the title instead.

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

### 8.4 Use-Case Story

**Eyebrow**

> Tonight, 8:13 p.m.

**Heading**

> Everyone is ready to watch. Nobody wants to browse.

**Story**

> Movie Bowl does not need to guess what everyone might enjoy. Every title in the bowl was added by someone who wants to watch it, so the only question left is which one — and that is the question the bowl answers.

**Timeline** — each entry carries the moment *and* the product step, which is
what lets this one list replace the former "How it works" section:

| Moment | Step | Body |
| --- | --- | --- |
| Over the month | Collect over time | Bowl members add movies whenever someone says, "We should watch that." |
| Tonight | Filter for tonight | Narrow the bowl to what fits: under two hours, on your services, maybe something funny. |
| One draw later | Draw together | The bowl selects a member first, then one of their movies. The search is over. |

On mobile the moments stack under the story with their connecting line.

### 8.5 Where This Sits (`AboutComparison`)

Static. No buttons, no simulated results, no invented match percentages.

**Section heading** — small, slate, uppercase, deliberately quieter than the
headings above it:

> Where this sits

| Position | Title | Body |
| --- | --- | --- |
| You choose everything | Browse everything | Every movie is still possible. Apparently, so is another half hour of browsing. |
| You choose the pool | Draw from the bowl | You decide what is eligible. A draw you can explain decides the rest. |
| A system chooses | Take a recommendation | A confident answer in a second, as long as you are comfortable letting a system set the shortlist. |

- The rail keeps its three stops with the center one accented; columns are even.
- Only the center title takes the rose accent. The outer two are slate-neutral — a comparison, not a morality chart.
- Resist making these interactive again. Animating the alternatives spends the page's attention on someone else's product.

### 8.6 Closing Call to Action

**Heading**

> A little structure. One good surprise. No endless scroll.

**Primary action**

- Signed out: **Start a bowl**
- Signed in: **Open my bowls**

**Secondary action**

> Contact support

Retain the existing support mail link and TMDB attribution. This section has no
eyebrow — the closing heading is the last voice on the page and does not need
one more label above it.

## 9. Interaction State Table

| Component | State | Behavior |
| --- | --- | --- |
| Draw demo | Idle | Bowl, contributor chips, idle line, and draw button visible |
| Draw demo | Drawing | Button disabled; bowl animation and polite live status run |
| Draw demo | Revealed | Paper ticket, contributor explanation, draw-again action |
| Comparison | Any | Static; no state |

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
- Primary emphasis: existing rose tokens, and spend them sparingly — the hero eyebrow, the demo, the thesis clause, the story eyebrow, the center rail stop. A rose eyebrow over every section is what flattened the old page.
- Demo paper: warm off-white used only inside the bowl result.
- Do not introduce a separate "AI blue" or "scrolling warning amber."

### Type

- Continue the current Avenir Next / Manrope / Inter stack.
- Hero heading: `text-4xl` mobile, `text-6xl` desktop, tight tracking.
- Section heading: `text-3xl` mobile, `text-4xl` desktop.
- The thesis sits between them in weight: large, but `font-medium`, not `font-semibold`.
- The comparison heading is deliberately the smallest heading on the page.
- Body measure: 58–68 characters.

### Shape and depth

- Use existing `rounded-2xl` and `rounded-3xl` surfaces.
- The demo gets a restrained rose halo; no neon treatment.
- Paper slips provide the physical contrast and reinforce the bowl metaphor.
- Avoid movie posters in the About demo. They add visual noise, licensing/loading concerns, and shift attention from the decision model.

## 12. Responsive Behavior

| Viewport | Layout |
| --- | --- |
| 320–639 px | Single column; comparison entries stack, each with its own rail label |
| 640–1023 px | Single-column hero; comparison is three columns under the rail |
| 1024 px and above | Hero is text + demo side by side |

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
- The comparison rail is decorative (`aria-hidden`); its labels are repeated in readable text for narrow layouts.
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
src/screens/AboutPage.jsx              hero, thesis, story, closing, attribution
src/components/about/AboutDrawDemo.jsx the stateful sample draw
src/components/about/AboutComparison.jsx the static three-way comparison
```

The story timeline and the closing call to action are markup, not components;
they hold no state and are used once.

## 16. Test Coverage

### Page tests (`src/screens/__tests__/AboutPage.test.jsx`)

- Renders the hero, the thesis, the story, and the comparison.
- Puts a working draw in the hero.
- Asserts the collect/filter/draw beats appear exactly once — this is the guard against the duplication the page was cut for.
- Keeps the support mail link and TMDB attribution.
- Uses the correct signed-in or signed-out action.

### Demo tests (`src/components/about/__tests__/AboutDrawDemo.test.jsx`)

- Presents the sample bowl before anything is drawn.
- A draw selects a contributor first and then one of their titles.
- A revealed result offers another draw and replaces the idle line.
- Drawing status and result are exposed through a live region.

### Comparison tests (`src/components/about/__tests__/AboutComparison.test.jsx`)

- Places the bowl between the two alternatives without a straw man.
- Asserts the section stays static — no buttons, no tabs.

### Visual QA

- Review at 320, 390, 768, 1024, and 1440 px.
- Review at 200% zoom.
- Review with reduced motion enabled.
- Review long sample titles and wrapped contributor names.

## 17. Success Criteria

The concept is successful when:

- A first-time visitor can explain Movie Bowl as "we choose the list; it chooses one" from the hero alone.
- Every section earns its scroll — remove any one of them and something is lost.
- The comparison feels honest rather than like a sales chart.
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
