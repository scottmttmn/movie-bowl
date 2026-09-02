import { SUPPORT_EMAIL } from "../lib/appConfig";

const EFFECTIVE_DATE = "September 1, 2026";

export default function VoiceProbePrivacyPage() {
  return (
    <main className="page-container pb-12 pt-8 sm:pb-16 sm:pt-12">
      <article className="panel mx-auto max-w-3xl p-5 text-left sm:p-8">
        <p className="eyebrow text-rose-300">Movie Bowl Voice Probe</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Privacy policy
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Effective date: <time dateTime="2026-09-01">{EFFECTIVE_DATE}</time>
        </p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-slate-300 sm:text-base">
          <section aria-labelledby="scope-heading">
            <h2 id="scope-heading" className="text-xl font-semibold text-slate-100">Scope</h2>
            <p className="mt-2">
              This policy applies to the Movie Bowl Voice Probe Android application. The probe is
              an internal testing app used to validate that an App Action can pass a spoken movie
              title and an optional list name from a compatible assistant to an Android screen.
            </p>
          </section>

          <section aria-labelledby="data-heading">
            <h2 id="data-heading" className="text-xl font-semibold text-slate-100">
              Data collection and use
            </h2>
            <p className="mt-2">
              The developer does not collect, transmit, sell, or share personal information through
              the Voice Probe. The app has no account sign-in, analytics, advertising, network
              requests, or runtime permission requests.
            </p>
            <p className="mt-3">
              When an App Action launches the probe, Android may provide the recognized movie title
              and optional list name to the app. The probe displays those values on the device only
              so the tester can verify the handoff. It does not send them to the developer or any
              developer-operated service.
            </p>
          </section>

          <section aria-labelledby="voice-heading">
            <h2 id="voice-heading" className="text-xl font-semibold text-slate-100">
              Voice processing
            </h2>
            <p className="mt-2">
              The Voice Probe does not access the microphone or record audio. Voice recognition and
              assistant processing occur outside the app through the assistant and Android services
              selected on the tester&apos;s device. Those services operate under their own privacy
              policies and account settings.
            </p>
          </section>

          <section aria-labelledby="retention-heading">
            <h2 id="retention-heading" className="text-xl font-semibold text-slate-100">
              Storage and retention
            </h2>
            <p className="mt-2">
              The probe does not write App Action values to local storage or a remote server. Values
              are held only for the current Android screen and are discarded when the app process is
              cleared.
            </p>
          </section>

          <section aria-labelledby="children-heading">
            <h2 id="children-heading" className="text-xl font-semibold text-slate-100">
              Children&apos;s privacy
            </h2>
            <p className="mt-2">
              The Voice Probe is a developer test utility, is not directed to children, and does not
              knowingly collect personal information from children.
            </p>
          </section>

          <section aria-labelledby="changes-heading">
            <h2 id="changes-heading" className="text-xl font-semibold text-slate-100">
              Changes to this policy
            </h2>
            <p className="mt-2">
              If the probe&apos;s data practices change, this policy will be updated before the changed
              version is distributed.
            </p>
          </section>

          <section aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="text-xl font-semibold text-slate-100">Contact</h2>
            <p className="mt-2">
              Questions about this policy can be sent to{" "}
              <a
                className="text-rose-300 underline decoration-rose-900 underline-offset-4 hover:text-rose-200"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
