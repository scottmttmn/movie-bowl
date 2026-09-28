import { useEffect, useRef, useState } from "react";
import DrawRevealStage from "./DrawRevealStage";
import { getDrawRevealAnnouncement } from "../utils/drawReveal";
import { getSoloDrawRevealMethod } from "../utils/soloDrawReveal";

export default function SoloDrawReveal({ run, presentation = "web" }) {
  const [phase, setPhase] = useState("gather");
  const statusRef = useRef(null);
  const method = getSoloDrawRevealMethod(run.preview || run.reveal?.title);
  const announcement = getDrawRevealAnnouncement(run.reveal, phase);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    statusRef.current?.focus();
    const holdFocus = (event) => {
      if (event.key === "Tab" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", holdFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", holdFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <>
      <div ref={statusRef} tabIndex={-1} data-blocks-global-add className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Solo draw. {announcement || `${method.revealPending}…`}
      </div>
      <DrawRevealStage {...run} method={method} presentation={presentation} onPhaseChange={setPhase} />
    </>
  );
}
