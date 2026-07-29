import { formatRelativeDateLabel } from "../utils/formatRelativeDate";

// Shared invite inbox rendering so My Bowls and the dedicated invites page stay
// in sync. Callers own the accept/decline side effects and status messaging.
export default function PendingInviteList({
  invites,
  onAccept,
  onDecline,
  showHeading = true,
}) {
  if (invites.length === 0) return null;

  const inviteCountLabel = `${invites.length} pending invite${invites.length === 1 ? "" : "s"}`;

  return (
    <section className="space-y-3">
      {showHeading && (
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-slate-100">Invites</h3>
          <p className="text-sm text-slate-400">{inviteCountLabel} waiting for your response.</p>
        </div>
      )}
      <div className="space-y-3">
        {invites.map((invite) => (
          <article key={invite.id} className="surface-card p-4 transition hover:border-slate-600">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-slate-100">
                  {invite.bowl_name || "Movie Bowl Invite"}
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  Invited
                  {invite.invited_by_email ? ` by ${invite.invited_by_email}` : ""}
                  {invite.created_at
                    ? ` • ${formatRelativeDateLabel(invite.created_at)}`
                    : ""}.
                </p>
              </div>
              {invite.created_at ? (
                <span className="inline-flex rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-400">
                  {formatRelativeDateLabel(invite.created_at)}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  void onAccept(invite);
                }}
              >
                Accept
              </button>
              <button
                type="button"
                className="btn border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800/60"
                onClick={() => {
                  void onDecline(invite);
                }}
              >
                Decline
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
