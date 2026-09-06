import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = "[data-tv-focusable]:not(:disabled)";
const BACK_KEY_CODE = 461;

function isFocusable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (
    element.hidden ||
    element.getAttribute("aria-hidden") === "true" ||
    element.closest('[aria-hidden="true"]')
  ) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function getFocusableElements() {
  return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable);
}

function getCenter(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function rangesOverlap(startA, endA, startB, endB) {
  return Math.min(endA, endB) - Math.max(startA, startB) > 1;
}

// A screen is laid out as regions -- a header band, the stage, the settings
// column beside it, the watched strip below -- and which region something is in
// answers a question its own rectangle cannot. The draw button spans the whole
// stage, so by its own geometry a card below it looks about as "right" as the
// panel beside it. By region the question is easy: the settings column is beside
// the stage, the strip is under it. Elements outside any region keep the plain
// geometric behaviour.
function getRegion(element) {
  return element.closest("[data-tv-nav-region]");
}

// Regions are neighbours in a direction when one genuinely sits that way from
// the other and they still share the perpendicular axis: the settings column is
// to the right of the stage and level with it; the strip is below and spans it.
function regionsAreNeighbours(fromRect, toRect, direction, isHorizontal) {
  const unmeasured =
    (fromRect.width <= 0 && fromRect.height <= 0) ||
    (toRect.width <= 0 && toRect.height <= 0);
  if (unmeasured) return true;

  const beyond =
    (direction === "left" && toRect.right <= fromRect.left + 1) ||
    (direction === "right" && toRect.left >= fromRect.right - 1) ||
    (direction === "up" && toRect.bottom <= fromRect.top + 1) ||
    (direction === "down" && toRect.top >= fromRect.bottom - 1);
  if (!beyond) return false;

  return isHorizontal
    ? rangesOverlap(fromRect.top, fromRect.bottom, toRect.top, toRect.bottom)
    : rangesOverlap(fromRect.left, fromRect.right, toRect.left, toRect.right);
}

function getClippingScroller(element) {
  const rect = element.getBoundingClientRect();
  let parent = element.parentElement;

  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) {
      const bounds = parent.getBoundingClientRect();
      const clipped =
        rect.right <= bounds.left + 1 ||
        rect.left >= bounds.right - 1 ||
        rect.bottom <= bounds.top + 1 ||
        rect.top >= bounds.bottom - 1;
      if (clipped) return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}

function hasMeasurableLayout(current, candidates) {
  const currentRect = current.getBoundingClientRect();
  if (currentRect.width <= 0 && currentRect.height <= 0) return false;

  return candidates.some((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });
}

function findDirectionalCandidate(current, candidates, direction) {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = getCenter(currentRect);
  const isHorizontal = direction === "left" || direction === "right";
  const currentGroup = current.dataset.tvNavGroup || "";

  const currentRegion = getRegion(current);
  const currentRegionRect = currentRegion?.getBoundingClientRect();

  const directionalCandidates = candidates
    .filter((candidate) => {
      if (candidate === current) return false;

      const scroller = getClippingScroller(candidate);
      if (scroller && !scroller.contains(current)) return false;

      const candidateRegion = getRegion(candidate);
      if (!currentRegion || !candidateRegion || candidateRegion === currentRegion) {
        return true;
      }
      return regionsAreNeighbours(
        currentRegionRect,
        candidateRegion.getBoundingClientRect(),
        direction,
        isHorizontal
      );
    })
    .map((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      const center = getCenter(candidateRect);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const isDirectional =
        (direction === "left" && candidateRect.right <= currentRect.left + 1) ||
        (direction === "right" && candidateRect.left >= currentRect.right - 1) ||
        (direction === "up" && candidateRect.bottom <= currentRect.top + 1) ||
        (direction === "down" && candidateRect.top >= currentRect.bottom - 1);

      if (!isDirectional) return null;

      const primaryDistance = isHorizontal ? Math.abs(dx) : Math.abs(dy);
      const crossDistance = isHorizontal ? Math.abs(dy) : Math.abs(dx);
      const isInLane = isHorizontal
        ? rangesOverlap(
            currentRect.top,
            currentRect.bottom,
            candidateRect.top,
            candidateRect.bottom
          )
        : rangesOverlap(
            currentRect.left,
            currentRect.right,
            candidateRect.left,
            candidateRect.right
          );

      return {
        candidate,
        primaryDistance,
        crossDistance,
        isInLane,
        isSameGroup:
          Boolean(currentGroup) && candidate.dataset.tvNavGroup === currentGroup,
      };
    })
    .filter(Boolean);

  const rank = (items, crossWeight) =>
    [...items].sort(
      (a, b) =>
        a.primaryDistance +
        a.crossDistance * crossWeight -
        (b.primaryDistance + b.crossDistance * crossWeight)
    );

  const sameGroupLane = directionalCandidates.filter(
    (item) => item.isInLane && item.isSameGroup
  );
  if (sameGroupLane.length > 0) {
    return rank(sameGroupLane, 0.35)[0].candidate;
  }

  const lane = directionalCandidates.filter((item) => item.isInLane);
  if (lane.length > 0) {
    return rank(lane, 0.35)[0].candidate;
  }

  const groupSpansTravelAxis =
    Boolean(currentGroup) &&
    candidates.some((candidate) => {
      if (candidate === current || candidate.dataset.tvNavGroup !== currentGroup) {
        return false;
      }
      const peerCenter = getCenter(candidate.getBoundingClientRect());
      return isHorizontal
        ? Math.abs(peerCenter.x - currentCenter.x) > 1
        : Math.abs(peerCenter.y - currentCenter.y) > 1;
    });

  // Horizontal movement inside a row or action cluster should stop at its
  // visual edge instead of escaping diagonally to unrelated page controls.
  if (isHorizontal && groupSpansTravelAxis) return null;

  // A narrow cone allows movement between staggered sections while preventing
  // a right-arrow press at the end of a row from jumping to unrelated chrome.
  const inCone = directionalCandidates.filter(
    (item) => item.crossDistance <= item.primaryDistance * 1.15
  );
  const sameGroupCone = inCone.filter((item) => item.isSameGroup);
  if (sameGroupCone.length > 0) {
    return rank(sameGroupCone, 2.5)[0].candidate;
  }
  if (inCone.length > 0) {
    return rank(inCone, 2.5)[0].candidate;
  }

  const byAlignment = [...directionalCandidates].sort(
    (a, b) =>
      a.crossDistance / Math.max(a.primaryDistance, 1) -
      b.crossDistance / Math.max(b.primaryDistance, 1)
  );
  return byAlignment[0]?.candidate || null;
}

function findFallbackCandidate(current, candidates, direction) {
  const currentIndex = candidates.indexOf(current);
  if (currentIndex === -1) return candidates[0] || null;
  const step = direction === "left" || direction === "up" ? -1 : 1;
  return candidates[currentIndex + step] || null;
}

export default function useTvSpatialNavigation({ scopeKey, onBack }) {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    const focusInitialElement = window.setTimeout(() => {
      const focusable = getFocusableElements();
      const preferred = focusable.find(
        (element) => element.dataset.tvAutofocus === "true"
      );
      (preferred || focusable[0])?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      const isBack =
        event.key === "Escape" ||
        event.key === "Backspace" ||
        Number(event.keyCode) === BACK_KEY_CODE;

      if (isBack && onBackRef.current) {
        event.preventDefault();
        onBackRef.current();
        return;
      }

      const isSelect = event.key === "Enter" || Number(event.keyCode) === 13;
      if (
        isSelect &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches(FOCUSABLE_SELECTOR)
      ) {
        event.preventDefault();
        document.activeElement.click();
        return;
      }

      const directionByKey = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const direction = directionByKey[event.key];
      if (!direction) return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      event.preventDefault();
      const current = focusable.includes(document.activeElement)
        ? document.activeElement
        : focusable[0];
      const next = hasMeasurableLayout(current, focusable)
        ? findDirectionalCandidate(current, focusable, direction)
        : findFallbackCandidate(current, focusable, direction);

      next?.focus();
      next?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusInitialElement);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [scopeKey]);
}
