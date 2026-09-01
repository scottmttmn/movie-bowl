import { useEffect, useRef } from "react";

export default function useModalFocus(ref, { onEscape, getInvoker, active = true }) {
  const escape = useRef(onEscape);
  const scrollLock = useRef({ position: null, resetFrame: null });
  useEffect(() => { escape.current = onEscape; }, [onEscape]);
  useEffect(() => {
    if (!active) return undefined;
    const lock = scrollLock.current;
    if (lock.resetFrame) {
      window.cancelAnimationFrame(lock.resetFrame);
      lock.resetFrame = null;
    }
    const node = ref.current;
    const returnTarget = getInvoker?.();
    const shell = document.querySelector(".app-shell");
    const wasInert = shell?.inert;
    const root = document.documentElement;
    const body = document.body;
    const position = lock.position || { x: window.scrollX, y: window.scrollY };
    lock.position = position;
    const { x: scrollX, y: scrollY } = position;
    const previousRootStyles = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };
    const previousBodyStyles = {
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    if (shell && !shell.contains(node)) shell.inert = true;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
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
      Object.assign(root.style, previousRootStyles);
      Object.assign(body.style, previousBodyStyles);
      if (scrollX || scrollY) window.scrollTo(scrollX, scrollY);
      lock.resetFrame = window.requestAnimationFrame(() => {
        lock.position = null;
        lock.resetFrame = null;
      });
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
