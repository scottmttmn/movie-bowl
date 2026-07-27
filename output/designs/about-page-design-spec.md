# Movie Bowl About Page — Design Specification

**Status:** Implemented in the `/about` route
**Route:** `/about`
**Purpose:** Explain why Movie Bowl exists, make its philosophy memorable, and let a visitor experience the core idea before creating or joining a bowl.

## 1. Product Story

Movie Bowl sits between two common ways of choosing what to watch:

1. **Browse everything:** People keep searching because the catalog never ends.
2. **Movie Bowl:** People choose the pool; a transparent, fair draw makes the final decision.
3. **Algorithmic recommendation:** A system chooses quickly, but the people watching give up more control over the pool and the reasoning.

The page should not argue that browsing or recommendation systems are bad. Both solve real problems. It should make Movie Bowl's particular tradeoff clear:

> **Human curation without decision fatigue.**

The more conversational version, used in the hero:

> **You choose the possibilities. Movie Bowl ends the debate.**

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

The visitor should be able to understand the page's premise from the hero and demo alone. The remaining sections add conviction; they should not be required to decode the product.

## 4. Voice and Tone

- Confident, warm, and lightly playful.
- Plainspoken rather than technical.
- Positive about Movie Bowl without caricaturing the alternatives.
- Let the comparison carry a little pointed humor, especially about endless browsing, but stop before either alternative becomes a straw man.
- Focused on the familiar moment when a couple or family is ready to watch but nobody wants to choose.
- Use "draw," "bowl," "your picks," "significant other," "family," and "the people you watch with."
- Avoid "content," "optimization," "engagement," and claims about finding a "perfect" movie.

## 5. Page Architecture

1. Public top navigation
2. Hero
3. Interactive decision spectrum
4. Philosophy principles
5. Primary use-case story
6. Three-step product flow
7. Closing call to action and support
8. TMDB attribution

The page uses the existing dark, late-night visual system. The maximum content width remains `max-w-6xl`, with narrower text measures inside sections.

## 6. Desktop Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Movie Bowl                                                   [menu]          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                 A BETTER WAY TO CHOOSE MOVIE NIGHT                           │
│                 Stop searching. Start watching.                              │
│                                                                              │
│     Movie Bowl is the space between endless scrolling and handing the        │
│     choice to an algorithm. You and the people you watch with fill the       │
│     bowl with movies someone wants to see. A fair draw picks tonight's.      │
│                                                                              │
│                 [ Try the demo ↓ ]  [ Start a bowl ]                         │
│                                                                              │
├────────────────────── THREE WAYS TO CHOOSE ──────────────────────────────────┤
│                                                                              │
│   YOU CHOOSE EVERYTHING      YOU CHOOSE THE POOL       A SYSTEM CHOOSES      │
│   ───────────●──────────────────────●────────────────────────●────────────    │
│                                                                              │
│  ┌────────────────────┐    ┌────────────────────────┐   ┌───────────────────┐ │
│  │ BROWSE EVERYTHING  │    │ MOVIE BOWL             │   │ GET A RECOMMEND. │ │
│  │                    │    │                        │   │                   │ │
│  │  title after title │    │      [bowl image]      │   │  96% MATCH       │ │
│  │  title after title │    │ 75 movies · 2 members │   │  Tonight's pick  │ │
│  │  title after title │    │                        │   │                   │ │
│  │                    │    │ [ Draw tonight's movie ]│   │ Based on signals│ │
│  │ [ Keep browsing ]  │    │                        │   │ you don't manage │ │
│  │ Still deciding…    │    │ Every option has      │   │ directly.        │ │
│  └────────────────────┘    │ someone rooting for it.│   └───────────────────┘ │
│                            └────────────────────────┘                         │
│                                                                              │
├──────────────────────────── WHAT WE BELIEVE ─────────────────────────────────┤
│                                                                              │
│  CURATE DELIBERATELY        DECIDE PLAYFULLY          SHARE THE CHOICE       │
│  Save the good ideas        Once every option is      Each person's picks    │
│  before movie night.        good, chance is useful.   get a fair shot.       │
│                                                                              │
├────────────────────────── TONIGHT, 8:13 P.M. ────────────────────────────────┤
│                                                                              │
│  "Everyone is ready to watch. Nobody wants to browse."       [mini timeline] │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│        COLLECT OVER TIME  →  FILTER FOR TONIGHT  →  DRAW TOGETHER             │
├──────────────────────────────────────────────────────────────────────────────┤
│         A little structure. One good surprise. No endless scroll.            │
│                  [ Start a bowl ]  [ Contact support ]                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 7. Mobile Wireframe

The page remains linear. The spectrum comparison becomes a three-option selector so the central demo can remain legible without horizontal scrolling.

```text
┌──────────────────────────┐
│ Movie Bowl        [menu] │
├──────────────────────────┤
│ A BETTER WAY TO CHOOSE   │
│                          │
│ Stop searching.          │
│ Start watching.          │
│                          │
│ Short hero explanation.  │
│                          │
│ [ Try the demo ↓ ]       │
│ [ Start a bowl ]         │
├──────────────────────────┤
│ THREE WAYS TO CHOOSE     │
│                          │
│ [Browse] [Bowl] [AI]     │
│             ─────        │
│                          │
│ ┌──────────────────────┐ │
│ │ MOVIE BOWL           │ │
│ │                      │ │
│ │     [bowl image]     │ │
│ │ 75 movies · 2 members│ │
│ │                      │ │
│ │ [ Draw a movie ]     │ │
│ └──────────────────────┘ │
│                          │
│ You choose the pool.     │
│ The bowl ends the debate.│
├──────────────────────────┤
│ WHAT WE BELIEVE          │
│ [three stacked items]    │
├──────────────────────────┤
│ TONIGHT, 8:13 P.M.       │
│ [story and timeline]     │
├──────────────────────────┤
│ [ Start a bowl ]         │
│ [ Contact support ]      │
└──────────────────────────┘
```

The **Bowl** tab is selected by default. All three tabs are visible and keyboard-operable. Swiping is not required.

## 8. Section Specifications

### 8.1 Hero

**Eyebrow**

> A better way to choose movie night

**Heading**

> Stop searching. Start watching.

**Body**

> Movie Bowl is the space between endless scrolling and handing the choice to an algorithm. You and the people you watch with fill the bowl with movies someone wants to see. A fair draw picks tonight's.

**Primary action**

> Try the demo

- Smooth-scroll to `#decision-demo`.
- On reduced-motion systems, jump without animation.

**Secondary action**

- Signed out: **Start a bowl** → `/login`
- Signed in: **Open my bowls** → `/`

**Visual treatment**

- Use the existing `page-hero` surface as a starting point, widened to the page grid.
- Keep the hero primarily typographic. The interactive bowl belongs in the next section and should remain the visual payoff.
- A faint trail of paper slips may bridge the hero and demo, but it must not look like a second illustration or compete with the heading.

### 8.2 Interactive Decision Spectrum

**Section heading**

> Three ways to choose

**Intro**

> One approach can keep you browsing. Another can give you an answer immediately. Movie Bowl keeps you and the people you watch with in charge of the choices while making the final decision easy.

#### Spectrum labels

| Position | Short label | Decision model | Benefit | Tradeoff |
| --- | --- | --- | --- | --- |
| Left | Browse everything | You search and choose from the entire catalog | Maximum direct control | Highest decision effort |
| Center | Movie Bowl | People curate; the bowl makes the final selection | Personal, shared, and decisive | Requires building a bowl first |
| Right | Get a recommendation | A system builds and selects from the candidate pool | Fastest initial answer | Least direct control and transparency |

The visual spectrum uses a thin horizontal rail with three stops. It is explanatory, not a range input. The cards themselves are the interactive controls on desktop; mobile uses an explicit tablist.

#### Left card: Browse everything

**Label**

> You choose everything

**Card title**

> Browse everything

**Body**

> Every movie is still possible. Apparently, so is another half hour of browsing.

**Interaction**

- Show five compact, text-only title rows inside a vertically clipped list.
- **Keep browsing** replaces the rows with the next sample set.
- A small status changes across three clicks:
  - Initial: `12 minutes browsing`
  - First click: `24 minutes browsing`
  - Second click: `37 minutes browsing`
  - Third and later: `Still deciding…`
- Do not auto-scroll. The visitor initiates the joke, which avoids distracting motion and keeps the humor from becoming heavy-handed.

#### Center card: Movie Bowl

**Label**

> You choose the pool

**Card title**

> Draw from the bowl

**Body**

> 75 movies. Two people. Every option has someone rooting for it.

**Idle visual**

- Reuse `bowl-illustration-v3.png`.
- Add six small paper-slip shapes around or just inside the bowl.
- Show two contributor chips beneath the count: `You · 47`, `Significant other · 28`.
- Do not use posters or external images.

**Primary interaction**

> Draw tonight's movie

**Draw result**

- Reuse the existing bowl shake and paper-slip reveal language.
- Reveal one sample movie on an off-white paper ticket.
- Display the title and contributor:

  > **Arrival**
  > From your significant other's picks

- Follow with a one-sentence explanation:

  > Your significant other was selected first, then one of their movies. Each member had an equal chance.

**Result actions**

- **Draw again** runs another draw.
- A quiet **Reset demo** link restores the initial state.
- Sample draws should avoid immediate repeats.

**Representative draw titles**

| Contributor | Sample titles |
| --- | --- |
| You | *Moonlight*, *The Nice Guys*, *Knives Out* |
| Your significant other | *Arrival*, *Spirited Away*, *The Thing* |

The displayed bowl contains 75 movies, split 47/28 between its two members. The uneven split reinforces why the member-first draw matters: both members still have an equal chance to be selected. The smaller title set supplies recognizable reveal examples for the local demo. It does not add, draw, or modify real bowl data.

#### Right card: Algorithmic recommendation

**Label**

> A system chooses

**Card title**

> Get a recommendation

**Body**

> Get a quick, confident answer from signals and preferences interpreted for you.

**Visual**

- Show a compact result card:
  - `96% match`
  - `Tonight's recommendation`
  - A sample title
  - Three abstract signal bars labeled `Taste`, `Mood`, and `Popularity`
- A small line reads:

  > Fast and convenient—as long as you are comfortable letting the system define the shortlist.

**Interaction**

- **Recommend another** changes the title and match percentage.
- Avoid fake "thinking" animation. The strength of this mode is immediacy.

#### Center emphasis

- The Movie Bowl card is 8–12% wider on large screens.
- Use the existing rose accent and a brighter border glow.
- Outer cards remain slate-neutral; do not color-code them as warnings or failures.
- The spectrum may gently exaggerate the friction of browsing and the confidence of an algorithmic result, but it should still feel like a comparison rather than a morality chart.

### 8.3 Philosophy

**Section heading**

> What Movie Bowl believes

**Principle 1**

> **Curate deliberately**
> Add the movies that catch your attention when you find them. Movie night should not begin with a blank search box.

**Principle 2**

> **Decide playfully**
> When every remaining option is worth watching, chance is not a compromise. It is a clean way to commit.

**Principle 3**

> **Share the choice**
> The bowl selects a member first, then one of their movies. A long personal list does not drown out another bowl member's picks.

Each principle receives a small, simple line icon or CSS shape. Avoid stock illustrations.

### 8.4 Primary Use-Case Story

**Eyebrow**

> Tonight, 8:13 p.m.

**Heading**

> Everyone is ready to watch. Nobody wants to browse.

**Story**

> During the week, bowl members added movies whenever someone said, "We should watch that." Tonight, you narrow the bowl to what fits: under two hours, available on your services, maybe something funny. One draw later, the search is over.

**Supporting line**

> Movie Bowl does not need to guess what everyone might enjoy. Every title in the bowl was added by someone who wants to watch it.

**Visual treatment**

- Present this as a wide, quiet scene-break card.
- Use a three-moment time strip:
  - `Over the week` — bowl members add promising movies as they find them.
  - `Tonight` — bowl members pick practical constraints for the evening.
  - `One draw later` — the movie starts.
- On mobile, moments stack vertically with a connecting line.

### 8.5 Product Flow

**Step 1: Collect over time**

> Add movies as you think of them.

**Step 2: Filter for tonight**

> Narrow by streaming availability, rating, genre, or runtime when the night calls for it.

**Step 3: Draw together**

> Make one transparent draw from a pool built by bowl members.

This section replaces the current generic "How it works" and "Collaboration basics" lists. Ownership, invites, and draw permissions are supporting capabilities, not the main About-page story.

### 8.6 Closing Call to Action

**Heading**

> A little structure. One good surprise. No endless scroll.

**Primary action**

- Signed out: **Start a bowl**
- Signed in: **Open my bowls**

**Secondary action**

> Contact support

Retain the existing support mail link and TMDB attribution.

## 9. Interaction State Table

| Component | State | Behavior |
| --- | --- | --- |
| Spectrum | Default | Movie Bowl is active/emphasized |
| Spectrum | Mobile tab change | Selected panel replaces the prior panel without page movement |
| Browse demo | Initial | First five sample titles and initial elapsed time |
| Browse demo | Advanced | Next title set and increased elapsed time |
| Bowl demo | Idle | Bowl, contributor counts, and draw button visible |
| Bowl demo | Drawing | Button disabled; bowl animation and polite live status run |
| Bowl demo | Revealed | Paper result, contributor explanation, draw-again action |
| AI demo | Initial | First recommendation visible immediately |
| AI demo | Advanced | Alternate title and score appear without simulated delay |

## 10. Motion

- No section animates simply because it enters the viewport.
- The hero-to-demo scroll is the only page-level motion.
- The bowl draw is the only expressive animation:
  - Bowl shake: approximately 700 ms.
  - Slip lift and unfold: approximately 500 ms.
  - Total response: no more than 1.3 seconds.
- Browse and recommendation results cross-fade in 120–180 ms.
- `prefers-reduced-motion: reduce` removes shake, movement, and smooth scrolling. The result appears immediately with a subtle opacity change or no transition.

## 11. Visual System

### Color

- Canvas and surfaces: existing slate/near-black tokens.
- Primary emphasis: existing rose tokens.
- Demo paper: warm off-white used only inside the bowl result.
- Outer comparison cards: slate-neutral with equal visual weight.
- Do not introduce a separate "AI blue" or "scrolling warning amber."

### Type

- Continue the current Avenir Next / Manrope / Inter stack.
- Hero heading: `text-4xl` mobile, `text-6xl` desktop, tight tracking.
- Section heading: `text-2xl` mobile, `text-3xl` desktop.
- Body measure: 58–68 characters.
- The paper result may use the existing handwritten fallback for the title, but all explanatory text remains in the product typeface.

### Shape and depth

- Use existing `rounded-2xl` and `rounded-3xl` surfaces.
- The center demo gets a restrained rose halo; no neon treatment.
- Paper slips provide the physical contrast and reinforce the bowl metaphor.
- Avoid movie posters in the About demo. They add visual noise, licensing/loading concerns, and shift attention from the decision model.

## 12. Responsive Behavior

| Viewport | Layout |
| --- | --- |
| 320–639 px | Single column; comparison is a tablist with one visible card |
| 640–1023 px | Single-column hero; comparison may remain tabbed or use a center card with two compact summaries |
| 1024 px and above | Three comparison cards on one row; center card larger |

- Primary buttons become full width below 480 px.
- No horizontal scrolling is required.
- Hero and demo remain useful at 200% browser zoom.
- Paper result copy may wrap to two lines without clipping.

## 13. Accessibility

- Preserve a single page-level `h1` and sequential heading levels.
- The mobile comparison uses `role="tablist"`, `role="tab"`, and `role="tabpanel"` with arrow-key navigation.
- Desktop cards must not rely on hover to reveal explanatory content.
- Demo buttons use visible focus styles and a minimum 44 px target height.
- The bowl illustration remains decorative; meaningful state is announced in text.
- Drawing uses a polite live region:
  - `Drawing from the sample bowl.`
  - `Arrival was drawn from your significant other's picks.`
- Elapsed browsing time is not a live timer. It only changes after a user action.
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

## 15. Suggested Component Structure

```text
src/screens/AboutPage.jsx
src/components/about/AboutDecisionSpectrum.jsx
src/components/about/BrowseDemo.jsx
src/components/about/BowlDemo.jsx
src/components/about/RecommendationDemo.jsx
src/components/about/AboutPrinciples.jsx
src/components/about/AboutUseCase.jsx
```

If these sections stay small, `AboutPrinciples` and `AboutUseCase` can remain in `AboutPage.jsx`. The three stateful demo modes should be separate components to keep their tests and accessibility behavior focused.

## 16. Test Coverage

### Page tests

- Renders the revised hero and philosophy sections.
- Keeps the support mail link and TMDB attribution.
- Uses the correct signed-in or signed-out closing action.
- Retains unauthenticated access to `/about`.

### Demo tests

- Movie Bowl is the default mobile tab.
- Tab selection is keyboard-operable.
- Browse action advances its sample titles and status.
- Draw action reveals a sample title and contributor explanation.
- A repeated draw avoids an immediate repeat.
- Recommendation action changes its sample result.
- Drawing status and result are exposed through a live region.
- No demo action calls `fetch` or Supabase.

### Visual QA

- Review at 320, 390, 768, 1024, and 1440 px.
- Review at 200% zoom.
- Review with reduced motion enabled.
- Review long sample titles and wrapped contributor names.

## 17. Success Criteria

The concept is successful when:

- A first-time visitor can explain Movie Bowl as "we choose the list; it chooses one" after seeing only the first two sections.
- The interactive comparison feels useful rather than like a decorative gimmick.
- The AI panel feels like a legitimate alternative, not a straw man.
- The contributor-first method reads as fairness, not probability homework.
- The page creates a clear path into the product for both signed-in and signed-out visitors.

## 18. Non-Goals

- A complete interactive copy of the bowl dashboard.
- Live movie search or real streaming availability.
- An onboarding tutorial for every feature.
- A debate about whether human or algorithmic taste is objectively better.
- Detailed owner, invite, permission, and account-management documentation.
- Changes to the production draw algorithm.

## 19. Approved Direction

The following choices were approved for the next phase:

1. **Hero:** Use **Stop searching. Start watching.**
2. **Comparison tone:** Make the two extremes a little more comedic and pointed, while keeping their real strengths visible and avoiding caricature.
3. **Sample movies:** Use recognizable real titles presented as text, without poster artwork.
4. **Fairness:** Explain contributor-first selection directly in the demo result and reinforce it in the philosophy section.
5. **Primary call to action:** Lead with **Try the demo**; make product entry the secondary action.
