import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useModalFocus from "../hooks/useModalFocus";
import { sendFeedback } from "../lib/feedback";
import { HELP_TOPICS, mockPickHelpTopic } from "../utils/helpTopics";

// One question, one line, one place to go. A question the guide cannot answer
// is one tap from becoming feedback.
export default function HelpSheet({ onClose, getInvoker = null, bowlId = null, send = sendFeedback }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle");
  const [topic, setTopic] = useState(null);
  const [failure, setFailure] = useState("");
  const navigate = useNavigate();
  const dialog = useRef(null);
  useModalFocus(dialog, { getInvoker, onEscape: onClose });

  const ask = async () => {
    if (!text.trim()) return;
    setStatus("asking");
    await new Promise((r) => setTimeout(r, 400));
    const id = mockPickHelpTopic(text);
    setTopic(HELP_TOPICS.find((t) => t.id === id) || null);
    setStatus("answered");
  };

  const sendIt = async () => {
    setStatus("sending");
    setFailure("");
    const result = await send({ message: text.trim(), errorText: "", page: null });
    if (result?.ok) setStatus("sent");
    else {
      setStatus("answered");
      setFailure(result?.message || "Could not send that. Try again.");
    }
  };

  const go = () => {
    const to = topic.to.replace(":bowlId", bowlId || "");
    onClose();
    navigate(to, { state: { helpTarget: topic.target || null } });
  };

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div ref={dialog} tabIndex={-1} className="modal-surface max-w-lg p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="help-title" className="section-title text-xl">Help</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-300" aria-hidden="true">✓</span>
            <p className="text-lg font-semibold text-white">Thanks</p>
          </div>
        ) : (
          <>
            <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); ask(); }}>
              <textarea
                className="input-field min-h-20 flex-1"
                aria-label="Question"
                placeholder="How do I…"
                maxLength={4000}
                value={text}
                autoFocus
                onChange={(event) => { setText(event.target.value); setStatus("idle"); setFailure(""); }}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }}
              />
              <button type="submit" className="btn btn-primary shrink-0" aria-label="Ask" disabled={!text.trim() || status === "asking"}>
                {status === "asking" ? "…" : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                )}
              </button>
            </form>

            {status !== "idle" && status !== "asking" && (
              <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4" role="status">
                {topic ? (
                  <>
                    <p className="text-base text-slate-100">{topic.answer}</p>
                    <button type="button" className="btn btn-secondary mt-3 w-full justify-between sm:w-auto" onClick={go}>
                      {topic.label}
                      <span aria-hidden="true" className="ml-2">→</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base text-slate-300">No answer for that.</p>
                    <button type="button" className="btn btn-secondary shrink-0" disabled={status === "sending"} onClick={sendIt}>
                      {status === "sending" ? "Sending…" : "Send as feedback"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {failure && <div className="status-error mt-3" role="alert">{failure}</div>}
          </>
        )}
      </div>
    </div>
  );
}
