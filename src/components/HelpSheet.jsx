import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useModalFocus from "../hooks/useModalFocus";
import { sendFeedback } from "../lib/feedback";
import { askHelp } from "../lib/help";
import { HELP_QUESTION_MAX_LENGTH, resolveHelpDestination } from "../utils/helpTopics";

const ArrowGlyph = ({ className = "h-4 w-4" }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

// The ? panel: one question, one line back, one place to go. Every answer is
// written in the guide (utils/helpTopics.js); the model only chooses which.
// A question with no answer -- or no model to ask -- is one tap from becoming
// feedback, which is how the guide learns what it is missing. It drops from
// the header beneath the button that opened it, so it reads as part of the
// header rather than as a form.
export default function HelpSheet({ onClose, getInvoker = null, bowlId = null, ask = askHelp, send = sendFeedback }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle");
  const [topic, setTopic] = useState(null);
  const [failure, setFailure] = useState("");
  const latest = useRef(0);
  const navigate = useNavigate();
  const dialog = useRef(null);
  useModalFocus(dialog, { getInvoker, onEscape: onClose });

  const question = text.trim();

  const submit = async () => {
    if (!question || status === "asking") return;
    const request = latest.current + 1;
    latest.current = request;
    setStatus("asking");
    setFailure("");
    const answer = await ask(question);
    // Typing again while it was asked makes this answer someone else's.
    if (latest.current !== request) return;
    setTopic(answer);
    setStatus("answered");
  };

  const sendIt = async () => {
    setStatus("sending");
    setFailure("");
    const result = await send({ message: question, errorText: "", page: null });
    if (result?.ok) {
      setStatus("sent");
    } else {
      setStatus("answered");
      setFailure(result?.message || "Could not send that. Try again.");
    }
  };

  const go = () => {
    onClose();
    navigate(resolveHelpDestination(topic, bowlId), { state: { helpTarget: topic.target || null } });
  };

  const answered = status === "answered" || status === "sending";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 pt-[4.5rem] backdrop-blur-sm" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="page-container pointer-events-none flex justify-center sm:justify-end">
        <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="help-title"
          className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-2xl shadow-black/50">
          <h2 id="help-title" className="sr-only">Help</h2>
          <form className="relative" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9.5" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.3" /><path d="M12 16.9h.01" strokeWidth="2.6" /></svg>
            </span>
            <input
              className="input-field w-full border-transparent bg-slate-950/60 pl-10 pr-12"
              aria-label="Question"
              placeholder="How do I…"
              maxLength={HELP_QUESTION_MAX_LENGTH}
              value={text}
              autoFocus
              // Held while feedback sends: what is sent is what is shown.
              disabled={status === "sent" || status === "sending"}
              onChange={(event) => {
                latest.current += 1;
                setText(event.target.value);
                setStatus("idle");
                setFailure("");
              }}
            />
            {question && status !== "sent" && (
              <button type="submit" aria-label="Ask" disabled={status === "asking"}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-500 disabled:opacity-60">
                {status === "asking"
                  ? <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  : <ArrowGlyph />}
              </button>
            )}
          </form>

          {answered && topic && (
            <div className="px-2 pb-1 pt-3" role="status">
              <p className="text-[0.95rem] leading-snug text-slate-200">{topic.answer}</p>
              <button type="button" onClick={go}
                className="mt-2.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-200 ring-1 ring-inset ring-slate-700/80 transition hover:bg-slate-800">
                {topic.label}
                <ArrowGlyph />
              </button>
            </div>
          )}

          {answered && !topic && (
            <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3" role="status">
              <p className="text-[0.95rem] text-slate-400">No answer for that.</p>
              <button type="button" onClick={sendIt} disabled={status === "sending"}
                className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold text-rose-200 transition hover:bg-slate-800 disabled:opacity-60">
                {status === "sending" ? "Sending…" : "Send as feedback"}
              </button>
            </div>
          )}

          {status === "sent" && (
            <p className="flex items-center gap-2 px-2 pb-1 pt-3 text-[0.95rem] text-slate-200" role="status">
              <span aria-hidden="true" className="text-emerald-300">✓</span> Sent
            </p>
          )}
          {failure && <div className="status-error mt-2" role="alert">{failure}</div>}
        </div>
      </div>
    </div>
  );
}
