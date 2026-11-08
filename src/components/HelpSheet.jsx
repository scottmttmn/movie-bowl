import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useModalFocus from "../hooks/useModalFocus";
import { HELP_TOPICS, mockPickHelpTopic } from "../utils/helpTopics";

export default function HelpSheet({ onClose, onSendFeedback, getInvoker = null, bowlId = null }) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("idle");
  const [topic, setTopic] = useState(null);
  const navigate = useNavigate();
  const dialog = useRef(null);
  useModalFocus(dialog, { getInvoker, onEscape: onClose });

  const ask = async () => {
    if (!question.trim()) return;
    setStatus("asking");
    await new Promise((r) => setTimeout(r, 400));
    const id = mockPickHelpTopic(question);
    setTopic(HELP_TOPICS.find((t) => t.id === id) || null);
    setStatus("answered");
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
        <form
          className="flex gap-2"
          onSubmit={(event) => { event.preventDefault(); ask(); }}
        >
          <input
            className="input-field flex-1"
            aria-label="Question"
            placeholder="How do I…"
            maxLength={300}
            value={question}
            autoFocus
            onChange={(event) => { setQuestion(event.target.value); setStatus("idle"); }}
          />
          <button type="submit" className="btn btn-primary shrink-0" aria-label="Ask" disabled={!question.trim() || status === "asking"}>
            {status === "asking" ? "…" : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            )}
          </button>
        </form>

        {status === "answered" && topic && (
          <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4" role="status">
            <p className="text-base text-slate-100">{topic.answer}</p>
            <button type="button" className="btn btn-secondary mt-3 w-full justify-between sm:w-auto" onClick={go}>
              {topic.label}
              <span aria-hidden="true" className="ml-2">→</span>
            </button>
          </div>
        )}

        {status === "answered" && !topic && (
          <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4" role="status">
            <p className="text-base text-slate-300">Movie Bowl can&apos;t do that yet.</p>
            <button type="button" className="btn btn-ghost mt-2 -ml-2 text-sm" onClick={() => onSendFeedback(question.trim())}>
              Send as feedback
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
