# Movie Bowl Google TV Test Wrapper

This directory contains a deliberately thin Android TV shell for exercising the
existing React `/tv` experience in the official Google TV emulator. Product UI
continues to live in `src/tv`; this project supplies only the native capabilities
that a television browser cannot model reliably.

The wrapper currently provides:

- a fullscreen, persistent WebView
- explicit D-pad and Select translation into the React TV navigation
- Android Back translation into the TV experience's Escape behavior
- native fullscreen-video hosting for trailer playback
- persistent cookies and DOM storage for the signed-in TV user
- QR-code account pairing without typing credentials on the television
- a fixed 1920 x 1080 TV layout scaled to the device viewport
- external provider-link handoff when an installed app can handle the URL
- an in-app explanation when no installed app can handle a provider link

## One-time Android setup

Android Studio 2026.1 is already installed on this Mac, but the Android SDK still
needs to be initialized:

1. Open Android Studio.
2. Open **Settings > Languages & Frameworks > Android SDK**.
3. Install the newest stable SDK Platform, including API 37 for this project.
4. Under **SDK Tools**, install Android SDK Build-Tools, Android SDK Platform-Tools,
   and Android Emulator.
5. Open **Device Manager** and create a **Google TV (1080p)** virtual device using
   the newest stable Google TV system image available.

Android Studio should use its bundled JDK. This project uses Android Gradle Plugin
9.1.1 and Gradle 9.3.1.

## Run against the local web app

The debug build opens `http://10.0.2.2:3000/tv`. Android Emulator reserves
`10.0.2.2` as an alias for the development Mac's localhost.

For the complete local app, start the Vercel development server from the repository
root:

```bash
vercel dev --listen 3000
```

TV pairing also requires the `tv_pairing_requests` migration in the linked
Supabase project. Apply pending migrations before the first pairing test:

```bash
supabase db push
```

In production, the QR code opens `${APP_BASE_URL}/activate-tv`. During local
emulator testing, if that route is not deployed yet, open
`http://localhost:3000/activate-tv` on the development computer and enter the
fallback code shown beside the QR image.

For frontend-only work:

```bash
npm run dev -- --host 0.0.0.0 --port 3000
```

Then:

1. Open `tv-android` as a project in Android Studio.
2. Allow Gradle sync to complete.
3. Select the Google TV virtual device.
4. Run the `app` configuration.

Debug WebView inspection is enabled. Once the app is running, it can be inspected
from desktop Chrome at `chrome://inspect`.

## Run on a physical Google TV device

The emulator instructions above do not transfer unchanged: `10.0.2.2` is an
emulator-only alias for the Mac, and `release` has no signing config, so its APK
cannot be installed. The `sideload` variant exists for this — the production
URL, signed with the debug keystore, and still debuggable so `chrome://inspect`
works during the QA pass below.

```bash
adb connect <tv-ip>:<port>          # or: adb pair <tv-ip>:<pairing-port> first
./gradlew assembleSideload
adb install -r app/build/outputs/apk/sideload/app-sideload.apk
```

Google TV hides sideloaded apps from the main row; launch it from the "Your
apps" list, or with:

```bash
adb shell monkey -p app.moviebowl.tv -c android.intent.category.LEANBACK_LAUNCHER 1
```

To point a physical device at the local web app instead of production, pass the
Mac's LAN address and serve on all interfaces:

```bash
vercel dev --listen 0.0.0.0:3000
./gradlew installDebug -PtvDebugHost=192.168.1.50
```

## Build targets

- Debug: `http://10.0.2.2:3000/tv`, with local cleartext traffic enabled.
  Override the host with `-PtvDebugHost=<lan-ip>` for a physical device.
- Sideload: `https://moviebowl.app/tv`, debug-signed and debuggable, for
  physical-device testing.
- Release: `https://moviebowl.app/tv`, cleartext disabled, unsigned. Store
  signing is deliberately left undone; do not let `sideload` stand in for it.

The URL values live in `app/build.gradle.kts`.

## First QA pass

Verify these behaviors with only the virtual remote:

1. Scan the pairing QR, approve the TV, and confirm the TV continues without a
   page refresh or typed credentials.
2. Reopen the app and confirm the paired WebView session persists.
3. Confirm launch enters the last-opened accessible bowl.
4. Reach every visible control using only the D-pad.
5. Draw once, confirm the animation is uninterrupted, and confirm the result is
   immediately labeled as tonight's pick without another acceptance button.
6. Press Back from the result, current bowl, and picker in sequence.
7. Move a Watch History title back into the bowl.
8. Start a trailer, verify fullscreen playback, and verify return when it ends.
   With theater mode enabled, confirm the preview sequence starts automatically.
9. Open the preferred provider action and confirm an installed app opens. Return
   to Movie Bowl and confirm the drawn result is still present. If the provider
   app is absent, confirm Movie Bowl stays on the result and explains the issue.
10. Background and resume the app; confirm focus and session state recover.
11. Disconnect the emulator network and inspect the failure/recovery experience.

## Provider handoff behavior

Movie Bowl sends the selected title as standard Android search extras while
opening the provider's HTTPS link. Provider apps differ in what they accept, and
what the link itself carries matters more than the extras.

With a *search* URL the extras are the only signal, and they are widely ignored:
Max opened but landed on its empty search screen. With a provider *title* URL —
what `api/provider-links/lookup` caches once Watchmode is configured — the URL
carries the title on its own. Verified August 30, 2026 on an onn Full HD
Streaming Device (Google TV, Android 14): an ACTION_VIEW intent at
`play.max.com/movie/<id>` cold-started Max on that title, extras irrelevant.

So the honest promise depends on which link the handoff got. Without provider
links enabled, open the installed app without promising a populated search
field. With them, expect the title itself, while remembering this is confirmed
for one service — the others need the same check and may differ.

The drawn-result snapshot is kept in WebView session storage for up to 30 minutes
after a provider action. It survives an app handoff and a renderer reload, but is
cleared when the viewer backs out of the result, changes bowls, or starts another
draw.

## Pairing architecture

The TV creates a ten-minute request containing an eight-character user code and
a high-entropy device secret. Only a SHA-256 hash of that secret is stored. An
authenticated browser explicitly approves the user code, after which the TV can
claim a single-use Supabase token hash with its device secret. The token is
verified inside the TV WebView, so browser sessions and refresh tokens are never
copied through the pairing table. Pairing records have RLS enabled and are only
accessible to server code using the service role.

## Scope boundary

This is a validation harness, not yet a store-ready Google TV application. Before
publishing, it needs the pairing rate-limit migration and server secret deployed,
TV-quality review, provider-link capability testing, release signing, artwork,
privacy review, and a physical-device test pass. The `sideload` variant makes
that last one possible; it is not release signing, and it is not a substitute
for it.
