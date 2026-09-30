// The pre-roll's way in and out, shared by the web and the television so the
// two rooms dim and come up on the same count. The stylesheets read these
// through custom properties rather than repeating them.
//
// Lights down is a ceiling, not a wait: the first preview starting ends it
// early, because the lights answer the projector and never hold a trailer back.
export const HOUSE_LIGHTS_DOWN_MS = 1900;

// After the feature card, with nothing to hand off to: the pick comes back
// slowly, the way a cinema's lights come up at the end.
export const HOUSE_LIGHTS_UP_MS = 1600;

// Back, Escape or the exit. Somebody asked to leave, so it is brief, and asking
// again while it runs skips it.
export const HOUSE_LIGHTS_EXIT_MS = 550;

// With reduced motion every change is the same short fade.
export const HOUSE_LIGHTS_REDUCED_MS = 250;

export function getHouseLightsTiming(reducedMotion = false) {
  if (reducedMotion) {
    return {
      down: HOUSE_LIGHTS_REDUCED_MS,
      up: HOUSE_LIGHTS_REDUCED_MS,
      exit: HOUSE_LIGHTS_REDUCED_MS,
    };
  }
  return { down: HOUSE_LIGHTS_DOWN_MS, up: HOUSE_LIGHTS_UP_MS, exit: HOUSE_LIGHTS_EXIT_MS };
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}
