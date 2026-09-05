# Private Google TV distribution roadmap

Status: planned on September 4, 2026

## Decision

Distribute Movie Bowl through Google Play's **internal testing** track rather
than Production. This makes installation and updates behave like a normal Play
Store app while limiting access to an explicit list of at most 100 Google
accounts. The app does not need a worldwide or public release.

Internal testing is the destination for this roadmap, not merely a temporary
step. A closed test is an optional later move if the group outgrows the internal
list or if production eligibility becomes desirable. For a new personal Play
Console account, only a qualifying closed test counts toward production access;
an internal test does not.

Official references:

- [Set up an internal test](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)
- [Distribute to Android TV](https://developer.android.com/training/tv/publishing/distribute)
- [TV app quality](https://developer.android.com/develop/adaptive-apps/quality-guidelines/tv-app-quality)
- [Sign an Android app](https://developer.android.com/studio/publish/app-signing)

## Goal and boundaries

The first successful release is a private Play-installed build on the owner's
physical Google TV followed by a small friends-and-family cohort. It must:

- install from Google Play without ADB;
- remain unavailable to accounts that were not invited;
- pair through the existing QR flow without typing credentials on the TV;
- survive restart, update, provider handoff, and temporary network loss; and
- receive subsequent builds through ordinary Play Store updates.

This roadmap does not include a public Production release, monetization, a
mobile Android app, Fire TV, Roku, tvOS, Samsung Tizen, or LG webOS. The signing
decision below should nevertheless avoid closing off a later Fire TV port.

## Starting point

The repo is past the prototype-only stage but is not yet store-ready:

- `src/tv` contains the product experience and the deployed entry point is
  `https://moviebowl.app/tv`.
- `tv-android` is a thin Java/WebView shell with D-pad, Back, fullscreen video,
  persistent session, QR pairing, and provider-app handoff.
- The manifest already declares Leanback, no required touchscreen, landscape
  orientation, a launcher icon, and a TV banner.
- The production package is `app.moviebowl.tv`, with `minSdk 26` and
  `targetSdk 35`. Those SDK values meet the current TV baseline.
- The physical-device sideload flow has been exercised on an onn. Google TV
  device, including a confirmed Max title handoff.
- `release` is deliberately unsigned. The existing `sideload` build is
  debug-signed and must never be uploaded as the store release.
- The current banner is a vector declared as 320 by 180 dp. Store readiness
  requires a deliberate 320 by 180 pixel TV banner, plus Play listing artwork
  and at least one unaltered high-resolution TV screenshot.
- Pairing abuse-rate limiting, full provider testing, privacy review, and the
  final physical-TV QA pass remain open.

## One-way decisions before the first upload

These happen before creating the first Play artifact because undoing them later
is difficult or impossible.

### 1. Keep the package identity

Use `app.moviebowl.tv` unless there is a concrete reason to merge a future
mobile app into the same Play listing. Google fixes the package identity after
the first artifact upload. The abandoned voice-capture probe uses a different
package and does not conflict.

The production package has already been installed on a certified TV using the
local Android debug key. Google's 2026 package-registration flow may therefore
ask for proof of prior ownership. The debug keystore and the known sideload APK
are currently present on this development Mac. Preserve both until Play Console
shows the package as registered to this developer account. The debug key is
evidence only; it is not the release key.

### 2. Choose the signing strategy

All new Play apps use Play App Signing, and the uploaded AAB must be signed with
an upload key.

There are two reasonable choices:

- **Google-only simplicity:** let Google generate and retain the app-signing
  key; keep a separate local upload key.
- **Future Android-store portability:** create and securely back up a long-lived
  app-signing key, provide it to Play App Signing, and use a different upload
  key for routine uploads. This is the better choice if publishing the Android
  shell in the Amazon Appstore later is plausible.

Make this choice in Play Console before the first release. No keystore,
password, or credential belongs in Git. Store two encrypted backups in
different places and record a recovery owner.

### 3. Keep the app free

The internal cohort does not need billing. Create Movie Bowl as a free app and
do not add purchases, subscriptions, or advertising to this release path.

## Milestone 1: production-service preflight

Owner: repo work, deployment, and Supabase configuration

1. Deploy the changes currently marked "implemented, pending release" and run
   the phone and TV smoke checks against production.
2. Confirm the production environment has the TV pairing migration and every
   required server secret.
3. Add server-side abuse controls to pairing creation and approval. At minimum,
   bound attempts by IP/device window, retain the existing short expiry and
   single-use claim, and return non-enumerating failures.
4. Verify that a new TV can pair, that an existing paired TV resumes, and that
   an expired pairing cannot be claimed.
5. Decide what operational evidence is retained for failures without logging
   pairing secrets, tokens, or a user's private bowl contents.

Exit gate: a fresh sideload installation can complete the entire production
flow without local services, dashboard intervention, or exposed credentials.

## Milestone 2: store-harden the Android shell

Owner: repo work

1. Add release signing configuration that reads paths and passwords from the
   developer environment, with no secret defaults and no checked-in values.
2. Keep `debug`, `sideload`, and `release` visibly distinct. Confirm that
   `release` is non-debuggable, rejects cleartext traffic, and opens only the
   production `/tv` URL.
3. Establish versioning: increment `versionCode` for every Play upload and use a
   user-readable `versionName` for support reports.
4. Replace the placeholder launcher assets with final assets that satisfy the
   TV launcher sizes, including a 320 by 180 pixel banner containing the Movie
   Bowl name and at least a 160 by 160 pixel xhdpi icon.
5. Capture at least one clean 1920 by 1080 screenshot from the current TV
   experience. Prefer a small set covering pairing, bowl selection, and a draw
   result without exposing real account information.
6. Audit the Tier 3 TV Ready checklist: five-way D-pad reachability, visible
   focus, Back eventually reaching the TV home screen, no clipped overscan
   content, readable ten-foot typography, restart/resume behavior, and no
   dependency on touch or a browser app.
7. Verify the AAB contains no incompatible native libraries. The shell is Java
   and currently declares none, so the 64-bit and 16 KB-page requirements should
   be a verification item rather than a porting project.
8. Exercise low-memory process recreation and WebView renderer recovery on a
   physical TV.

Exit gate: release lint/build checks pass, the signed release bundle contains
the expected package/version/production URL, and every mandatory TV Ready item
has a recorded pass or an explicit fix.

## Milestone 3: create the Play Console app

Owner: account owner, with the repo artifacts prepared in advance

1. Finish the account's identity and physical-Android-device verification tasks
   shown on the Play Console home page.
2. Create **Movie Bowl** as a free app using package `app.moviebowl.tv`.
3. Resolve any package-ownership prompt using the preserved debug-key evidence;
   do not solve it by publishing a debug-signed bundle.
4. Enroll in Play App Signing using the signing strategy chosen above.
5. Add a support email and a minimal accurate store listing. Mention Android TV
   and upload the TV banner, icon, and screenshots.
6. In **Setup > Advanced settings > Form factors**, add Android TV and accept
   its review policy.
7. Prepare App Access instructions that explain the QR pairing flow. If Google
   requests full review access, supply a purpose-made reviewer account or an
   equally reproducible path; never supply a personal account.
8. Keep the app exclusively on Internal testing. Internal-only apps are
   currently exempt from the Data safety form, but draft an accurate general
   Movie Bowl privacy policy now so a later closed test is not blocked. The old
   voice-probe privacy page is not an adequate policy for the TV product.

Exit gate: Play Console recognizes the bundle as TV-compatible and exposes an
internal-test opt-in URL without activating Open testing or Production.

## Milestone 4: owner-only Play pilot

Owner: account owner

1. Add only the owner's Google account to the internal tester list.
2. Open the opt-in link using the same Google account used on the physical TV.
3. Install the app from Google Play rather than ADB. If installation is
   initiated on the web, select the TV in Google's device picker.
4. Repeat the complete TV QA pass from `tv-android/README.md`.
5. Upload a second bundle with an incremented `versionCode` and a harmless,
   visible version change. Confirm the TV receives the update through Play and
   retains its paired session.
6. Inspect Play's generated device artifacts and confirm that the physical test
   TV is supported rather than excluded.

Exit gate: both clean installation and in-place update work through Play, with
no ADB use and no regression in pairing or saved state.

## Milestone 5: friends-and-family rollout

Owner: account owner and invited testers

1. Start with two or three trusted households on different Google TV/Android TV
   hardware before adding the rest of the group.
2. Add the Google account each person actually uses on the television, then send
   the opt-in link and a short installation guide. The app will not be found by
   an ordinary Play search before opt-in.
3. Give testers a private feedback address and ask for device model, Android TV
   version, the screen they were on, and what the remote did. Do not ask them to
   share bowl contents or authentication links.
4. Validate pairing, D-pad focus, Back, provider handoff, trailers, app restart,
   and automatic updates on each distinct hardware family.
5. Roll out subsequent AABs to the internal track only after the owner's TV has
   passed the update smoke test.
6. Keep a small compatibility record in the repo: device, OS version, pass date,
   known limitations, and provider handoffs actually confirmed on that device.

Exit gate: the intended small cohort can install and update independently, and
no unresolved issue risks account access, destructive bowl actions, or trapping
the viewer without a working Back path.

## Ongoing release rhythm

For every internal release:

1. Deploy and smoke-test the web application first when the release depends on
   web changes.
2. Increment `versionCode`.
3. Build, lint, and inspect the signed release AAB.
4. Test the build on the owner's TV through the Play track.
5. Add concise release notes and roll it out to the tester list.
6. Retain the previous known-good bundle and its version metadata for diagnosis;
   rollback means issuing a new, higher-version build containing the known-good
   code, not lowering `versionCode`.

Because most product code is hosted at `/tv`, web changes can reach the shell
without a new Android upload. Treat that as operational power, not permission to
bypass release discipline: changes affecting pairing, navigation, playback, or
provider launch still receive the physical-TV smoke pass before friends use
them.

## Optional later branches

### Closed testing

Move to a closed track only if a Google Group becomes easier than the internal
email list, the cohort needs formal private feedback through Play, or production
access becomes a real goal. A newly created personal account must currently run
a closed test with at least 12 opted-in testers continuously for 14 days before
it can apply for Production. There is no reason to do this merely to maintain a
private friends-and-family app.

### Limited public production

Country-limited Production is public within the selected countries; it is not a
friends-only control. Do not use it to solve private distribution.

### Other TV platforms

Fire TV is the nearest follow-on because it can reuse much of the Android shell,
but it requires a separate Amazon Appstore release and device/provider testing.
Samsung Tizen and LG webOS can reuse the hosted React experience inside their
own web-app packages. Roku and tvOS require substantially different shells. None
of these are prerequisites for the private Google TV rollout.

## Recommended execution order

1. Preserve package-ownership evidence and choose the signing strategy.
2. Finish production-service safeguards.
3. Make the Android release artifact and TV assets store-ready.
4. Complete the physical-TV release QA pass.
5. Create the Play app and upload to Internal testing.
6. Prove install and update on the owner's TV.
7. Expand gradually to friends' devices.

The first irreversible action is the first Play artifact upload. Everything
before it should be treated as a reversible preparation or a decision gate.
