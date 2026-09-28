import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import bowlImage from "../assets/movie-bowl.webp";
import {
  getDrawRevealCopy,
  getDrawRevealPhaseAt,
  getDrawRevealProgress,
  getDrawRevealTimeline,
} from "../utils/drawReveal";

// The draw, given the whole screen. The bowl lifts out of the page, the pool
// rises out of it and arranges itself the way the method is about to choose --
// one pile per person, or one crowd -- and then the draw replays: a person,
// then one of their movies; or one title plucked from everything.
//
// Everything that lands comes from `reveal`, which only exists once the draw is
// recorded. Before that the stage may sweep and swirl over the real pool, but
// it never settles. The schedule is getDrawRevealTimeline's, shared with the
// dashboard, which opens the movie when the schedule says the show is over.
// See output/designs/draw-method-reveals.md.

const MAX_PILES = 8;
const MAX_PILE_SLIPS = 6;
const MAX_CROWD = 18;
const LOOP_SWEEP_MS = 130;
const LOOP_FLICKER_MS = 170;
const SWIRL_MS = 450;
const ENTER_MS = 20;

const PERSON_PHASES = new Set(["arrange", "loop", "sweep", "lineup", "turn", "land"]);
const FAN_PHASES = new Set(["fan", "pick", "pinlift"]);
const OPEN_PHASES = new Set(["unfold"]);

// Deterministic scatter, so a re-render mid-flight never reshuffles the crowd.
function scatter(index, seed) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function ordinal(position) {
  const tens = position % 100;
  if (tens >= 11 && tens <= 13) return `${position}th`;
  return `${position}${{ 1: "st", 2: "nd", 3: "rd" }[position % 10] || "th"}`;
}

function useViewport() {
  const read = () => ({ width: window.innerWidth || 390, height: window.innerHeight || 844 });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const onResize = () => setViewport(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

// A long roster would crowd the screen, so the first seven people keep a pile
// each and the rest share one "+N" pile. Pack slips are in every pile.
function getPiles(preview) {
  if (!preview || preview.stage !== "people") return [];
  const shared = preview.sharedCount || 0;
  const toPile = (person) => ({ key: person.key, label: person.label, count: person.count + shared, members: [person.key] });
  if (preview.people.length <= MAX_PILES) return preview.people.map(toPile);
  const kept = preview.people.slice(0, MAX_PILES - 1).map(toPile);
  const rest = preview.people.slice(MAX_PILES - 1);
  return [
    ...kept,
    {
      key: "more",
      label: `+${rest.length}`,
      count: rest.reduce((sum, person) => sum + person.count + shared, 0),
      members: rest.map((person) => person.key),
    },
  ];
}

function getLayout({ width, height }, pileCount) {
  const compact = width < 640;
  const headerH = compact ? 212 : 236;
  const bowlW = Math.round(Math.max(170, Math.min(width * 0.64, (height - headerH) * 0.42, 340)));
  const bowl = { x: (width - bowlW) / 2, y: height - bowlW * 0.9, w: bowlW };
  const mouth = { x: width / 2, y: bowl.y + bowlW * 0.36 };
  const area = { top: headerH + 8, bottom: Math.max(headerH + 120, bowl.y + bowlW * 0.16 - 12) };
  const areaH = area.bottom - area.top;

  const perRow = compact ? 4 : MAX_PILES;
  const rows = Math.max(1, Math.ceil(pileCount / perRow));
  const gap = compact ? 8 : 24;
  const slot = Math.min(compact ? 86 : 150, (width - 32 - gap * (perRow - 1)) / perRow);
  const slipW = Math.round(Math.min(slot * 0.72, 84));
  const slipH = Math.round(slipW * 0.54);
  const stack = Math.max(3, Math.round(slipH * 0.2));
  const cardH = compact ? 46 : 54;
  const rowGap = 16;
  const rowH = (MAX_PILE_SLIPS - 1) * stack + slipH + 10 + cardH;
  const totalH = rows * rowH + (rows - 1) * rowGap;
  const startY = area.top + Math.max(0, (areaH - totalH) / 2);

  const pileSpot = (position) => {
    const row = Math.floor(position / perRow);
    const col = position % perRow;
    const inRow = Math.min(perRow, pileCount - row * perRow);
    const rowW = inRow * slot + (inRow - 1) * gap;
    const baseY = startY + row * (rowH + rowGap) + (MAX_PILE_SLIPS - 1) * stack + slipH / 2;
    return { x: (width - rowW) / 2 + col * (slot + gap) + slot / 2, baseY, cardY: baseY + slipH / 2 + 10 };
  };

  const heroW = Math.min(width - 48, 460);
  const heroH = Math.round(heroW * 0.48);
  const center = { x: width / 2, y: area.top + areaH / 2 };
  const fanScale = compact ? 1.5 : 1.6;
  const lastRowW = Math.min(perRow, pileCount) * slot + (Math.min(perRow, pileCount) - 1) * gap;

  return {
    compact,
    headerH,
    bowl,
    mouth,
    slot,
    slipW,
    slipH,
    stack,
    cardW: slot - 4,
    cardH,
    pileSpot,
    fan: { x: center.x, y: center.y + slipH * 0.3, scale: fanScale },
    fanCardY: center.y + slipH * 0.3 + (slipH * fanScale) / 2 + 22,
    hero: { x: (width - heroW) / 2, y: Math.max(area.top, center.y - heroH / 2), w: heroW, h: heroH },
    crowd: {
      x: Math.max(24, (width - 700) / 2),
      y: area.top + 8,
      w: Math.min(width - 48, 700) - slipW,
      h: Math.max(40, areaH - slipH - 16),
    },
    axis: {
      x: (width - lastRowW) / 2,
      y: pileSpot(Math.max(0, pileCount - 1)).cardY + cardH + 12,
      w: lastRowW,
    },
  };
}

function transform({ x, y, r = 0, s = 1 }, w, h) {
  return `translate(${(x - w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s})`;
}

function getHeroTitleSize(title, heroH) {
  const length = String(title || "").length;
  const scale = length > 32 ? 0.6 : length > 18 ? 0.78 : 1;
  return Math.round(heroH * 0.3 * scale);
}

export default function DrawRevealStage({
  method,
  preview = null,
  previewAt = null,
  reveal = null,
  resultAt = null,
  startedAt,
  title = "",
  originRect = null,
  reducedMotion = false,
  onPhaseChange,
}) {
  const viewport = useViewport();
  const timeline = useMemo(
    () => getDrawRevealTimeline({ preview, previewAt, reveal, resultAt, reducedMotion }),
    [preview, previewAt, reveal, resultAt, reducedMotion]
  );
  const shape = timeline.preview;
  const stage = timeline.stage;
  const piles = useMemo(() => getPiles(shape), [shape]);
  const person = reveal?.person || null;
  const personMode = shape?.mode || "random";

  const [phase, setPhase] = useState("gather");
  const [entered, setEntered] = useState(false);
  const [sweep, setSweep] = useState(-1);
  const [flick, setFlick] = useState(-1);
  const [swirl, setSwirl] = useState(0);
  const sweepRef = useRef(-1);
  const flickRef = useRef(-1);

  const elapsedNow = () => Date.now() - startedAt;

  // One frame at the dashboard's bowl first, so the lift out of the page is a
  // move rather than a cut.
  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), ENTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const now = elapsedNow();
    setPhase(getDrawRevealPhaseAt(timeline, now));
    const ids = timeline.phases
      .filter((entry) => entry.at > now)
      .map((entry) => window.setTimeout(() => setPhase(entry.name), entry.at - now));
    return () => ids.forEach((id) => window.clearTimeout(id));
    // elapsedNow reads startedAt, which is fixed for the life of the stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // Display order of the piles. Rotation lines them up the way its draw ranked
  // them once the result says so; until then they stand in pool order.
  const queue = person?.queue || null;
  const lined = Boolean(queue) && ["lineup", "turn", "land", "fan", "pick", "pinlift", "unfold"].includes(phase);
  const order = useMemo(() => {
    const positions = piles.map((_, index) => index);
    if (!lined) return positions;
    const rank = (pile) => Math.min(...pile.members.map((key) => {
      const found = queue.findIndex((entry) => entry.key === key);
      return found < 0 ? Infinity : found;
    }));
    return positions.sort((a, b) => rank(piles[a]) - rank(piles[b]));
  }, [piles, lined, queue]);
  const positionOf = (pileIndex) => order.indexOf(pileIndex);

  const chosenPile = person ? piles.findIndex((pile) => pile.members.includes(person.chosenKey)) : -1;
  const chosenPosition = chosenPile >= 0 ? positionOf(chosenPile) : -1;

  // The light sweeps along the row while the draw is in flight, then slows onto
  // the person who was drawn -- at least one full lap, so the landing reads as
  // a pick. Rotation never sweeps: nothing about its choice was left to chance.
  useEffect(() => {
    if (stage !== "people" || personMode !== "random" || piles.length === 0) return undefined;
    const n = piles.length;
    const set = (index) => {
      sweepRef.current = index;
      setSweep(index);
    };
    if (phase === "loop" && !reducedMotion) {
      const id = window.setInterval(() => set((sweepRef.current + 1) % n), LOOP_SWEEP_MS);
      return () => window.clearInterval(id);
    }
    if (phase === "sweep" && chosenPosition >= 0) {
      if (reducedMotion) {
        set(chosenPosition);
        return undefined;
      }
      const sweepAt = timeline.phases.find((entry) => entry.name === "sweep")?.at ?? 0;
      const landAt = timeline.phases.find((entry) => entry.name === "land")?.at ?? sweepAt + 1300;
      const span = Math.max(300, landAt - sweepAt - 80);
      const current = Math.max(0, sweepRef.current);
      const steps = n + ((chosenPosition - current - 1 + n) % n) + 1;
      const ids = [];
      for (let step = 1; step <= steps; step += 1) {
        const delay = Math.round(span * (step / steps) ** 1.7);
        ids.push(window.setTimeout(() => set((current + step) % n), delay));
      }
      return () => ids.forEach((id) => window.clearTimeout(id));
    }
    return undefined;
  }, [phase, stage, personMode, piles.length, chosenPosition, reducedMotion, timeline]);

  const slips = useMemo(() => {
    if (stage === "people") {
      return piles.flatMap((pile, pileIndex) =>
        Array.from({ length: Math.min(pile.count, MAX_PILE_SLIPS) }, (_, k) => ({ pileIndex, k }))
      );
    }
    const count = Math.max(3, Math.min(shape?.total || 12, MAX_CROWD));
    return Array.from({ length: count }, (_, k) => ({ pileIndex: -1, k }));
  }, [stage, piles, shape]);

  const chosenSlips = chosenPile >= 0 ? slips.filter((slip) => slip.pileIndex === chosenPile).length : 0;
  const isPinned = reveal?.title?.mode === "pinned";
  const pickK = chosenSlips === 0 ? -1 : isPinned ? chosenSlips - 1 : Math.floor(chosenSlips / 2);
  // Without a person stage one slip is plucked from whatever is on screen.
  const pluckIndex = Math.floor(slips.length * 0.6);

  // The crowd swirls and a light flickers between slips while the draw is in
  // flight, then slows onto the one that is plucked.
  const flickering = phase === "flicker" || (phase === "loop" && stage === "bowl");
  useEffect(() => {
    const set = (index) => {
      flickRef.current = index;
      setFlick(index);
    };
    if (!flickering || slips.length === 0) return undefined;
    if (phase === "loop") {
      if (reducedMotion) return undefined;
      let step = 0;
      const id = window.setInterval(() => {
        step += 1;
        set(Math.floor(scatter(step, 17) * slips.length));
      }, LOOP_FLICKER_MS);
      return () => window.clearInterval(id);
    }
    if (reducedMotion) {
      set(pluckIndex);
      return undefined;
    }
    const flickerAt = timeline.phases.find((entry) => entry.name === "flicker")?.at ?? 0;
    const pluckAt = timeline.phases.find((entry) => entry.name === "pluck")?.at ?? flickerAt + 1300;
    const span = Math.max(300, pluckAt - flickerAt - 80);
    const steps = 12;
    const ids = [];
    for (let step = 1; step <= steps; step += 1) {
      let index = step === steps ? pluckIndex : Math.floor(scatter(step, 29) * slips.length);
      if (index === pluckIndex && step !== steps) index = (index + 1) % slips.length;
      ids.push(window.setTimeout(() => set(index), Math.round(span * (step / steps) ** 1.7)));
    }
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [flickering, phase, slips.length, pluckIndex, reducedMotion, timeline]);

  useEffect(() => {
    const swirling = stage === "bowl" && ["arrange", "loop", "flicker"].includes(phase);
    if (!swirling || reducedMotion) return undefined;
    const id = window.setInterval(() => setSwirl((value) => value + 1), SWIRL_MS);
    return () => window.clearInterval(id);
  }, [stage, phase, reducedMotion]);

  const layout = getLayout(viewport, piles.length);
  const { slipW, slipH } = layout;
  const heroCenter = { x: layout.hero.x + layout.hero.w / 2, y: layout.hero.y + layout.hero.h / 2 };
  const personRoute = stage === "people" && chosenPile >= 0;

  const originBowl = originRect
    ? (() => {
        const side = Math.min(originRect.width, originRect.height);
        return {
          x: originRect.left + (originRect.width - side) / 2,
          y: originRect.top + (originRect.height - side) / 2,
          w: side,
        };
      })()
    : layout.bowl;
  const bowl = entered ? layout.bowl : originBowl;

  const placeSlip = (slip, index) => {
    const hidden = {
      x: layout.mouth.x + (scatter(index, 1) - 0.5) * layout.bowl.w * 0.3,
      y: layout.mouth.y + 8,
      r: (scatter(index, 2) - 0.5) * 50,
      s: 0.6,
      o: 0,
      z: 5,
      d: 0,
    };
    const crowd = (seed) => ({
      x: layout.crowd.x + slipW / 2 + scatter(index, seed * 3 + 3) * layout.crowd.w,
      y: layout.crowd.y + slipH / 2 + scatter(index, seed * 3 + 4) * layout.crowd.h,
      r: (scatter(index, seed * 3 + 5) - 0.5) * 80,
      s: 1,
      o: 1,
      z: 6,
      d: 0,
    });
    const plucked = { x: heroCenter.x, y: heroCenter.y, r: -3, s: (layout.hero.w * 0.55) / slipW, o: 1, z: 35, d: 0 };

    if (phase === "gather") return hidden;
    if (phase === "rise") return { ...crowd(0), d: index * 26 };
    if (stage === "bowl") {
      if (phase === "pluck") return index === pluckIndex ? plucked : { ...hidden, d: Math.round(scatter(index, 9) * 260) };
      if (OPEN_PHASES.has(phase)) return index === pluckIndex ? { ...plucked, o: 0 } : hidden;
      return { ...crowd(swirl + 1), d: index * 12 };
    }

    const { pileIndex, k } = slip;
    const spot = layout.pileSpot(positionOf(pileIndex));
    const pile = {
      x: spot.x + (scatter(index, 6) - 0.5) * slipW * 0.14,
      y: spot.baseY - k * layout.stack,
      r: (scatter(index, 7) - 0.5) * 10,
      s: 1,
      o: 1,
      z: 6 + k,
      d: 0,
    };
    const mine = pileIndex === chosenPile;
    const isPick = mine && k === pickK;
    const lifted = { ...pile, y: pile.y - slipH * 0.7, s: 1.1, z: 20 + k };
    const pickSpot = { x: layout.fan.x, y: layout.fan.y - slipH * 1.7, r: -2, s: layout.fan.scale * 1.25, o: 1, z: 35, d: 0 };

    if (!personRoute) {
      if (phase === "pluck") return index === pluckIndex ? plucked : { ...hidden, d: Math.round(scatter(index, 9) * 260) };
      if (OPEN_PHASES.has(phase)) return index === pluckIndex ? { ...plucked, o: 0 } : hidden;
      return phase === "arrange" ? { ...pile, d: pileIndex * 90 + k * 45 } : pile;
    }
    if (phase === "arrange") return { ...pile, d: pileIndex * 90 + k * 45 };
    if (phase === "loop" || phase === "sweep" || phase === "lineup") return pile;
    if (phase === "turn") return mine ? lifted : { ...pile, o: 0.3 };
    if (phase === "land") {
      if (!mine) return { ...hidden, d: positionOf(pileIndex) * 70 + k * 25 };
      return personMode === "turn" ? lifted : { ...pile, y: pile.y - 10, z: 20 + k };
    }
    if (!mine) return hidden;
    if (phase === "fan") {
      const offset = k - (chosenSlips - 1) / 2;
      return {
        x: layout.fan.x + offset * slipW * layout.fan.scale * 0.86,
        y: layout.fan.y + offset * offset * 7,
        r: offset * 9,
        s: layout.fan.scale,
        o: 1,
        z: 20 + k,
        d: k * 60,
      };
    }
    if (phase === "pick") return isPick ? pickSpot : { ...hidden, d: k * 40 };
    if (phase === "pinlift") return isPick ? { ...pickSpot, y: layout.fan.y - slipH * 1.2, s: layout.fan.scale * 1.3 } : { ...hidden, d: k * 40 };
    if (OPEN_PHASES.has(phase)) return isPick ? { ...pickSpot, o: 0 } : hidden;
    return pile;
  };

  const progress = getDrawRevealProgress(reveal, phase);
  const copy = getDrawRevealCopy(reveal);
  let lead = `${method.revealPending}…`;
  let pending = true;
  let follow = "";
  if (person && progress.personLanded) {
    lead = copy.person;
    pending = false;
    if (progress.titleLanded) follow = copy.title;
  } else if (!person && progress.titleLanded) {
    lead = copy.title;
    pending = false;
  }

  const stepState = (index) => {
    if (method.steps.length === 1) return progress.titleLanded ? "done" : "now";
    if (index === 0) return progress.personLanded || (progress.titleLanded && !person) ? "done" : "now";
    return progress.titleLanded ? "done" : progress.personLanded ? "now" : "";
  };

  const showCards = stage === "people"
    && (["arrange", "loop", "flicker"].includes(phase) || (personRoute && (PERSON_PHASES.has(phase) || FAN_PHASES.has(phase))));
  const cardFor = (pile, pileIndex) => {
    const position = positionOf(pileIndex);
    const spot = layout.pileSpot(position);
    const chosen = pileIndex === chosenPile;
    let x = spot.x - layout.cardW / 2;
    let y = spot.cardY;
    let opacity = showCards ? 1 : 0;
    let scale = 1;
    const classes = [];
    let label = pile.label;
    let sub = "";

    if (personMode === "turn") classes.push("is-ticket");
    if (lined && pile.members.length === 1) {
      const entry = queue.findIndex((item) => item.key === pile.members[0]);
      if (entry >= 0) sub = queue[entry].neverDrawn ? "Never drawn" : entry === 0 ? "Waited longest" : `${ordinal(entry + 1)} in line`;
    }

    if (personMode === "random" && ["loop", "sweep"].includes(phase) && sweep === position) {
      classes.push("is-active");
      scale = 1.08;
      y -= 4;
    }
    if (personRoute) {
      if (["turn", "land"].includes(phase)) {
        if (chosen) {
          classes.push("is-chosen");
          scale = 1.1;
          y -= 6;
        } else {
          opacity = phase === "turn" ? 0.35 : 0;
        }
      }
      if (FAN_PHASES.has(phase)) {
        if (chosen) {
          classes.push("is-chosen");
          x = viewport.width / 2 - layout.cardW / 2;
          y = layout.fanCardY;
        } else {
          opacity = 0;
        }
      }
      // A person hidden in the "+N" pile is named when that pile is drawn.
      if (chosen && pile.members.length > 1 && progress.personLanded) label = person.chosenLabel;
    }

    return {
      key: pile.key,
      label,
      sub,
      className: `draw-reveal-card ${classes.join(" ")}`,
      style: {
        width: layout.cardW,
        height: layout.cardH,
        opacity,
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale})`,
        transitionDelay: phase === "arrange" ? `${position * 90 + 250}ms` : "0ms",
      },
    };
  };

  let bowlClass = "";
  if (phase === "gather" || phase === "rise") bowlClass = "is-shaking";
  else if (stage === "bowl" && ["arrange", "loop", "flicker"].includes(phase)) bowlClass = "is-rumbling";
  else if (["land", "pick", "pinlift", "pluck"].includes(phase)) bowlClass = "is-settling";

  const showAxis = lined && personMode === "turn" && ["lineup", "turn"].includes(phase);
  const heroTitle = title || "";

  return createPortal(
    <div
      aria-hidden="true"
      className={`draw-reveal-stage ${entered ? "is-entered" : ""} ${layout.compact ? "is-compact" : ""}`}
      data-method={method.id}
      data-phase={phase}
      data-stage={stage || "pending"}
    >
      <div className="draw-reveal-veil" />
      <div
        className={`draw-reveal-glow ${progress.personLanded || progress.titleLanded ? "is-lit" : ""}`}
        style={{ left: bowl.x - bowl.w * 0.15, top: bowl.y + bowl.w * 0.1, width: bowl.w * 1.3, height: bowl.w * 0.9 }}
      />

      <div className="draw-reveal-header" style={{ height: layout.headerH }}>
        <ol className="draw-reveal-steps">
          {method.steps.map((step, index) => (
            <li key={step.title} className={`draw-reveal-step ${stepState(index)}`}>
              <span className="draw-reveal-step-num">{index + 1}</span>
              {step.title}
            </li>
          ))}
        </ol>
        <p className="draw-reveal-eyebrow">{method.label} draw</p>
        <p className={`draw-reveal-lead ${pending ? "is-pending" : ""}`}>{lead}</p>
        <p className="draw-reveal-follow">{follow}</p>
      </div>

      {slips.map((slip, index) => {
        const place = placeSlip(slip, index);
        const lit =
          (stage === "bowl" || !personRoute) && flickering
            ? flick === index
            : (phase === "pluck" && index === pluckIndex)
              || (personRoute && slip.pileIndex === chosenPile && slip.k === pickK && ["pick", "pinlift"].includes(phase));
        return (
          <span
            key={`${slip.pileIndex}:${slip.k}`}
            className={`draw-reveal-slip ${lit ? "is-lit" : ""}`}
            style={{
              width: slipW,
              height: slipH,
              opacity: place.o,
              zIndex: place.z,
              transform: transform(place, slipW, slipH),
              transitionDelay: `${place.d || 0}ms`,
            }}
          >
            {isPinned && slip.pileIndex === chosenPile && slip.k === pickK && <span className="draw-reveal-pin" />}
          </span>
        );
      })}

      <div
        className={`draw-reveal-bowl ${bowlClass}`}
        style={{ left: bowl.x, top: bowl.y, width: bowl.w, height: bowl.w }}
      >
        <img src={bowlImage} alt="" />
      </div>

      {stage === "people" && piles.map((pile, pileIndex) => {
        const card = cardFor(pile, pileIndex);
        return (
          <span key={card.key} className={card.className} style={card.style}>
            <span className="draw-reveal-card-name">{card.label}</span>
            {card.sub && <span className="draw-reveal-card-sub">{card.sub}</span>}
          </span>
        );
      })}

      {showAxis && (
        <div className="draw-reveal-axis" style={{ left: layout.axis.x, top: layout.axis.y, width: layout.axis.w }}>
          <span>← Waited longest</span>
          <span>Drawn most recently</span>
        </div>
      )}

      {stage === "bowl" && ["rise", "arrange", "loop", "flicker"].includes(phase) && shape?.total > 0 && (
        <p className="draw-reveal-count" style={{ top: layout.headerH - 4 }}>
          {shape.total === 1 ? "1 movie" : `${shape.total} movies`}
        </p>
      )}

      {OPEN_PHASES.has(phase) && (
        <div
          className="draw-reveal-hero"
          style={{ left: layout.hero.x, top: layout.hero.y, width: layout.hero.w, height: layout.hero.h }}
        >
          <span className="draw-reveal-hero-half draw-reveal-hero-left" />
          <span className="draw-reveal-hero-half draw-reveal-hero-right" />
          <span className="draw-reveal-hero-title" style={{ fontSize: getHeroTitleSize(heroTitle, layout.hero.h) }}>
            {heroTitle}
          </span>
        </div>
      )}
    </div>,
    document.body
  );
}
