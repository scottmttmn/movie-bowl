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
  // Addresses become chips as soon as a separator follows them, so a bad one is
  // visible while it is still easy to fix rather than after Send.
  const [emailChips, setEmailChips] = useState([]);
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
  const emailInputRef = useRef(null);

  const ownedBowlCount = ownedBowls.length;
  const createBowl = useCreateBowl({ ownedBowlCount, refresh: refreshBowls });

  // A bowl id from Bowl Settings is a hint, not an authorization: honour it only
  // while the caller still owns that bowl.
  const requestedBowlId = searchParams.get("bowl");
  const isRequestedBowlOwned = Boolean(requestedBowlId)
    && ownedBowls.some((bowl) => bowl.id === requestedBowlId);
  const selectedBowlId = useMemo(() => {
    // An explicit choice wins while that bowl is still owned.
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

  // The chips and the unfinished draft are one list as far as sending goes:
  // nobody should have to press Enter on the last address before Send counts it.
  const parsed = parseInviteEmails([...emailChips, emailDraft].join(" "));
  const invalidEmailSet = new Set(parsed.invalidEmails);
  const invalidChipCount = emailChips.filter((email) => invalidEmailSet.has(email)).length;
  const selectedBowl = ownedBowls.find((bowl) => bowl.id === selectedBowlId) || null;

  const commitEmails = (pieces) => {
    const next = pieces.map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (next.length === 0) return;
    setEmailChips((current) => [...new Set([...current, ...next])]);
  };

  const handleEmailChange = (value) => {
    // Typing a separator or pasting a list commits everything before the last
    // separator; whatever follows it is still being typed.
    const pieces = value.split(/[\s,]+/);
    if (pieces.length === 1) {
      setEmailDraft(value);
      return;
    }
    commitEmails(pieces.slice(0, -1));
    setEmailDraft(pieces[pieces.length - 1]);
  };

  const handleEmailKeyDown = (event) => {
    if (event.key === "Enter" && emailDraft.trim()) {
      event.preventDefault();
      commitEmails([emailDraft]);
      setEmailDraft("");
      return;
    }
    if (event.key === "Backspace" && emailDraft === "" && emailChips.length > 0) {
      event.preventDefault();
      setEmailChips((current) => current.slice(0, -1));
    }
  };

  const removeEmailChip = (email) => {
    setEmailChips((current) => current.filter((entry) => entry !== email));
    emailInputRef.current?.focus();
  };
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
    setEmailChips([]);
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
      {/* One column, in the order the jobs come up: something waiting on you,
          then sending, then the bookkeeping on what you already sent. */}
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Invitations</h1>
          <p className="mt-2 text-sm text-slate-400 sm:text-base">
            Join a bowl or invite people to one you own.
          </p>
        </header>

        <section aria-labelledby="received-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="received-heading" className="section-title">Invitations for you</h2>
            {received.length > 0 && (
              <span className="text-sm text-slate-400">{received.length} waiting</span>
            )}
          </div>
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
            <p className="mt-1 text-sm text-slate-400" role="status">Checking for invitations…</p>
          ) : received.length === 0 && !receivedLoadError ? (
            // Naming the address answers "why isn't my invitation here?" -- it
            // went to a different email -- without a panel full of nothing.
            <p className="mt-1 text-sm text-slate-500">
              {accountEmail
                ? `Nothing waiting for ${accountEmail} right now.`
                : "Nothing waiting for you right now."}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {received.map((invite) => {
                const bowlName = invite.bowl_name || "Movie Bowl Invite";
                const sentLabel = formatRelativeDateLabel(invite.created_at);
                return (
                  <article key={invite.id} className="invite-ticket" aria-labelledby={`invite-${invite.id}-title`}>
                    <div className="min-w-0 space-y-3 p-5">
                      <p className="eyebrow text-rose-300">You&apos;re invited</p>
                      <h3
                        id={`invite-${invite.id}-title`}
                        className="break-words text-2xl font-bold tracking-tight text-slate-50"
                      >
                        {bowlName}
                      </h3>
                      {(invite.invited_by_name || sentLabel) && (
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-rose-100/80">
                          {invite.invited_by_name && (
                            <span className="min-w-0 break-words">Invited by {invite.invited_by_name}</span>
                          )}
                          {sentLabel && <span>{sentLabel}</span>}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={pendingAccept === invite.id}
                          aria-label={`Accept invitation to ${invite.bowl_name || "this bowl"}`}
                          onClick={() => { void handleAccept(invite); }}
                        >
                          {pendingAccept === invite.id ? "Joining…" : "Join bowl"}
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
                    </div>
                    <div className="invite-ticket-stub" aria-hidden="true">
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-rose-300">Admit</span>
                      <span className="text-3xl font-extrabold leading-none text-white">1</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="invite-people-heading" id="invite-people" className="panel sm:p-6">
          <h2 id="invite-people-heading" ref={inviteHeadingRef} tabIndex={-1} className="section-title">
            Invite people
          </h2>
          {!isOwnershipKnown ? (
            <>
              {bowlsError ? (
                <p className="status-error mt-2" role="alert">Could not load your bowls.</p>
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
            <form onSubmit={handleSend} className="mt-4 space-y-5">
              <fieldset disabled={sent.isSending}>
                <legend className="mb-2 text-sm font-medium text-slate-300">Invite to</legend>
                <div className="flex flex-wrap gap-2">
                  {ownedBowls.map((bowl) => (
                    <label key={bowl.id} className="choice-pill">
                      <input
                        type="radio"
                        name="invite-bowl"
                        className="sr-only"
                        value={bowl.id}
                        checked={selectedBowlId === bowl.id}
                        onChange={() => setBowlChoice(bowl.id)}
                      />
                      <span className="min-w-0 break-words">{bowl.name}</span>
                      {bowl.memberCount > 0 && (
                        <span className="text-xs font-medium text-slate-500">
                          {bowl.memberCount} {bowl.memberCount === 1 ? "member" : "members"}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="invite-emails" className="mb-2 block text-sm font-medium text-slate-300">
                  Email addresses
                </label>
                {/* The field is the box, not the input inside it: a click on
                    the space between chips should still start typing. */}
                <div
                  className="input-field flex flex-wrap items-center gap-1.5 focus-within:border-rose-500"
                  onClick={() => emailInputRef.current?.focus()}
                >
                  {emailChips.map((email) => {
                    const isInvalid = invalidEmailSet.has(email);
                    return (
                      <span key={email} className={`email-chip${isInvalid ? " email-chip-invalid" : ""}`}>
                        <span className="truncate">{email}</span>
                        {isInvalid && <span className="sr-only"> (not a valid address)</span>}
                        <button
                          type="button"
                          className="email-chip-remove"
                          aria-label={`Remove ${email}`}
                          disabled={sent.isSending}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeEmailChip(email);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <input
                    id="invite-emails"
                    ref={emailInputRef}
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby="invite-emails-hint"
                    className="min-w-[12rem] flex-1 bg-transparent py-1 text-slate-100 placeholder:text-slate-500 focus:outline-none"
                    placeholder={emailChips.length === 0 ? "friend@example.com" : ""}
                    value={emailDraft}
                    disabled={sent.isSending}
                    onChange={(event) => handleEmailChange(event.target.value)}
                    onKeyDown={handleEmailKeyDown}
                    onBlur={() => {
                      if (!emailDraft.trim()) return;
                      commitEmails([emailDraft]);
                      setEmailDraft("");
                    }}
                  />
                </div>
                <p
                  id="invite-emails-hint"
                  className={`mt-2 text-xs ${invalidChipCount > 0 ? "text-rose-300" : "text-slate-400"}`}
                >
                  {invalidChipCount > 0
                    ? `${invalidChipCount} ${invalidChipCount === 1 ? "address needs" : "addresses need"} fixing before you send.`
                    : "Paste a list, or press Enter after each address."}
                </p>
              </div>

              {formError && <p className="status-error" role="alert">{formError}</p>}
              <p ref={resultRef} tabIndex={-1} role="status" className={resultMessage ? "status-success" : "sr-only"}>
                {resultMessage || ""}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  {selectedBowl
                    ? `They'll get an email and join ${selectedBowl.name} once they accept.`
                    : "They'll get an email and join once they accept."}
                </p>
                <button type="submit" className="btn btn-primary w-full shrink-0 sm:w-auto" disabled={sent.isSending}>
                  {sent.isSending ? "Sending…" : sendLabel}
                </button>
              </div>
            </form>
          )}
        </section>

        {(!isOwnershipKnown || ownedBowlCount > 0) && (
          <section aria-labelledby="sent-heading" id="sent">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="sent-heading" className="section-title">Waiting to join</h2>
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
              <p className="mt-1 text-sm text-slate-400" role="status">
                {bowlsError
                  ? "Your bowls could not be loaded, so this list is unavailable."
                  : "Loading sent invitations…"}
              </p>
            ) : sent.isLoading && sent.invitations.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400" role="status">Loading sent invitations…</p>
            ) : sent.invitations.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Invitations you send stay here until someone accepts.
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {groupedSent.map(({ bowl, rows }) => (
                  <div
                    key={bowl.id}
                    className={hash === "#sent" && bowl.id === requestedBowlId
                      ? "-m-3 rounded-2xl p-3 ring-1 ring-rose-800/70"
                      : undefined}
                  >
                    <h3
                      tabIndex={-1}
                      ref={(node) => {
                        if (node) sentGroupRefs.current.set(bowl.id, node);
                        else sentGroupRefs.current.delete(bowl.id);
                      }}
                      className="eyebrow focus-visible:outline-none"
                    >
                      {bowl.name}
                    </h3>
                    <ul className="mt-2 divide-y divide-slate-800/80 border-y border-slate-800/80">
                      {rows.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-600 text-xs font-semibold uppercase text-slate-400"
                          >
                            {row.invited_email?.[0] || "?"}
                          </span>
                          {/* The basis is what sends the actions to their own line on a
                              phone, rather than squeezing the address to a few letters. */}
                          <div className="min-w-0 flex-1 basis-52">
                            <p className="truncate text-sm font-medium text-slate-100" title={row.invited_email}>
                              {row.invited_email}
                            </p>
                            {row.created_at && (
                              <p className="text-xs text-slate-500">
                                Sent {formatRelativeDateLabel(row.created_at)}
                              </p>
                            )}
                          </div>
                          <div className="ml-11 flex shrink-0 gap-1 sm:ml-0">
                            <CopyButton
                              value={`${window.location.origin}/accept-invite/${row.token}`}
                              label="Copy link"
                              className="btn btn-ghost px-3 text-sm"
                              ariaLabel={`Copy invitation link for ${row.invited_email}`}
                              onCopied={() => setSentMessage(`Invitation link copied for ${row.invited_email}.`)}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost px-3 text-sm text-rose-300"
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
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
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
