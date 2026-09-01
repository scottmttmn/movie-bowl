# Movie Bowl voice-capture probe

This is the Gate 0 Android App Actions spike for assistant-driven movie capture.
It answers one question before Movie Bowl builds a phone shell or web handoff:

> Can a normal “Hey Google” request reliably open Movie Bowl and preserve the
> complete spoken movie title?

The app deliberately does not contain the Movie Bowl website, authentication,
Supabase, TMDB, or an add operation. It only displays the exact list name,
movie-title, and Android action delivered to `MainActivity`.

`app.moviebowl.voicecaptureprobe` is a disposable probe application ID. Do not
publish it as the production Movie Bowl Android package.

## Project shape

- `res/xml/shortcuts.xml` declares `actions.intent.UPDATE_ITEM_LIST`.
- `itemList.name` is mapped to the `itemListName` Android intent extra.
- `itemList.itemListElement.name` is mapped to the
  `itemListElementName` extra and is required for the capture fulfillment.
- A fallback fulfillment opens the same diagnostic screen when Assistant
  recognizes an underspecified request.
- `MainActivity` handles both cold launches and a new App Action delivered while
  the app is already open.

The built-in intent currently supports `en-US` preview and invocation only.

## Build and run

Open `android-mobile` as its own project in Android Studio. It uses Android
Gradle Plugin 9.1.1, Gradle 9.3.1, Java 17, and Android SDK 37. The wrapper and
plugin match the repository's TV harness. Android Studio should use its bundled
JDK.

From a shell with `JAVA_HOME` pointing to that JDK:

```bash
./gradlew assembleDebug assembleDebugAndroidTest lintDebug
```

Install the debug build on an Android phone, then prove the Activity contract
without Assistant:

```bash
adb shell am start -W \
  -n app.moviebowl.voicecaptureprobe/.MainActivity \
  -a android.intent.action.VIEW \
  --es itemListName "Movie Bowl" \
  --es itemListElementName "Sinners"
```

The screen should show `Movie Bowl`, `Sinners`, and
`android.intent.action.VIEW`. Instrumented tests can be run from Android Studio
or with a connected device:

```bash
./gradlew connectedDebugAndroidTest
```

## Create an App Actions preview

Prerequisites:

- a Google Account shared by Android Studio and the test phone
- the Google Assistant plugin and App Actions test tool in Android Studio
- an Android phone configured for Assistant testing
- the device and preview locale set to `en-US`

Then:

1. Install and run the debug app once.
2. In Android Studio, open **Tools > Google Assistant > App Actions test tool**.
3. Create a preview using `Movie Bowl` as the invocation name and `en-US` as the
   locale.
4. Select `actions.intent.UPDATE_ITEM_LIST` and use this parameter object:

```json
{
  "@context": "http://schema.org",
  "@type": "ItemList",
  "itemListElement": {
    "@type": "ListItem",
    "name": "Sinners"
  },
  "name": "Movie Bowl"
}
```

5. Run the preview on the phone and confirm the two values shown by the app.

The preview proves the declaration and parameter mapping. It does not prove that
a natural Gemini utterance will choose the capability.

## Physical Gemini / Play gate

App Actions capabilities are registered for deployed apps through Google Play.
Use a Play internal-testing application for this disposable package, generate a
signed release bundle in Android Studio, upload it, and install that exact build
through the internal-testing link. The Play listing name controls the deployed
invocation name, so use the intended `Movie Bowl` name for the test.

On a physical phone with Gemini selected as the default assistant, test the
matrix in `TEST_RESULTS.md`. Record the wording exactly; do not summarize a
failure as “voice did not work.” Invocation matching and parameter extraction
are separate outcomes.

Gate 0 passes only if an ordinary phrase opens the installed build and preserves
the complete movie title often enough to justify the product. If it passes, the
next implementation is the authenticated web capture seam described in
`output/designs/gemini-voice-capture.md`.
