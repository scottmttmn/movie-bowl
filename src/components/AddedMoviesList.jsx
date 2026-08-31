import { useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { getPosterUrl } from "../utils/getPosterUrl";
import { MAX_MOVIE_NOTE_LENGTH } from "../utils/movieNote";

function CommentIcon({ filled }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path strokeLinejoin="round" d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z" />
  </svg>;
}

function RemoveIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
  </svg>;
}

export default function AddedMoviesList({ add, bowls, controllerRef, onRemoved }) {
  const [editor, setEditor] = useState(null);
  const latestEditor = useRef(editor);
  useLayoutEffect(() => { latestEditor.current = editor; }, [editor]);
  const panel = useRef(null);
  const buttons = useRef(new Map());
  const drafts = useRef(new Map());
  const focusAfterSave = useRef(null);
  const editingEntry = add.additions.find((entry) => entry.movie.id === editor?.id);
  const busy = add.actionsPending;
  const showBowls = bowls.length > 1 || new Set(add.additions.map((entry) => entry.bowlId)).size > 1;

  useLayoutEffect(() => {
    panel.current?.querySelector("textarea, button")?.focus();
  }, [editor?.id, editor?.mode]);
  useLayoutEffect(() => {
    const target = buttons.current.get(focusAfterSave.current);
    if (!editor && target && !target.disabled && !target.closest('[hidden]')) {
      target.focus();
      focusAfterSave.current = null;
    }
  }, [editor, busy]);

  const cancel = () => {
    if (!editor || editingEntry?.pending) return;
    drafts.current.delete(editor.id);
    setEditor(null);
    buttons.current.get(`${editor.id}:${editor.mode}`)?.focus();
  };
  useImperativeHandle(controllerRef, () => ({ dismiss: () => {
    if (!editor) return false;
    cancel();
    return true;
  } }));

  const showEditor = (entry, mode) => {
    if (editor?.mode === "comment") drafts.current.set(editor.id, editor.draft);
    setEditor({ id: entry.movie.id, mode, draft: drafts.current.get(entry.movie.id) ?? entry.movie.note ?? "" });
  };
  const save = async () => {
    const captured = editor;
    const activePanel = panel.current;
    const result = captured.mode === "comment"
      ? await add.updateAddedMovieNote(captured.id, captured.draft)
      : await add.removeAddedMovie(captured.id);
    if (!result.ok || latestEditor.current?.id !== captured.id) return;
    drafts.current.delete(captured.id);
    if (!activePanel?.closest('[hidden]') && (activePanel?.contains(document.activeElement) || document.activeElement === document.body)) {
      if (captured.mode === "remove") onRemoved?.();
      else focusAfterSave.current = `${captured.id}:comment`;
    }
    setEditor(null);
  };

  return <>
    <p className="sr-only" role="status">{add.actionAnnouncement}</p>
    {add.additions.length > 0 && <section className="mt-4 border-t border-slate-700/60 pt-4" aria-labelledby="added-movies-title">
      <h3 id="added-movies-title" className="mb-2 flex items-center justify-between text-sm font-medium text-slate-300">
        Added this session <span className="text-xs text-slate-400">{add.additions.length}</span>
      </h3>
      <ul className="space-y-2" aria-label="Movies added this session">
        {add.additions.map((entry) => {
          const { movie } = entry;
          const active = editor?.id === movie.id;
          const lost = !bowls.some((bowl) => bowl.id === entry.bowlId);
          const unavailable = lost || movie.drawn_at || ["movie_unavailable", "access_lost", "not_authenticated"].includes(entry.error?.code);
          const year = movie.release_date?.slice(0, 4);
          return <li key={movie.id} className="rounded-xl border border-slate-700/60 bg-slate-950/25 p-3">
            <div className="flex items-center gap-2.5">
              <img src={getPosterUrl(movie)} alt="" className="h-14 w-9 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm font-medium text-slate-100" title={movie.title}>{movie.title}{year && <span className="ml-1.5 font-normal text-slate-400">({year})</span>}</p>
                {showBowls && <p className="mt-0.5 break-words text-xs text-slate-400">{entry.bowlName}</p>}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <button type="button" ref={(node) => { if (node) buttons.current.set(`${movie.id}:comment`, node); else buttons.current.delete(`${movie.id}:comment`); }}
                  className={`icon-btn h-11 w-11 ${movie.note ? "text-rose-300" : "text-slate-400"}`}
                  aria-label={`${movie.note ? "Edit" : "Add"} comment for ${movie.title}`} title={movie.note ? "Edit comment" : "Add comment"}
                  aria-expanded={active && editor.mode === "comment"} aria-controls={`added-movie-panel-${movie.id}`}
                  disabled={busy || Boolean(unavailable)} onClick={() => showEditor(entry, "comment")}>
                  <CommentIcon filled={Boolean(movie.note)} />
                </button>
                <button type="button" ref={(node) => { if (node) buttons.current.set(`${movie.id}:remove`, node); else buttons.current.delete(`${movie.id}:remove`); }}
                  className="icon-btn h-11 w-11 text-slate-400 hover:text-rose-300"
                  aria-label={`Remove ${movie.title} from ${entry.bowlName}`} title="Remove from bowl"
                  aria-expanded={active && editor.mode === "remove"} aria-controls={`added-movie-panel-${movie.id}`}
                  disabled={busy || Boolean(unavailable)} onClick={() => showEditor(entry, "remove")}>
                  <RemoveIcon />
                </button>
              </div>
            </div>
            {movie.note && !(active && editor.mode === "comment") && <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-300">{movie.note}</p>}
            {active && <div ref={panel} id={`added-movie-panel-${movie.id}`} className="mt-3 border-t border-slate-700/60 pt-3">
              {editor.mode === "comment" ? <>
                <label htmlFor={`added-movie-note-${movie.id}`} className="mb-2 block text-sm text-slate-300">Comment for {movie.title}</label>
                <textarea id={`added-movie-note-${movie.id}`} className="input-field min-h-24 resize-y text-sm" maxLength={MAX_MOVIE_NOTE_LENGTH}
                  value={editor.draft} disabled={Boolean(entry.pending || unavailable)} aria-invalid={Boolean(entry.error)}
                  placeholder="Recommended by Tim at dinner…" onChange={(event) => setEditor({ ...editor, draft: event.target.value })} />
                <p className="mt-1 text-right text-xs text-slate-400">{editor.draft.length}/{MAX_MOVIE_NOTE_LENGTH}</p>
              </> : <p className="text-sm text-slate-200">Remove <span className="font-medium">{movie.title}</span> from {entry.bowlName}?</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={`btn ${editor.mode === "comment" ? "btn-primary" : "btn-danger"} text-sm`}
                  disabled={Boolean(entry.pending || unavailable)} onClick={save}>
                  {entry.pending ? editor.mode === "comment" ? "Saving…" : "Removing…" : editor.mode === "comment" ? "Save comment" : "Remove from bowl"}
                </button>
                <button type="button" className="btn btn-ghost text-sm" disabled={Boolean(entry.pending)} onClick={cancel}>Cancel</button>
              </div>
            </div>}
            {lost ? <p className="mt-2 text-sm text-rose-300" role="alert">You no longer have access to this bowl.</p>
              : entry.error && <p className="mt-2 text-sm text-rose-300" role="alert">{entry.error.message}</p>}
          </li>;
        })}
      </ul>
    </section>}
  </>;
}
