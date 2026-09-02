import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import CopyButton from "../components/CopyButton";
import CreateBowlModal from "../components/CreateBowlModal";
import useAuth from "../hooks/useAuth";
import useCreateBowl from "../hooks/useCreateBowl";
import usePendingInvites from "../hooks/usePendingInvites";
import useSentInvitations from "../hooks/useSentInvitations";
import useUserBowls from "../hooks/useUserBowls";
import { formatRelativeDateLabel } from "../utils/formatRelativeDate";
import { parseInviteEmails } from "../utils/parseInviteEmails";

// The hub keeps received and sent invitations in separate language and separate
// sections. They are different jobs: one is a decision someone owes you, the
// other is bookkeeping on what you asked of other people.
export default function InvitesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const { session } = useAuth();
  const accountEmail = session?.user?.email || "";
  const {
    bowls,
    loading: isBowlsLoading,
    error: bowlsError,
    refresh: refreshBowls,
  } = useUserBowls();
  // Until the context resolves, ownership is unknown -- which is not the same as
  // owning nothing. Deciding otherwise would offer Create to an owner already at
  // the limit, because the client-side guard counts the bowls it can see.
  const isOwnershipKnown = !isBowlsLoading && !bowlsError;
  const ownedBowls = useMemo(() => bowls.filter((bowl) => bowl.role === "Owner"), [bowls]);
  const {
    invites: received,
    isLoading: isReceivedLoading,
    error: receivedLoadError,
    reloadInvites,
    acceptInvite,
    declineInvite,
  } = usePendingInvites();
  const sent = useSentInvitations(ownedBowls);

  const [bowlChoice, setBowlChoice] = useState(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [formError, setFormError] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [receivedError, setReceivedError] = useState(null);
  const [receivedMessage, setReceivedMessage] = useState(null);
  const [sentMessage, setSentMessage] = useState(null);
  const [sentError, setSentError] = useState(null);
  const [pendingAccept, setPendingAccept] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const inviteHeadingRef = useRef(null);
  const sentGroupRefs = useRef(new Map());
  const handledShortcut = useRef(null);
  const resultRef = useRef(null);

  const ownedBowlCount = ownedBowls.length;
  const createBowl = useCreateBowl({ ownedBowlCount, refresh: refreshBowls });

  // A bowl id from Bowl Settings is a hint, not an authorization: honour it only
  // while the caller still owns that bowl.
  const requestedBowlId = searchParams.get("bowl");
  const isRequestedBowlOwned = Boolean(requestedBowlId)
    && ownedBowls.some((bowl) => bowl.id === requestedBowlId);
  const selectedBowlId = useMemo(() => {
    // An explicit choice wins, including clearing back to no selection.
    if (bowlChoice !== null) {
      return ownedBowls.some((bowl) => bowl.id === bowlChoice) ? bowlChoice : "";
    }
    if (isRequestedBowlOwned) return requestedBowlId;
    // One owned bowl has no ambiguity. Several do, and an invitation grants
    // durable membership, so never guess between them.
    return ownedBowls.length === 1 ? ownedBowls[0].id : "";
  }, [bowlChoice, isRequestedBowlOwned, requestedBowlId, ownedBowls]);

  const groupedSent = useMemo(() => {
    const byBowl = new Map();
    sent.invitations.forEach((invitation) => {
      if (!byBowl.has(invitation.bowl_id)) byBowl.set(invitation.bowl_id, []);
      byBowl.get(invitation.bowl_id).push(invitation);
    });
    return ownedBowls
      .filter((bowl) => byBowl.has(bowl.id))
      .map((bowl) => ({ bowl, rows: byBowl.get(bowl.id) }));
  }, [sent.invitations, ownedBowls]);

  // Bowl Settings links to #invite-people to send and #sent to manage what it
  // already sent. Landing both on the form sends half of them to the wrong job.
  useEffect(() => {
    if (!isRequestedBowlOwned) return;
    const target = `${hash}:${requestedBowlId}`;
    if (handledShortcut.current === target) return;
    if (hash !== "#sent") {
      handledShortcut.current = target;
      inviteHeadingRef.current?.focus();
      return;
    }
    // Wait for the group to exist: the shortcut points at one bowl's records,
    // and the section heading is not where those records are.
    const group = sentGroupRefs.current.get(requestedBowlId);
    if (!group) return;
    handledShortcut.current = target;
    group.focus();
  }, [isRequestedBowlOwned, hash, requestedBowlId, groupedSent]);

  // Foreground refresh lives in the provider, because the badge is app-wide.
  // This is the entry read: routing here does not raise a focus event.
  useEffect(() => {
    void Promise.resolve().then(() => reloadInvites());
  }, [reloadInvites]);

  const parsed = parseInviteEmails(emailDraft);
  const sendLabel = parsed.validEmails.length > 1
    ? `Send ${parsed.validEmails.length} invitations`
    : "Send invitation";

  const handleAccept = async (invite) => {
    setReceivedError(null);
    setReceivedMessage(null);
    setPendingAccept(invite.id);
    const { error } = await acceptInvite(invite);
    setPendingAccept(null);
    if (error) {
      setReceivedError(error);
      return;
    }
    navigate(`/bowl/${invite.bowl_id}`);
  };

  const handleDecline = async () => {
    setIsConfirming(true);
    const { error } = await declineInvite(declineTarget);
    setIsConfirming(false);
    if (error) {
      setReceivedError(error);
      setDeclineTarget(null);
      return;
    }
    setReceivedError(null);
    setReceivedMessage(`Invitation to ${declineTarget?.bowl_name || "that bowl"} declined.`);
    setDeclineTarget(null);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    setFormError(null);
    setResultMessage(null);
    if (!selectedBowlId) {
      setFormError("Choose a bowl to invite people to.");
      return;
    }
    if (parsed.invalidEmails.length > 0) {
      setFormError(`Invalid email(s): ${parsed.invalidEmails.join(", ")}`);
      return;
    }
    if (parsed.validEmails.length === 0) {
      setFormError("Enter at least one email address.");
      return;
    }
    const bowl = ownedBowls.find((entry) => entry.id === selectedBowlId);
    const result = await sent.send({
      bowlId: selectedBowlId,
      bowlName: bowl?.name || "your bowl",
      emails: parsed.validEmails,
      senderEmail: accountEmail,
    });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setEmailDraft("");
    setResultMessage(result.message);
    resultRef.current?.focus();
  };

  const handleRevoke = async () => {
    setIsConfirming(true);
    setSentError(null);
    const result = await sent.revoke(revokeTarget);
    setIsConfirming(false);
    if (!result.ok) {
      // Keep the dialog open: the row is still there and still revocable.
      setSentError(result.message);
      return;
    }
    setRevokeTarget(null);
    setSentMessage(result.message);
  };

  return (
    <div className="invites-screen page-container py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Invitations</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400 sm:text-base">
          Join a bowl or invite people to one you own.
        </p>
      </header>

      <div className="flex flex-col gap-6 min-[900px]:flex-row min-[900px]:items-start">
        <div className="section-stack min-w-0 flex-1">
          <section className="panel" aria-labelledby="received-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="received-heading" className="section-title">Received invitations</h2>
              {received.length > 0 && (
                <span className="text-sm text-slate-400">{received.length} pending</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {accountEmail ? `Invitations sent to ${accountEmail}.` : "Invitations sent to your account."}
            </p>
            {receivedError && <p className="status-error mt-3" role="alert">{receivedError}</p>}
            {receivedMessage && <p className="status-success mt-3" role="status">{receivedMessage}</p>}
            {receivedLoadError && (
              <div className="mt-3">
                <p className="status-error" role="alert">{receivedLoadError}</p>
                <button type="button" className="btn btn-secondary mt-2" onClick={() => { void reloadInvites(); }}>
                  Try again
                </button>
              </div>
            )}

            {isReceivedLoading && received.length === 0 ? (
              <p className="panel mt-3 text-sm text-slate-400" role="status">Checking for invitations…</p>
            ) : received.length === 0 && !receivedLoadError ? (
              <p className="mt-3 text-sm text-slate-500">Nothing waiting for you right now.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {received.map((invite) => (
                  <article key={invite.id} className="surface-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-100">
                          {invite.bowl_name || "Movie Bowl Invite"}
                        </h3>
                        {invite.invited_by_email && (
                          <p className="mt-1 truncate text-sm text-slate-400">
                            Invited by {invite.invited_by_email}
                          </p>
                        )}
                      </div>
                      {invite.created_at && (
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatRelativeDateLabel(invite.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={pendingAccept === invite.id}
                        aria-label={`Accept invitation to ${invite.bowl_name || "this bowl"}`}
                        onClick={() => { void handleAccept(invite); }}
                      >
                        {pendingAccept === invite.id ? "Joining…" : "Accept invitation"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={pendingAccept === invite.id}
                        aria-label={`Decline invitation to ${invite.bowl_name || "this bowl"}`}
                        onClick={() => setDeclineTarget(invite)}
                      >
                        Decline
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="sent-heading" id="sent">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="sent-heading" className="section-title">Pending invitations sent</h2>
              {sent.invitations.length > 0 && (
                <span className="text-sm text-slate-400">{sent.invitations.length} pending</span>
              )}
            </div>
            {sentMessage && <p className="status-success mt-3" role="status">{sentMessage}</p>}
            {sent.loadError && (
              <div className="mt-3">
                <p className="status-error" role="alert">{sent.loadError}</p>
                <button type="button" className="btn btn-secondary mt-2" onClick={() => { void sent.refresh(); }}>
                  Try again
                </button>
              </div>
            )}
            {!isOwnershipKnown ? (
              // Unknown ownership is not "you have sent nothing". The send panel
              // owns the alert and the retry for this same failure, so this is a
              // plain line rather than a second alert for one problem.
              <p className="panel mt-3 text-sm text-slate-400" role="status">
                {bowlsError
                  ? "Your bowls could not be loaded, so this list is unavailable."
                  : "Loading sent invitations…"}
              </p>
            ) : ownedBowlCount === 0 ? null : sent.isLoading && sent.invitations.length === 0 ? (
              <p className="panel mt-3 text-sm text-slate-400" role="status">Loading sent invitations…</p>
            ) : sent.invitations.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Invitations you send stay here until someone accepts.
              </p>
            ) : (
              <div className="mt-3 space-y-5">
                {groupedSent.map(({ bowl, rows }) => (
                  <div
                    key={bowl.id}
                    className={hash === "#sent" && bowl.id === requestedBowlId
                      ? "rounded-2xl ring-1 ring-rose-800/70"
                      : undefined}
                  >
                    <h3
                      tabIndex={-1}
                      ref={(node) => {
                        if (node) sentGroupRefs.current.set(bowl.id, node);
                        else sentGroupRefs.current.delete(bowl.id);
                      }}
                      className="text-sm font-semibold text-slate-200"
                    >
                      {bowl.name}
                    </h3>
                    <div className="mt-2 space-y-2">
                      {rows.map((row) => (
                        <div key={row.id} className="surface-card flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-100" title={row.invited_email}>
                              {row.invited_email}
                            </p>
                            {row.created_at && (
                              <p className="text-xs text-slate-400">{formatRelativeDateLabel(row.created_at)}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <CopyButton
                              value={`${window.location.origin}/accept-invite/${row.token}`}
                              label="Copy link"
                              ariaLabel={`Copy invitation link for ${row.invited_email}`}
                              onCopied={() => setSentMessage(`Invitation link copied for ${row.invited_email}.`)}
                            />
                            <button
                              type="button"
                              className="btn btn-danger px-3 py-1.5 text-sm"
                              aria-label={`Revoke invitation for ${row.invited_email}`}
                              onClick={() => setRevokeTarget({
                                bowlId: bowl.id,
                                bowlName: bowl.name,
                                invitationId: row.id,
                                invitedEmail: row.invited_email,
                              })}
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section
          aria-labelledby="invite-people-heading"
          id="invite-people"
          className="panel w-full min-[900px]:sticky min-[900px]:top-24 min-[900px]:w-[22rem] min-[900px]:shrink-0"
        >
          <h2 id="invite-people-heading" ref={inviteHeadingRef} tabIndex={-1} className="section-title">
            Invite people
          </h2>
          {!isOwnershipKnown ? (
            <>
              {bowlsError ? (
                <p className="status-error mt-1" role="alert">Could not load your bowls.</p>
              ) : (
                <p className="mt-1 text-sm text-slate-400" role="status">Loading your bowls…</p>
              )}
              {bowlsError && (
                <button type="button" className="btn btn-secondary mt-3" onClick={() => { void refreshBowls({ force: true }); }}>
                  Try again
                </button>
              )}
            </>
          ) : ownedBowlCount === 0 ? (
            <>
              <p className="mt-1 text-sm text-slate-400">
                You can join shared bowls, but only an owner can invite new members.
              </p>
              <button type="button" className="btn btn-primary mt-4" onClick={createBowl.open}>
                Create a bowl
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-400">
                They&apos;ll get an email and join once they accept.
              </p>
              <form onSubmit={handleSend} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="invite-bowl" className="mb-1 block text-sm text-slate-300">Bowl</label>
                  <select
                    id="invite-bowl"
                    className="input-field"
                    value={selectedBowlId}
                    disabled={sent.isSending}
                    onChange={(event) => setBowlChoice(event.target.value)}
                  >
                    <option value="">Choose a bowl</option>
                    {ownedBowls.map((bowl) => (
                      <option key={bowl.id} value={bowl.id}>{bowl.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="invite-emails" className="mb-1 block text-sm text-slate-300">Email addresses</label>
                  <textarea
                    id="invite-emails"
                    className="input-field min-h-20"
                    placeholder="friend@example.com, family@example.com"
                    value={emailDraft}
                    disabled={sent.isSending}
                    onChange={(event) => setEmailDraft(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Separate multiple addresses with commas, spaces, or new lines.
                  </p>
                </div>
                {formError && <p className="status-error" role="alert">{formError}</p>}
                <p ref={resultRef} tabIndex={-1} role="status" className={resultMessage ? "status-success" : "sr-only"}>
                  {resultMessage || ""}
                </p>
                <button type="submit" className="btn btn-primary w-full" disabled={sent.isSending}>
                  {sent.isSending ? "Sending…" : sendLabel}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(declineTarget)}
        title={`Decline the invitation to ${declineTarget?.bowl_name || "this bowl"}?`}
        keepLabel="Keep invitation"
        confirmLabel="Decline invitation"
        isBusy={isConfirming}
        onKeep={() => setDeclineTarget(null)}
        onConfirm={() => { void handleDecline(); }}
      />
      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        title={`Revoke ${revokeTarget?.invitedEmail}'s invitation to ${revokeTarget?.bowlName}?`}
        body="Their existing link will stop working."
        keepLabel="Keep invitation"
        confirmLabel="Revoke invitation"
        isBusy={isConfirming}
        errorMessage={sentError}
        onKeep={() => { setSentError(null); setRevokeTarget(null); }}
        onConfirm={() => { void handleRevoke(); }}
      />
      <CreateBowlModal
        isOpen={createBowl.isOpen}
        bowlName={createBowl.bowlName}
        inviteEmails={createBowl.inviteEmails}
        onChangeBowlName={createBowl.setBowlName}
        onChangeInviteEmails={createBowl.setInviteEmails}
        onCreate={() => { void createBowl.create(); }}
        onClose={createBowl.close}
        isCreating={createBowl.isCreating}
        errorMessage={createBowl.errorMessage}
      />
    </div>
  );
}
