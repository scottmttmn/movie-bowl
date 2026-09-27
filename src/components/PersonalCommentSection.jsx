import { useId, useState } from "react";
import {
  MAX_MOVIE_NOTE_LENGTH,
  getMovieNoteValidationError,
  normalizeMovieNote,
} from "../utils/movieNote";

// What the viewer thought of the movie, as opposed to why it was in the bowl.
// It is theirs alone, so it is editable wherever it appears. On a page that is
// about something else -- the bowl's history -- it starts folded away, and the
// folded row still says whether there is anything inside.
export default function PersonalCommentSection({ note = null, onSave, collapsed = false }) {
  const [displayedNote, setDisplayedNote] = useState(() => normalizeMovieNote(note));
  const [isOpen, setIsOpen] = useState(!collapsed);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const baseId = useId();
  const bodyId = `${baseId}-body`;
  const helpId = `${baseId}-help`;

  const startEditing = () => {
    setDraft(displayedNote || "");
    setError("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(displayedNote || "");
    setError("");
    setIsEditing(false);
    // Opened only to write, with nothing written: fold it back to how it was.
    if (collapsed && !displayedNote) setIsOpen(false);
  };

  const save = async () => {
    if (!onSave || isSaving) return;

    const validationError = getMovieNoteValidationError(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const result = await onSave(normalizeMovieNote(draft));
      if (!result?.ok) {
        setError(result?.message || "Could not save your comment. Please try again.");
        return;
      }

      const saved = normalizeMovieNote(result.note);
      setDisplayedNote(saved);
      setIsEditing(false);
      if (collapsed && !saved) setIsOpen(false);
    } catch (saveError) {
      console.error("[PersonalCommentSection] Failed to save comment", saveError);
      setError("Could not save your comment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="btn btn-ghost -ml-3 px-3 text-sm"
        aria-expanded="false"
        onClick={() => {
          setIsOpen(true);
          // An empty comment has nothing to read, so opening it means writing.
          if (!displayedNote) startEditing();
        }}
      >
        {displayedNote ? <>Your comment <span aria-hidden="true">▸</span></> : "+ Add your comment"}
      </button>
    );
  }

  const heading = collapsed ? (
    <button
      type="button"
      className="-m-1 rounded p-1 text-xs font-medium text-slate-400 hover:text-slate-200"
      aria-expanded="true"
      aria-controls={bodyId}
      disabled={isSaving}
      onClick={() => {
        setIsEditing(false);
        setError("");
        setIsOpen(false);
      }}
    >
      Your comment <span aria-hidden="true">▾</span>
    </button>
  ) : (
    <h3 className="text-xs font-medium text-slate-400">Your comment</h3>
  );

  if (!displayedNote && !isEditing) {
    return (
      <button type="button" className="btn btn-ghost -ml-3 px-3 text-sm" onClick={startEditing}>
        + Add your comment
      </button>
    );
  }

  return (
    <section className="surface-card p-4" aria-label="Your comment" id={bodyId}>
      <div className="mb-2 flex items-center justify-between gap-3">
        {heading}
        {!isEditing && (
          <button
            type="button"
            className="btn btn-ghost -my-2 -mr-2 px-2 text-xs"
            aria-label="Edit your comment"
            onClick={startEditing}
          >
            Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <div>
          <textarea
            className="input-field min-h-28 resize-y whitespace-pre-wrap text-sm"
            value={draft}
            maxLength={MAX_MOVIE_NOTE_LENGTH}
            placeholder="What did you think?"
            onChange={(event) => setDraft(event.target.value)}
            disabled={isSaving}
            aria-label="Your comment"
            aria-describedby={helpId}
            aria-invalid={Boolean(error)}
            autoFocus
          />
          <div className="mt-2 flex items-start justify-between gap-3 text-xs text-slate-400">
            <span id={helpId} role={error ? "alert" : undefined}>
              {error || "Only you can see this."}
            </span>
            <span className="shrink-0">{draft.length}/{MAX_MOVIE_NOTE_LENGTH}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary px-3 text-sm" onClick={save} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save comment"}
            </button>
            <button type="button" className="btn btn-ghost px-3 text-sm" onClick={cancelEditing} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{displayedNote}</p>
      )}
    </section>
  );
}
