import { useCallback, useId, useRef } from "react";
import { createPortal } from "react-dom";
import useModalFocus from "../hooks/useModalFocus";

export default function SoloDrawDialog({ title, badge, children, onClose, className = "" }) {
  const titleId = useId();
  const ref = useRef(null);
  const invoker = useRef(document.activeElement);
  const getInvoker = useCallback(() => invoker.current, []);
  useModalFocus(ref, { onEscape: onClose, getInvoker });
  return createPortal(
    <div className="modal-overlay z-[70] solo-dialog" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`modal-surface solo-dialog-surface max-w-md p-6 ${className}`} onClick={(event) => event.stopPropagation()}>
        {badge && <div className="mb-4">{badge}</div>}
        <h2 id={titleId} className="text-2xl font-bold tracking-tight text-slate-50">{title}</h2>
        {children}
      </div>
    </div>, document.body
  );
}
