import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PendingInviteList from "../components/PendingInviteList";
import usePendingInvites from "../hooks/usePendingInvites";

export default function InvitesPage() {
  const navigate = useNavigate();
  const { invites, isLoading, acceptInvite, declineInvite } = usePendingInvites();
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const inviteCountLabel = `${invites.length} pending invite${invites.length === 1 ? "" : "s"}`;

  const handleAccept = async (invite) => {
    setActionMessage(null);
    setErrorMessage(null);

    const { error } = await acceptInvite(invite);
    if (error) {
      setErrorMessage(error);
      return;
    }

    navigate(`/bowl/${invite.bowl_id}`);
  };

  const handleDecline = async (invite) => {
    setActionMessage(null);
    setErrorMessage(null);

    const { error } = await declineInvite(invite);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setActionMessage("Invite declined.");
  };

  return (
    <div className="invites-screen page-container py-6 sm:py-8">
      <header className="mb-8">
        <div className="mb-4 space-y-2" aria-live="polite">
          {errorMessage && <div className="status-error">{errorMessage}</div>}
          {actionMessage && <div className="status-success">{actionMessage}</div>}
        </div>
        <div className="page-hero">
          <p className="eyebrow">Invites</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            Bowl invites
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400 sm:text-base">
            {isLoading
              ? "Checking for invites…"
              : `${inviteCountLabel} waiting for your response.`}
          </p>
        </div>
      </header>

      <div className="section-stack">
        {isLoading ? (
          <div className="panel text-sm text-slate-400" role="status">
            Loading invites…
          </div>
        ) : invites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 p-6 text-sm text-slate-400">
            You have no pending invites.
          </div>
        ) : (
          <PendingInviteList
            invites={invites}
            onAccept={handleAccept}
            onDecline={handleDecline}
            showHeading={false}
          />
        )}
      </div>
    </div>
  );
}
