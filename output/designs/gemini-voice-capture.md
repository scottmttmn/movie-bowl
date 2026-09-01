# Gemini-first voice capture

Status: proposed product and implementation roadmap, recorded August 31, 2026.
The disposable Gate 0 App Actions probe was scaffolded in `android-mobile/` on
September 1, 2026; preview, Play internal testing, and physical Gemini testing
have not run. The saved default bowl and shared global Add flow are implemented;
their remaining deployed-app checks stay independent of this work.

## Decision

Build the first assistant-driven add for Gemini on Android. Keep the capture
contract assistant-neutral so Siri or another adapter can use it later, but do
not make an Apple App Intent the first implementation.

The first honest promise is:

> Say “Hey Google, add Sinners to my Movie Bowl list.” Movie Bowl opens with
> Sinners already searched against your current default bowl. Confirm the right
> movie once, and it is added.

Gemini is the assistant, but the Android wake phrase is still “Hey Google.” The
shorter “add Sinners to Movie Bowl” is a usability target, not release copy,
until it works reliably on a physical phone.

This first version is **voice capture plus one-tap confirmation**, not an
invisible background write. A spoken title can be transcribed incorrectly, and
TMDB can return remakes and same-name films. Adding the wrong movie silently is
worse than asking for one confirmation.

## Why the default bowl changes the problem

Before personal defaults, a voice command had two unresolved entities: the
movie and the destination. The default-bowl resolver removes the second. Voice
capture must use the account's authoritative saved default at the moment the
capture screen opens. It must not use the last-opened bowl, guess from a spoken
bowl name, or persist a temporary destination from an earlier Add dialog.

The list name received from Android identifies the Movie Bowl app experience;
it is not authority to select a bowl. A phrase naming “Friday Night” can open
the same confirmation UI and let the existing selector change the destination,
but version one still starts at the saved default.

If the default changes between the utterance and the app opening, the newly
resolved default wins. If there are no accessible bowls, show the existing
create-or-join path. A failed or offline context load is not evidence that the
default disappeared.

## The supported Android surface

Google's current public developer surface is **App Actions**, declared through
Android's `shortcuts.xml`. Google's Android assistant entry point covers Gemini
and Google Assistant; its App Actions overview says capabilities are registered
when the Android application is uploaded through Google Play:

- [Gemini and Google Assistant on Android](https://developer.android.com/assistant)
- [Google Assistant for Android](https://developer.android.com/develop/devices/assistant/overview)
- [App Actions built-in intents](https://developer.android.com/reference/app-actions/built-in-intents)

The closest built-in intent is
[`actions.intent.UPDATE_ITEM_LIST`](https://developer.android.com/reference/app-actions/built-in-intents/productivity/update-item-list).
It supplies an existing list name through `itemList.name` and an arbitrary new
item through `itemList.itemListElement.name`. The Android adapter maps only the
item value to the movie-title draft. Use `shortcuts.xml`; the older
`actions.xml` form is deprecated.

At the time of this decision, Google's reference lists `en-US` as the invocation
locale for this built-in intent. Locale coverage is therefore a release fact to
verify, not something Movie Bowl can infer or promise.

Google's documentation spans both the Gemini and legacy Assistant names. That
does not substitute for a real-device result. A Gemini-default physical Android
phone and a Google Play internal-testing build are the first gate in this plan.

## Experience

1. The signed-in user says, “Hey Google, add Sinners to my Movie Bowl list.”
2. Gemini matches Movie Bowl's Android App Action and passes `Sinners` as the
   list-item name.
3. The Android app opens the authenticated Movie Bowl web experience at the
   capture route.
4. Movie Bowl resolves the user's current saved default, opens the shared Add
   dialog, fills the search field with `Sinners`, and searches immediately.
5. Results retain posters, years, providers, Details, and explicit destination
   copy. Nothing is added yet.
6. The user taps Add on the intended result. Existing duplicate, access,
   capacity, offline, pending-write, and unknown-outcome handling remains in
   force.
7. Success names both the movie and destination. The user can add another title
   or close, exactly as in global Add.

The title remains editable. If search finds nothing, the existing explicit
custom-title action remains available; voice capture must never silently turn a
failed lookup into a custom slip.

## Architecture

```text
Gemini / “Hey Google”
  -> Android App Action (UPDATE_ITEM_LIST)
  -> small Android mobile launcher
  -> verified Trusted Web Activity URL
  -> authenticated /add-movie capture route
  -> current default-bowl resolver
  -> shared global Add + TMDB search
  -> existing addBowlMovie write path after confirmation
```

### Android mobile application

The separate `android-mobile/` project begins as the disposable Gate 0 probe.
Do not extend `tv-android/`: that package requires Leanback, declares no
touchscreen, forces landscape, opens `/tv`, and exists as a Google TV validation
harness. Its WebView and D-pad code are the wrong product surface even though
some build configuration can be copied.

The recommended phone shell is a **Trusted Web Activity (TWA)** rather than a
second WebView client. A TWA renders the responsive web app through the user's
browser, shares that browser's authentication state, and can receive the movie
title through its launch URL. Google documents the model and its Digital Asset
Links requirement here:

- [Trusted Web Activities overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Trusted Web Activities quick start](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2)

The Android project needs:

- a final package ID after checking Google Play availability;
- a phone launcher activity and responsive portrait/rotation behavior;
- `shortcuts.xml` with the `UPDATE_ITEM_LIST` capability;
- a fulfillment mapping from `itemList.itemListElement.name` to the capture
  URL's `title` parameter;
- Google Play App Signing and an internal-testing track;
- the production signing fingerprint in
  `public/.well-known/assetlinks.json`;
- a web app manifest, icons, theme colors, and whatever current TWA/PWA
  installability checks require;
- no Supabase service key, TMDB key, or private write credential in the APK.

The production asset association must trust the Play signing certificate, not
a checked-in debug certificate. Local verification can use Android's documented
test workflow or a separate development association.

### Web capture contract

Add an authenticated route with this shape:

```text
/add-movie?title=Sinners&source=gemini
```

This is a UI entry point, never a write endpoint.

- `title` is untrusted text. Trim it, preserve Unicode, cap it at 200
  characters, and pass it through React/text APIs rather than HTML.
- `source` is an allowlisted analytics/diagnostic label. It grants no access and
  changes no write behavior.
- Do not accept a bowl ID, account ID, token, TMDB ID, or “confirmed” flag from
  this URL.
- After the title has been captured into client state, replace the browser
  history entry without the query string so the spoken title is not retained in
  ordinary navigation history longer than necessary.
- `RequireAuth` owns signed-out behavior and must return to the same capture
  after login. Verify the magic-link return inside the TWA before release.
- Opening the URL again is harmless because loading/searching performs no
  write. Only the existing Add action creates a slip.

Extend the shared add controller with an explicit launch draft, for example
`openGlobalAdd({ initialQuery, source })`. Extend `MovieSearch` with a one-time
initial query that triggers the same search path as typed or browser-microphone
input. Do not build a parallel search component or a native TMDB client.

The existing `addBowlMovie` service remains the sole signed-in write path. That
preserves account checks, authoritative bowl access, default repair, undrawn
capacity, duplicate attribution, submission UUIDs, metadata hydration, and
unknown-outcome reconciliation.

## Delivery sequence

### Gate 0 — Gemini invocation spike

Do this before adding a mobile shell or changing production web behavior.

1. Make the smallest internal Android test application with a
   `shortcuts.xml` `UPDATE_ITEM_LIST` capability and a screen that prints the
   received list name and item name.
2. Create an App Actions preview with the Android Studio Assistant tooling.
3. Upload an internal-testing build to Google Play; App Actions registration is
   tied to the uploaded application.
4. On a physical Android phone with Gemini as the default assistant, test:
   - “add Sinners to my Movie Bowl list”;
   - “add Sinners to Movie Bowl”;
   - a title with punctuation, numbers, and a subtitle;
   - a same-name/remake title;
   - launch while the phone is locked, which may require an unlock and must
     never bypass it;
   - an unsupported locale/account configuration.
5. Record the exact phrases that route reliably and the exact parameter values
   Android delivers.

Pass condition: a normal user phrase opens the installed internal build and
preserves the complete movie title often enough to justify the product. If it
does not, stop. Do not replace a failed App Action with Gemini screen automation
or an undocumented Connected App integration.

### Phase 1 — Web capture seam

- Add the authenticated `/add-movie` route.
- Add one-time initial-query support to the global Add controller and
  `MovieSearch`.
- Consume and remove query parameters from browser history.
- Cover signed-in, signed-out return, no-bowl, stale-default, offline,
  ambiguous-result, duplicate, capacity, and unknown-write states.
- Exercise the entire experience by opening a capture URL in an ordinary mobile
  browser. No Android code is required to verify this phase.

This phase deliberately ships a reusable adapter boundary. Siri, a share target,
or another trusted platform entry point can later launch the same confirmation
experience without owning bowl or movie writes.

### Phase 2 — Android mobile shell and App Action

- Add the phone TWA project, production web manifest, icons, and Digital Asset
  Links association.
- Connect `UPDATE_ITEM_LIST` to the capture route with the title encoded once.
- Verify browser/TWA authentication continuity and magic-link return.
- Test the App Action from Android Studio, Google Play internal testing, and a
  physical Gemini-default phone.
- Keep a normal launcher entry that opens Movie Bowl Home; the package must be a
  useful Movie Bowl app even when invoked without voice.

### Phase 3 — Limited release

- Release first to a small Android testing group.
- Validate invocation recognition separately from Movie Bowl search success;
  they are two distinct failure domains.
- Publish only phrases proven on hardware. Include the required Gemini/Android,
  locale, installed-app, signed-in, and network conditions.
- Run ordinary mobile Add, browser microphone, default-bowl, login, and
  deployed-build smoke checks before promotion.

### Later adapters and reductions in friction

After the confirmed flow has real use:

- investigate a spoken confirmation that still shows the resolved title and
  destination before writing;
- consider a one-utterance add only if exact-match evidence makes mistakes rare
  and the assistant platform provides a trustworthy confirmation contract;
- add Siri/App Intent as a thin adapter over the same web capture route;
- consider named-bowl voice targeting only as an explicit second version, never
  by weakening the default-bowl rule;
- reconsider share targets only if real recommendations arrive with links often
  enough to justify them.

## Safety and privacy rules

- A URL load, App Action replay, browser refresh, or Android activity restart
  must never add a movie.
- The authenticated account and current default come from Supabase, not Android
  intent extras or query parameters.
- A spoken title is a search draft, not a TMDB identity.
- The user sees the destination and movie identity before the write.
- Existing row-level security and client account-generation checks stay in
  force; no assistant-specific service-role endpoint is introduced.
- Do not log full utterances. If instrumentation is added, record only coarse
  stages such as invocation received, capture opened, search returned, and add
  confirmed. Movie titles require an explicit product decision before analytics
  retain them.
- The first version requires the device to be unlocked for confirmation. It
  must not try to add from a lock-screen background context.

## Verification matrix

| Layer | Required evidence |
| --- | --- |
| App Action | Preview and Play internal build deliver the full item title |
| Gemini hardware | Proven invocation phrases on a physical phone with Gemini as default |
| Android routing | Encodes Unicode once, rejects empty/oversized titles, survives activity recreation |
| TWA | Digital Asset Links verifies; auth session and magic-link return work |
| Capture route | Requires auth, removes the query after capture, never writes on load/reload |
| Default bowl | Uses current saved default; repairs confirmed lost access; never trusts a spoken bowl name |
| Search | Prefills once, searches once, stays editable, presents ambiguous results |
| Add | Reuses duplicate/capacity/access/offline/pending/unknown-outcome behavior |
| Regression | Global Add, contextual Add, browser mic, manual history, public add links, and TV are unchanged |

## Release blockers and open facts

- The Gate 0 probe is scaffolded, but its App Actions preview and physical
  Gemini invocation matrix have not run.
- The probe package ID is intentionally disposable. No production Android phone
  package ID, Play listing, signing setup, or internal-testing application
  exists.
- The web app does not yet expose the manifest and Digital Asset Links needed by
  the recommended TWA path.
- TWA authentication and Supabase magic-link return need a physical-phone proof.
- The documented `UPDATE_ITEM_LIST` invocation locale is currently `en-US`.
- One-tap confirmation is the version-one product decision. A later no-touch
  add is not implied or committed.

## Explicitly separate work

This roadmap is unrelated to the TV theater-mode voice card. That card displays
a sentence for a person to speak to the television assistant after a draw. It
does not capture movies into a bowl, and the Android TV shell cannot stand in
for the Android phone App Action described here.

It also does not replace the browser microphone in `MovieSearch`. Browser voice
input remains an in-app search convenience; Gemini capture is an outside-the-app
entry point whose only special power is arriving with a title draft.
