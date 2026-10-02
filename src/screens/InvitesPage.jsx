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
import useBowlPeople from "../hooks/useBowlPeople";
import bowlImage from "../assets/movie-bowl.webp";
import { buildBowlPeopleRows } from "../utils/bowlPeople";
import { formatRelativeDateLabel } from "../utils/formatRelativeDate";
import { getDisplayInitial } from "../utils/profileIdentity";
import { parseInviteEmails } from "../utils/parseInviteEmails";

// Two jobs, top to bottom: invitations someone handed you, then inviting people
// to a bowl you own. What you already sent is not a list of its own; it sits
// under the bowl it belongs to, beside the people who already joined.
export default function InvitesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const { session } = useAuth();
  const accountEmail = session?.user?.email || "";
  const currentUserId = session?.user?.id || null;
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
  const [openPendingId, setOpenPendingId] = useState(null);
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
  const invitedHeadingRef = useRef(null);
  const peopleRef = useRef(null);
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

  const selectedPending = useMemo(
    () => sent.invitations.filter((invitation) => invitation.bowl_id === selectedBowlId),
    [sent.invitations, selectedBowlId]
  );

  // Bowl Settings links to #invite-people to send and #sent to manage what it
  // already sent. Landing both on the form sends half of them to the wrong job.
  // The ?bowl= hint has already picked the bowl, so #sent lands on its Invited
  // row.
  useEffect(() => {
    if (!isRequestedBowlOwned) return;
    const target = `${hash}:${requestedBowlId}`;
    if (handledShortcut.current === target) return;
    if (hash !== "#sent") {
      handledShortcut.current = target;
      inviteHeadingRef.current?.focus();
      return;
    }
    // Wait for the row to exist: the records load after the bowls do.
    const invited = invitedHeadingRef.current;
    if (!invited) return;
    handledShortcut.current = target;
    invited.focus();
  }, [isRequestedBowlOwned, hash, requestedBowlId, selectedPending]);

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
  // Every bowl offered here is one the caller owns, so they are its owner.
  const people = useBowlPeople(selectedBowlId, { enabled: Boolean(selectedBowlId) });
  const memberRows = people.status === "ready"
    ? buildBowlPeopleRows({
      members: people.members,
      ownerId: currentUserId,
      ownerName: people.names[currentUserId] || null,
      names: people.names,
      currentUserId,
    })
    : [];
  const openPending = selectedPending.find((row) => row.id === openPendingId) || null;

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
    ? `Invite ${parsed.validEmails.length}`
    : "Invite";

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
    setOpenPendingId(null);
    setSentMessage(result.message);
  };

  return (
    <div className="invites-screen page-container py-6 sm:py-8">
      {/* One column, in the order the jobs come up: something waiting on you,
          then inviting people. */}
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Invitations</h1>
        </header>

        <section aria-labelledby="received-heading">
          <h2 id="received-heading" className="section-title">Invitations for you</h2>
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
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {received.map((invite) => {
                const bowlName = invite.bowl_name || "Movie Bowl Invite";
                const sentLabel = formatRelativeDateLabel(invite.created_at);
                return (
                  // The bowl's name on a slip, with the inviter's initial on the
                  // corner where the bowl page puts a contributor's.
                  <article key={invite.id} className="invite-slip-card" aria-labelledby={`invite-${invite.id}-title`}>
                    <div className="tonight-slip invite-slip">
                      <h3 id={`invite-${invite.id}-title`}>{bowlName}</h3>
                      {invite.invited_by_name && (
                        <span className="tonight-slip-avatar" aria-hidden="true">
                          {getDisplayInitial(invite.invited_by_name)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="mr-auto min-w-0 truncate text-sm text-slate-400">
                        {[invite.invited_by_name, sentLabel].filter(Boolean).join(" · ")}
                      </p>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={pendingAccept === invite.id}
                        aria-label={`Decline invitation to ${invite.bowl_name || "this bowl"}`}
                        onClick={() => setDeclineTarget(invite)}
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={pendingAccept === invite.id}
                        aria-label={`Accept invitation to ${invite.bowl_name || "this bowl"}`}
                        onClick={() => { void handleAccept(invite); }}
                      >
                        {pendingAccept === invite.id ? "Joining…" : "Join"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="invite-people-heading" id="invite-people">
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
                <legend className="sr-only">Invite to</legend>
                <div className="grid grid-cols-2 gap-2">
                  {ownedBowls.map((bowl) => (
                    <label key={bowl.id} className="bowl-choice">
                      <input
                        type="radio"
                        name="invite-bowl"
                        className="sr-only"
                        value={bowl.id}
                        checked={selectedBowlId === bowl.id}
                        onChange={() => setBowlChoice(bowl.id)}
                      />
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950/70">
                        <img src={bowlImage} alt="" className="h-8 w-8 object-contain" />
                      </span>
                      <span className="line-clamp-2 min-w-0 break-words text-[15px] font-semibold leading-snug">{bowl.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="invite-emails" className="sr-only">Email addresses</label>
                <div className="flex items-start gap-2">
                  {/* The field is the box, not the input inside it: a click on
                      the space between chips should still start typing. */}
                  <div
                    className="input-field flex min-w-0 flex-1 flex-wrap items-center gap-1.5 focus-within:border-rose-500"
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
                      aria-describedby={invalidChipCount > 0 ? "invite-emails-hint" : undefined}
                      className="min-w-[8rem] flex-1 bg-transparent py-1 text-slate-100 placeholder:text-slate-500 focus:outline-none"
                      placeholder="Add email"
                      value={emailDraft}
                      disabled={sent.isSending}
                      onChange={(event) => handleEmailChange(event.target.value)}
                      onKeyDown={handleEmailKeyDown}
                      onBlur={(event) => {
                        if (!emailDraft.trim()) return;
                        // Committing can wrap the field onto another line and
                        // move the people below it out from under the tap that
                        // caused the blur. The draft still counts as typed.
                        if (peopleRef.current?.contains(event.relatedTarget)) return;
                        commitEmails([emailDraft]);
                        setEmailDraft("");
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary min-h-[3.25rem] shrink-0"
                    disabled={sent.isSending || (emailChips.length === 0 && !emailDraft.trim())}
                  >
                    {sent.isSending ? "Sending…" : sendLabel}
                  </button>
                </div>
                {invalidChipCount > 0 && (
                  <p id="invite-emails-hint" className="mt-2 text-xs text-rose-300">
                    {`${invalidChipCount} ${invalidChipCount === 1 ? "address needs" : "addresses need"} fixing before you send.`}
                  </p>
                )}
              </div>

              {formError && <p className="status-error" role="alert">{formError}</p>}
              <p ref={resultRef} tabIndex={-1} role="status" className={resultMessage ? "status-success" : "sr-only"}>
                {resultMessage || ""}
              </p>
            </form>
          )}
          {selectedBowlId && (
            // Who the bowl already reaches, under the field that adds to it:
            // members solid, invitations still waiting dashed, the way the
            // bowl page's people sheet draws them.
            <div ref={peopleRef} className="mt-6 space-y-4 border-t border-slate-800 pt-4">
              {memberRows.length > 0 && (
                <div>
                  <h3 className="eyebrow mb-2">In the bowl</h3>
                  <ul className="flex flex-wrap gap-3">
                    {memberRows.map((row) => (
                      <li key={row.key} className="person-cell">
                        <span aria-hidden="true" className="person-dot">{row.initial}</span>
                        <span className="person-name">{row.isYou ? "You" : row.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sentMessage && <p className="status-success" role="status">{sentMessage}</p>}
              {sent.loadError && (
                <div>
                  <p className="status-error" role="alert">{sent.loadError}</p>
                  <button type="button" className="btn btn-secondary mt-2" onClick={() => { void sent.refresh(); }}>
                    Try again
                  </button>
                </div>
              )}
              {selectedPending.length > 0 && (
                <div>
                  <h3 ref={invitedHeadingRef} tabIndex={-1} className="eyebrow mb-2 focus-visible:outline-none">
                    Invited
                  </h3>
                  <ul className="flex flex-wrap gap-3">
                    {selectedPending.map((row) => (
                      <li key={row.id} className="person-cell">
                        <button
                          type="button"
                          className="person-dot person-dot-invited"
                          aria-label={`${row.invited_email}, invited`}
                          aria-expanded={openPendingId === row.id}
                          aria-controls="invited-detail"
                          onClick={() => setOpenPendingId((current) => (current === row.id ? null : row.id))}
                        >
                          {getDisplayInitial(row.invited_email)}
                        </button>
                        <span className="person-name text-slate-500">{row.invited_email.split("@")[0]}</span>
                      </li>
                    ))}
                  </ul>
                  {/* Below the row rather than floating over it, so the last
                      circle on a phone does not open off the edge of the screen. */}
                  {openPending && (
                    <div id="invited-detail" className="pending-detail">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate text-sm font-medium text-slate-100" title={openPending.invited_email}>
                          {openPending.invited_email}
                        </p>
                        {openPending.created_at && (
                          <p className="text-xs text-slate-500">
                            Sent {formatRelativeDateLabel(openPending.created_at)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <CopyButton
                          value={`${window.location.origin}/accept-invite/${openPending.token}`}
                          label="Copy link"
                          className="btn btn-ghost px-3 text-sm"
                          ariaLabel={`Copy invitation link for ${openPending.invited_email}`}
                          onCopied={() => setSentMessage(`Invitation link copied for ${openPending.invited_email}.`)}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost px-3 text-sm text-rose-300"
                          aria-label={`Revoke invitation for ${openPending.invited_email}`}
                          onClick={() => setRevokeTarget({
                            bowlId: selectedBowlId,
                            bowlName: ownedBowls.find((bowl) => bowl.id === selectedBowlId)?.name || "this bowl",
                            invitationId: openPending.id,
                            invitedEmail: openPending.invited_email,
                          })}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
