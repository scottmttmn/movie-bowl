import { useEffect, useRef, useState } from "react";
import bowlImage from "../assets/movie-bowl.webp";

function BowlMark({ size = "md" }) {
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";
  const image = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-slate-950/70 ${box}`}>
      <img src={bowlImage} alt="" className={`${image} object-contain`} />
    </span>
  );
}

/**
 * Which owned bowl an invitation is for, as one row rather than a grid of every
 * bowl: the choice is made once, and a grid pushed the email field below the
 * fold for it. The row names the chosen bowl and drops the others down under it.
 * With a single owned bowl there is nothing to choose, so the row is not a
 * control at all.
 */
export default function InviteBowlPicker({ bowls, selectedId, onSelect, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef(new Map());
  const selected = bowls.find((bowl) => bowl.id === selectedId) || null;

  useEffect(() => {
    if (!isOpen) return undefined;
    // Land on the current bowl, so arrow keys start from what is chosen.
    const start = optionRefs.current.get(selectedId) || optionRefs.current.get(bowls[0]?.id);
    start?.focus();

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
    // Only on opening: a later selection closes the list anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleListKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const ids = bowls.map((bowl) => bowl.id);
    const current = ids.findIndex((id) => optionRefs.current.get(id) === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = ids[(current + step + ids.length) % ids.length];
    optionRefs.current.get(next)?.focus();
  };

  const name = (
    <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${selected ? "text-slate-50" : "text-slate-400"}`}>
      {selected ? selected.name : "Choose a bowl"}
    </span>
  );

  if (bowls.length === 1) {
    return (
      <div className="bowl-choice cursor-default" aria-label={`Invite to ${bowls[0].name}`} role="group">
        <BowlMark />
        {name}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="bowl-choice w-full text-left"
        data-empty={selected ? undefined : "true"}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selected ? `Invite to ${selected.name}, change bowl` : "Choose a bowl to invite to"}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <BowlMark />
        {name}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`mr-2 h-5 w-5 shrink-0 motion-safe:transition-transform ${isOpen ? "rotate-180 text-rose-300" : "text-slate-400"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label="Invite to"
          className="bowl-choice-list"
          onKeyDown={handleListKeyDown}
        >
          {bowls.map((bowl) => {
            const isSelected = bowl.id === selectedId;
            return (
              <button
                key={bowl.id}
                ref={(node) => {
                  if (node) optionRefs.current.set(bowl.id, node);
                  else optionRefs.current.delete(bowl.id);
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                className="bowl-choice-option"
                onClick={() => {
                  onSelect(bowl.id);
                  close();
                }}
              >
                <BowlMark size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{bowl.name}</span>
                {isSelected && (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1 h-5 w-5 shrink-0 text-rose-300" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
