import { useRef, useState } from "react";
import useModalFocus from "../hooks/useModalFocus";
import {
  deleteMyWatchHistoryShareLink,
  getWatchHistoryShareUrl,
  saveMyWatchHistoryShareLink,
} from "../lib/watchHistoryShare";

export function LinkGlyph({ className = "h-5 w-5" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  );
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-60 ${checked ? "border-rose-700 bg-rose-600" : "border-slate-600 bg-slate-800"}`}
    >
      <span className={`absolute top-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow transition-all ${checked ? "left-[1.4rem]" : "left-0.5"}`} />
    </button>
  );
}

// One private link per account. A viewer can look and nothing else: there is
// nobody to follow, nothing to like, and no count of who looked -- sharing
// what you watched without Movie Bowl turning into a social app.
export default function WatchHistoryShareSheet({
  link,
  lookupStatus = "known",
  onRetryLookup,
  posters = [],
  onLinkChange,
  onClose,
}) {
  const [includeComments, setIncludeComments] = useState(link?.includeComments ?? false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const url = link ? getWatchHistoryShareUrl(link.token) : "";

  const dialog = useRef(null);
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  useModalFocus(dialog, {
    getInvoker: () => opener,
    onEscape: () => {
      if (!isBusy) onClose();
    },
  });

  const save = async (nextIncludeComments) => {
    setIsBusy(true);
    setFailure("");
    const result = await saveMyWatchHistoryShareLink({ includeComments: nextIncludeComments });
    setIsBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return false;
    }
    setIncludeComments(result.link.includeComments);
    onLinkChange(result.link);
    return true;
  };

  const handleComments = async (next) => {
    // Before a link exists this is only the choice the link will be made with.
    if (!link) {
      setIncludeComments(next);
      return;
    }
    setIncludeComments(next);
    const saved = await save(next);
    if (!saved) setIncludeComments(!next);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Without clipboard access the link is still on screen to select by hand.
      setFailure("Could not copy. Select the link to copy it.");
    }
  };

  const handleTurnOff = async () => {
    // Two taps: the first only asks, because the link someone was sent stops
    // working for good, and a new one would be a different address.
    if (!confirmingOff) {
      setConfirmingOff(true);
      return;
    }
    setIsBusy(true);
    setFailure("");
    const result = await deleteMyWatchHistoryShareLink();
    setIsBusy(false);
    setConfirmingOff(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    setCopied(false);
    onLinkChange(null);
  };

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div ref={dialog} tabIndex={-1} className="modal-surface max-w-lg p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="watch-share-title">
        <div className="mb-5 flex items-center justify-between">
          <h3 id="watch-share-title" className="section-title text-xl">Share Watch History</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose} disabled={isBusy}>✕</button>
        </div>

        {/* What a viewer gets, shown rather than listed. */}
        {posters.length > 0 && (
          <div className="mb-5 flex items-end gap-2" aria-hidden="true">
            {posters.slice(0, 5).map((src, index) => (
              <img
                key={index}
                src={src}
                alt=""
                className="h-20 w-[3.35rem] rounded-lg object-cover shadow-md shadow-black/40"
                style={{ transform: `rotate(${(index - 2) * 2}deg)` }}
              />
            ))}
          </div>
        )}

        {lookupStatus !== "known" ? (
          // Without a confirmed answer the controls would be guesses: a link
          // may already exist, sharing comments the switch would show as off.
          lookupStatus === "failed" ? (
            <div className="status-error flex flex-wrap items-center justify-between gap-3" role="alert">
              <p>Could not check your link.</p>
              <button type="button" className="btn btn-secondary min-h-0 px-4 py-2 text-sm" onClick={onRetryLookup}>
                Try again
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400" role="status">Checking your link…</p>
          )
        ) : (
          <>
          {link && (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 py-1.5 pl-3 pr-1.5">
                <LinkGlyph className="h-4 w-4 shrink-0 text-rose-300" />
                <input
                  readOnly
                  aria-label="Share link"
                  value={url}
                  onFocus={(event) => event.target.select()}
                  className="min-w-0 flex-1 truncate bg-transparent font-mono text-sm text-slate-200 outline-none"
                />
                <button type="button" className="btn btn-primary min-h-0 px-4 py-2 text-sm" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Anyone with the link can look. Nobody can reply.</p>
            </>
          )}

          <div className={`flex items-center justify-between gap-4 border-t border-slate-800 pt-4 ${link ? "mt-5" : ""}`}>
            <span className="text-sm font-medium text-slate-200">Show my comments</span>
            <Switch checked={includeComments} onChange={handleComments} label="Show my comments" disabled={isBusy} />
          </div>

          {failure && <div className="status-error mt-4" role="alert">{failure}</div>}

          {link ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                className="btn btn-ghost px-0 text-sm text-rose-300"
                onClick={handleTurnOff}
                disabled={isBusy}
              >
                {confirmingOff ? "Tap again to turn off" : "Turn off link"}
              </button>
              <a className="btn btn-secondary text-sm" href={url} target="_blank" rel="noreferrer">
                Preview
              </a>
            </div>
          ) : (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="btn btn-primary w-full sm:w-auto"
                onClick={() => save(includeComments)}
                disabled={isBusy}
              >
                {isBusy ? "Making…" : "Make a link"}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
