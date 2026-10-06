import { useEffect, useState } from "react";
import { sendFeedback } from "../lib/feedback";

// One box for bugs and ideas alike. The line under it is the one disclosure the
// sheet owes: it sends the page and the device as well as what was typed. From
// the error screen the error rides along too, shown above the box so the
// sender sees exactly what goes.
export default function FeedbackSheet({ onClose, errorText = "", page = null, send = sendFeedback }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [failure, setFailure] = useState("");
  const isSending = status === "sending";
  const canSend = !isSending && (message.trim() || errorText);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isSending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSending, onClose]);

  const submit = async () => {
    if (!canSend) return;
    setStatus("sending");
    setFailure("");
    const result = await send({ message: message.trim(), errorText, page });
    if (result?.ok) {
      setStatus("sent");
    } else {
      setStatus("idle");
      setFailure(result?.message || "Could not send that. Try again.");
    }
  };

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div className="modal-surface max-w-lg p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="feedback-title" className="section-title text-xl">Feedback</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose} disabled={isSending}>✕</button>
        </div>
        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-300" aria-hidden="true">✓</span>
            <p className="text-lg font-semibold text-white">Thanks</p>
          </div>
        ) : (
          <>
            {errorText && (
              <div className="mb-3 max-h-24 overflow-auto rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-400">
                {errorText}
              </div>
            )}
            <textarea
              className="input-field min-h-36"
              aria-label="Feedback"
              placeholder="Report a problem or suggest an idea"
              maxLength={4000}
              value={message}
              disabled={isSending}
              autoFocus
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="mt-2 text-xs text-slate-500">Sends with your page and device.</p>
            {failure && <div className="status-error mt-3" role="alert">{failure}</div>}
            <div className="mt-5 flex justify-end">
              <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={!canSend} onClick={submit}>
                {isSending ? "Sending…" : errorText ? "Send report" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
