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

  const directionalCandidates = candidates
    .filter((candidate) => candidate !== current)
    .map((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      const center = getCenter(candidateRect);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const isDirectional =
        (direction === "left" && dx < -1) ||
        (direction === "right" && dx > 1) ||
        (direction === "up" && dy < -1) ||
        (direction === "down" && dy > 1);

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

  const hasGroupPeers =
    Boolean(currentGroup) &&
    candidates.some(
      (candidate) =>
        candidate !== current && candidate.dataset.tvNavGroup === currentGroup
    );

  // Horizontal movement inside a row or action cluster should stop at its
  // visual edge instead of escaping diagonally to unrelated page controls.
  if (isHorizontal && hasGroupPeers) return null;

  // A narrow cone allows movement between staggered sections while preventing
  // a right-arrow press at the end of a row from jumping to unrelated chrome.
  const inCone = directionalCandidates.filter(
    (item) => item.crossDistance <= item.primaryDistance * 1.15
  );
  const sameGroupCone = inCone.filter((item) => item.isSameGroup);
  if (sameGroupCone.length > 0) {
    return rank(sameGroupCone, 2.5)[0].candidate;
  }

  return rank(inCone, 2.5)[0]?.candidate || null;
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
