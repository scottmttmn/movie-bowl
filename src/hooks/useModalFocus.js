import { useEffect, useRef } from "react";

export default function useModalFocus(ref, { onEscape, getInvoker, active = true }) {
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; }, [onEscape]);
  useEffect(() => {
    if (!active) return undefined;
    const node = ref.current;
    const returnTarget = getInvoker?.();
    const shell = document.querySelector(".app-shell");
    const wasInert = shell?.inert;
    const previousOverflow = document.body.style.overflow;
    if (shell && !shell.contains(node)) shell.inert = true;
    document.body.style.overflow = "hidden";
    const focusable = () => [...node.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
      .filter((element) => !element.closest('[hidden], [inert]') && element.getAttribute("aria-hidden") !== "true");
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        escape.current?.();
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) { event.preventDefault(); node.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown, true);
    if (!node.contains(document.activeElement)) (focusable().find((element) => element.tagName === "INPUT") || focusable()[0] || node).focus();
    return () => {
      window.removeEventListener("keydown", keydown, true);
      if (shell) shell.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      const restoreFocus = () => {
        if (document.querySelector('[aria-modal="true"]')) return;
        const target = returnTarget?.isConnected && !returnTarget.disabled
          ? returnTarget : document.querySelector('[aria-label="Add a movie"]');
        target?.focus();
      };
      restoreFocus();
      // The nav observer re-enables global Add after this modal is removed.
      // Restore after that render too, when the invoker was disabled behind it.
      if (returnTarget?.disabled || !returnTarget?.isConnected) window.requestAnimationFrame(restoreFocus);
    };
  }, [active, getInvoker, ref]);
}
