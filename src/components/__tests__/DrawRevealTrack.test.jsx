import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DrawRevealTrack from "../DrawRevealTrack";
import { DRAW_REVEAL_PERSON_MS } from "../../utils/drawReveal";
import { getDrawMethod } from "../../utils/drawMethods";

const people = [
  { key: "user:sam", label: "Sam" },
  { key: "user:alex", label: "Alex" },
  { key: "user:jo", label: "Jo" },
];

function personReveal(mode, methodId) {
  return {
    methodId,
    person: { mode, people, chosenKey: "user:alex", chosenLabel: "Alex" },
    title: { mode: "random", scope: "person", personLabel: "Alex", count: 3 },
  };
}

function track() {
  return document.querySelector(".draw-reveal-track");
}

function chosenNames() {
  return Array.from(document.querySelectorAll(".draw-reveal-person.is-chosen")).map((node) => node.textContent);
}

describe("DrawRevealTrack", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("says what the method is doing while the draw is in flight", () => {
    render(<DrawRevealTrack method={getDrawMethod("rotation")} reveal={null} />);
    expect(track()).toHaveAttribute("data-stage", "pending");
    expect(track()).toHaveTextContent("Finding whoever has waited longest…");
    expect(document.querySelector(".draw-reveal-person")).toBeNull();
  });

  it("sweeps person-first along the row and lands on the person who was drawn", () => {
    render(<DrawRevealTrack method={getDrawMethod("person_first")} reveal={personReveal("random", "person_first")} />);
    expect(track()).toHaveAttribute("data-stage", "person");

    const seen = new Set();
    for (let elapsed = 0; elapsed < DRAW_REVEAL_PERSON_MS; elapsed += 20) {
      act(() => vi.advanceTimersByTime(20));
      const active = document.querySelector(".draw-reveal-person.is-active");
      if (active) seen.add(active.textContent);
    }

    // Everyone was passed over at least once, so the landing reads as a pick.
    expect(seen).toEqual(new Set(["Sam", "Alex", "Jo"]));
    expect(chosenNames()).toEqual(["Alex"]);
    expect(track()).toHaveAttribute("data-stage", "landed");
    expect(track()).toHaveTextContent("Alex, at random");
  });

  it("steps rotation's person forward without sweeping past anyone", () => {
    render(<DrawRevealTrack method={getDrawMethod("rotation")} reveal={personReveal("turn", "rotation")} />);
    expect(document.querySelector(".draw-reveal-people")).toHaveClass("is-turn");

    const seen = new Set();
    for (let elapsed = 0; elapsed < DRAW_REVEAL_PERSON_MS; elapsed += 20) {
      act(() => vi.advanceTimersByTime(20));
      const active = document.querySelector(".draw-reveal-person.is-active");
      if (active) seen.add(active.textContent);
    }

    expect(seen).toEqual(new Set(["Alex"]));
    expect(track()).toHaveTextContent("Alex's turn");
  });

  it("adds the title stage once the title is on the slip", () => {
    const reveal = personReveal("random", "person_first");
    const { rerender } = render(<DrawRevealTrack method={getDrawMethod("person_first")} reveal={reveal} />);
    act(() => vi.advanceTimersByTime(DRAW_REVEAL_PERSON_MS));
    rerender(<DrawRevealTrack method={getDrawMethod("person_first")} reveal={reveal} titleShown />);
    expect(track()).toHaveTextContent("Alex, at random · 1 of Alex's 3 movies");
  });

  it("shows title-first as one stage with no people at all", () => {
    render(
      <DrawRevealTrack
        method={getDrawMethod("title_first")}
        reveal={{ methodId: "title_first", person: null, title: { mode: "random", scope: "bowl", count: 12 } }}
        titleShown
      />
    );
    expect(document.querySelector(".draw-reveal-person")).toBeNull();
    expect(track()).toHaveTextContent("1 of 12 movies in the bowl");
  });

  it("keeps the chosen person visible when the roster is trimmed", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ key: `user:${index}`, label: `P${index}` }));
    render(
      <DrawRevealTrack
        method={getDrawMethod("person_first")}
        reveal={{
          methodId: "person_first",
          person: { mode: "random", people: many, chosenKey: "user:11", chosenLabel: "P11" },
          title: { mode: "random", scope: "person", personLabel: "P11", count: 1 },
        }}
      />
    );
    act(() => vi.advanceTimersByTime(DRAW_REVEAL_PERSON_MS));
    expect(document.querySelectorAll(".draw-reveal-person:not(.is-more)")).toHaveLength(8);
    expect(document.querySelector(".draw-reveal-person.is-more")).toHaveTextContent("+4");
    expect(chosenNames()).toEqual(["P11"]);
  });
});
