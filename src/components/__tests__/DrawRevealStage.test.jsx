import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DrawRevealStage from "../DrawRevealStage";
import { getDrawMethod } from "../../utils/drawMethods";

const people = [
  { key: "user:sam", label: "Sam", count: 3 },
  { key: "user:alex", label: "Alex", count: 1 },
  { key: "user:jo", label: "Jo", count: 2 },
];

function preview(methodId, mode = "random", roster = people) {
  return {
    methodId,
    stage: "people",
    mode,
    people: roster,
    sharedCount: 0,
    total: roster.reduce((sum, person) => sum + person.count, 0),
  };
}

function personReveal(methodId, mode, extra = {}) {
  return {
    methodId,
    person: { mode, people, chosenKey: "user:alex", chosenLabel: "Alex", ...extra },
    title: { mode: "random", scope: "person", personLabel: "Alex", count: 1 },
  };
}

function stage() {
  return document.querySelector(".draw-reveal-stage");
}

function cardTexts(selector = ".draw-reveal-card") {
  return Array.from(document.querySelectorAll(selector)).map((node) => node.textContent);
}

function renderStage(props) {
  const startedAt = Date.now();
  const utils = render(
    <DrawRevealStage method={getDrawMethod(props.methodId || "person_first")} startedAt={startedAt} {...props} />
  );
  return {
    ...utils,
    update: (next) => utils.rerender(
      <DrawRevealStage
        method={getDrawMethod(props.methodId || "person_first")}
        startedAt={startedAt}
        {...props}
        {...next}
      />
    ),
  };
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("DrawRevealStage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("names the method's steps and what it is doing while the draw is in flight", async () => {
    renderStage({ methodId: "rotation" });
    expect(stage()).toHaveAttribute("aria-hidden", "true");
    expect(stage()).toHaveTextContent("Whoever has waited longest");
    expect(stage()).toHaveTextContent("One of their movies");
    expect(stage()).toHaveTextContent("Rotation draw");
    expect(stage()).toHaveTextContent("Finding whoever has waited longest…");
    await advance(500);
    expect(stage()).toHaveAttribute("data-phase", "rise");
  });

  it("sweeps real names while in flight but never lands until the result is in", async () => {
    const { update } = renderStage({ methodId: "person_first", preview: preview("person_first"), previewAt: 0 });
    const seen = new Set();
    for (let elapsed = 0; elapsed < 6000; elapsed += 50) {
      await advance(50);
      const active = document.querySelector(".draw-reveal-card.is-active");
      if (active) seen.add(active.textContent);
      expect(document.querySelector(".draw-reveal-card.is-chosen")).toBeNull();
    }
    expect(seen).toEqual(new Set(["Sam", "Alex", "Jo"]));
    expect(stage()).toHaveAttribute("data-phase", "loop");

    update({ reveal: personReveal("person_first", "random"), resultAt: 6000 });
    // Lands one sweep after the result, not before.
    await advance(1299);
    expect(document.querySelector(".draw-reveal-card.is-chosen")).toBeNull();
    await advance(1);
    expect(cardTexts(".draw-reveal-card.is-chosen")).toEqual(["Alex"]);
    expect(stage()).toHaveTextContent("Alex, at random");
  });

  it("gives every person one identical tag, however many movies they added", async () => {
    renderStage({ methodId: "person_first", preview: preview("person_first"), previewAt: 0 });
    await advance(1000);
    const cards = Array.from(document.querySelectorAll(".draw-reveal-card"));
    expect(cards.map((card) => card.textContent)).toEqual(["Sam", "Alex", "Jo"]);
    expect(new Set(cards.map((card) => card.style.width)).size).toBe(1);
    expect(new Set(cards.map((card) => card.style.height)).size).toBe(1);
    // The piles above them are not the same: three slips, one, two.
    expect(document.querySelectorAll(".draw-reveal-slip")).toHaveLength(6);
  });

  it("lines rotation up in the draw's order and steps the turn forward without sweeping", async () => {
    const reveal = personReveal("rotation", "turn", {
      queue: [
        { key: "user:alex", neverDrawn: true },
        { key: "user:jo", neverDrawn: false },
        { key: "user:sam", neverDrawn: false },
      ],
    });
    renderStage({ methodId: "rotation", preview: preview("rotation", "turn"), previewAt: 0, reveal, resultAt: 0 });

    for (let elapsed = 0; elapsed < 1600; elapsed += 50) {
      await advance(50);
      expect(document.querySelector(".draw-reveal-card.is-active")).toBeNull();
    }
    expect(stage()).toHaveAttribute("data-phase", "lineup");
    const tickets = Array.from(document.querySelectorAll(".draw-reveal-card.is-ticket"));
    expect(tickets).toHaveLength(3);
    const byX = [...tickets].sort((a, b) => {
      const x = (node) => Number(/translate\(([-\d.]+)px/.exec(node.style.transform)[1]);
      return x(a) - x(b);
    });
    expect(byX.map((node) => node.textContent)).toEqual(["AlexNever drawn", "Jo2nd in line", "Sam3rd in line"]);
    expect(document.querySelector(".draw-reveal-axis")).toHaveTextContent("Waited longest");

    await advance(600);
    expect(stage()).toHaveAttribute("data-phase", "turn");
    expect(cardTexts(".draw-reveal-card.is-chosen")).toEqual(["AlexNever drawn"]);
    expect(stage()).toHaveTextContent("Alex's turn");
  });

  it("raises title-first as one crowd with no names, then plucks one slip", async () => {
    const reveal = { methodId: "title_first", person: null, title: { mode: "random", scope: "bowl", count: 14 } };
    renderStage({
      methodId: "title_first",
      preview: { methodId: "title_first", stage: "bowl", mode: "random", people: [], sharedCount: 0, total: 14 },
      previewAt: 0,
      reveal,
      resultAt: 0,
      title: "Paddington 2",
    });
    await advance(1000);
    expect(document.querySelector(".draw-reveal-card")).toBeNull();
    expect(document.querySelector(".draw-reveal-count")).toHaveTextContent("14 movies");
    expect(document.querySelectorAll(".draw-reveal-slip")).toHaveLength(14);

    await advance(1900);
    expect(stage()).toHaveAttribute("data-phase", "pluck");
    expect(document.querySelectorAll(".draw-reveal-slip.is-lit")).toHaveLength(1);
    expect(stage()).toHaveTextContent("1 of 14 movies in the bowl");

    await advance(500);
    expect(document.querySelector(".draw-reveal-hero-title")).toHaveTextContent("Paddington 2");
  });

  it("marks a pinned pick and lifts it without fanning the pile", async () => {
    const reveal = {
      methodId: "person_first",
      person: { mode: "random", people, chosenKey: "user:sam", chosenLabel: "Sam" },
      title: { mode: "pinned", scope: "person", personLabel: "Sam", count: 3 },
    };
    renderStage({ methodId: "person_first", preview: preview("person_first"), previewAt: 0, reveal, resultAt: 0 });
    await advance(1000);
    expect(document.querySelectorAll(".draw-reveal-pin")).toHaveLength(1);

    await advance(2350);
    expect(stage()).toHaveAttribute("data-phase", "pinlift");
    expect(stage()).toHaveTextContent("Sam's pinned movie");
  });

  it("folds a long roster into a +N pile and names the person when that pile is drawn", async () => {
    const roster = Array.from({ length: 10 }, (_, index) => ({ key: `user:${index}`, label: `P${index}`, count: 1 }));
    const reveal = {
      methodId: "person_first",
      person: { mode: "random", people: roster, chosenKey: "user:9", chosenLabel: "P9" },
      title: { mode: "random", scope: "person", personLabel: "P9", count: 1 },
    };
    renderStage({ methodId: "person_first", preview: preview("person_first", "random", roster), previewAt: 0, reveal, resultAt: 0 });
    await advance(1000);
    expect(cardTexts()).toHaveLength(8);
    expect(cardTexts().at(-1)).toBe("+3");

    await advance(1900);
    expect(cardTexts(".draw-reveal-card.is-chosen")).toEqual(["P9"]);
  });

  it("starts from the dashboard's bowl and lifts it to the stage", async () => {
    renderStage({ originRect: { left: 10, top: 20, width: 300, height: 100 } });
    const bowl = document.querySelector(".draw-reveal-bowl");
    expect(bowl.style.left).toBe("110px");
    expect(bowl.style.width).toBe("100px");
    await advance(20);
    expect(bowl.style.width).not.toBe("100px");
    expect(stage()).toHaveClass("is-entered");
  });

  it("reports each phase so the screen reader can follow it", async () => {
    const onPhaseChange = vi.fn();
    renderStage({ onPhaseChange });
    await advance(500);
    expect(onPhaseChange).toHaveBeenCalledWith("gather");
    expect(onPhaseChange).toHaveBeenCalledWith("rise");
  });
});
