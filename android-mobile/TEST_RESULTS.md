# Gate 0 physical-device results

Status: **failed and closed, September 4, 2026.**

## Environment

| Field | Value |
| --- | --- |
| Date | Initial run September 2, 2026; decision closed September 4, 2026 |
| Phone and Android version | Physical Android phone; exact model/version not recorded |
| Default assistant | Tested with Gemini, then Google Assistant |
| Google app version | Not recorded |
| Assistant/device locale | English (US) |
| Google Play build/version | Internal testing, version code 1 (`0.1.0`) |
| Play listing invocation name | Movie Bowl Voice Probe; Play also displayed the temporary unreviewed package name |
| Signed-in account type | Same Google account enrolled as Play tester and App Actions Development Program member |

## Invocation matrix

Record the exact spoken phrase and exact values displayed by the probe. Use one
row per attempt so intermittent routing stays visible.

| Spoken phrase | App opened? | List name delivered | Movie title delivered | Assistant response / notes |
| --- | --- | --- | --- | --- |
| “Hey Google, add Sinners to my Movie Bowl list.” | No | — | — | Gemini offered supported note/list apps instead |
| “Hey Google, add Sinners to my watch list on Movie Bowl Voice Probe.” | No | — | — | Gemini said it could not interact with external apps or local databases |
| “Hey Google, open Movie Bowl Voice Probe.” | No | — | — | Returned search/results-style responses or said the app must be opened manually |
| Repeated and corrected open/add wording | No | — | — | Neither Gemini nor Google Assistant routed to the installed probe |

## Edge checks

| Check | Result | Notes |
| --- | --- | --- |
| Repeat an invocation while the probe is already open | Not reached | No invocation routed to the probe |
| Switch default assistant from Gemini to Google Assistant | Failed | Search/results behavior remained |
| Open a known app by voice as a control | Passed | Calculator opened successfully |
| Confirm Play distribution | Passed | Tester joined the program, installed the app, and saw the active internal release |
| Confirm App Actions development opt-in | Passed | Membership settings showed an active linked Google Account and “Leave group” |

## Decision

- Gate result: **failed**
- Reliable release phrase(s): none
- Observed title-loss or transcription patterns: not measurable because the
  installed app was never invoked
- External confirmation: App Actions Support stated on September 4, 2026 that
  new/in-development App Actions cannot be approved or pushed to production due
  to broken pipelines and are no longer recommended
- Recommendation: stop App Actions work; do not build the planned TWA/web seam
  or an in-app microphone; revisit only when AppFunctions is generally available
  to third-party apps with a supported end-to-end voice path
