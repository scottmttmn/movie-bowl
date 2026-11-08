import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { findHelpTarget } from "../utils/helpLanding";

const WAIT_MS = 5000;
const RING_MS = 4000;

// Where the help panel sends someone, it says what it meant: the element id
// rides in the navigation's state, and this rings it once on arrival. Pages
// draw their sections after their data loads, so it waits for the element a
// few seconds and gives up quietly -- an owner-only section a member cannot
// see simply is not there, and the page itself is still the answer.
export default function HelpLanding() {
  const location = useLocation();
  const targetId = location.state?.helpTarget || null;

  useEffect(() => {
    if (!targetId) return undefined;
    let ringed = null;
    let clearTimer = null;
    const started = Date.now();
    const poll = window.setInterval(() => {
      const element = findHelpTarget(targetId, document);
      if (!element) {
        if (Date.now() - started > WAIT_MS) window.clearInterval(poll);
        return;
      }
      window.clearInterval(poll);
      ringed = element;
      element.scrollIntoView({ block: "center" });
      element.classList.add("help-target");
      clearTimer = window.setTimeout(() => element.classList.remove("help-target"), RING_MS);
    }, 100);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(clearTimer);
      ringed?.classList.remove("help-target");
    };
  }, [targetId, location.key]);

  return null;
}
