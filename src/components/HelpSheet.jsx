import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useModalFocus from "../hooks/useModalFocus";
import { sendFeedback } from "../lib/feedback";
import { HELP_TOPICS, mockPickHelpTopic } from "../utils/helpTopics";

// One question, one line, one place to go. A question the guide cannot answer
// is one tap from becoming feedback. Dropped from the header, beneath the ?
// that opened it, so it reads as part of the header rather than a form.
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

  const answered = status === "answered" || status === "sending";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 pt-[4.5rem] backdrop-blur-sm" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="page-container pointer-events-none flex justify-center sm:justify-end">
      <div ref={dialog} tabIndex={-1} className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-2xl shadow-black/50"
        role="dialog" aria-modal="true" aria-labelledby="help-title">
        <h2 id="help-title" className="sr-only">Help</h2>
        <form className="relative" onSubmit={(event) => { event.preventDefault(); ask(); }}>
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9.5" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.3" /><path d="M12 16.9h.01" strokeWidth="2.6" /></svg>
          </span>
          <input
            className="input-field w-full border-transparent bg-slate-950/60 pl-10 pr-12"
            aria-label="Question"
            placeholder="How do I…"
            maxLength={300}
            value={text}
            autoFocus
            disabled={status === "sent"}
            onChange={(event) => { setText(event.target.value); setStatus("idle"); setFailure(""); }}
          />
          {text.trim() && status !== "sent" && (
            <button type="submit" aria-label="Ask" disabled={status === "asking"}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-500 disabled:opacity-60">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          )}
        </form>

        {answered && topic && (
          <div className="px-2 pb-1 pt-3" role="status">
            <p className="text-[0.95rem] leading-snug text-slate-200">{topic.answer}</p>
            <button type="button" onClick={go}
              className="mt-2.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-200 ring-1 ring-inset ring-slate-700/80 transition hover:bg-slate-800">
              {topic.label}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        {answered && !topic && (
          <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3" role="status">
            <p className="text-[0.95rem] text-slate-400">No answer for that.</p>
            <button type="button" onClick={sendIt} disabled={status === "sending"}
              className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold text-rose-200 transition hover:bg-slate-800">
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
