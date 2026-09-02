import { useEffect, useRef } from "react";

// Small confirmation for actions that are easy to hit by accident and awkward to
// undo -- declining an invitation, revoking one. Focus starts on the keep action
// so a stray Enter cannot confirm the destructive half.
export default function ConfirmDialog({
  isOpen,
  title,
  body = null,
  keepLabel = "Cancel",
  confirmLabel = "Confirm",
  isBusy = false,
  errorMessage = null,
  onKeep,
  onConfirm,
}) {
  const dialogRef = useRef(null);
  // The effect below must not re-run when these change: its cleanup restores
  // focus behind the modal, and callers pass a fresh inline onKeep every render.
  const onKeepRef = useRef(onKeep);
  const isBusyRef = useRef(isBusy);
  useEffect(() => { onKeepRef.current = onKeep; }, [onKeep]);
  useEffect(() => { isBusyRef.current = isBusy; }, [isBusy]);

  // While the action is pending both buttons are disabled, so focus would land
  // on a disabled control and Tab could walk out of the dialog. Park it on the
  // container instead.
  useEffect(() => {
    if (isOpen && isBusy) dialogRef.current?.focus();
  }, [isOpen, isBusy]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (dialog?.querySelector("[data-confirm-autofocus]") || dialog)?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isBusyRef.current) onKeepRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled)")];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-[80]" role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="modal-surface max-w-md p-5 sm:p-6"
      >
        <h3 id="confirm-dialog-title" className="section-title text-lg">{title}</h3>
        {body && <p className="mt-2 text-sm text-slate-400">{body}</p>}
        {errorMessage && <p className="status-error mt-3" role="alert">{errorMessage}</p>}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onKeep} disabled={isBusy} data-confirm-autofocus="true">
            {keepLabel}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
