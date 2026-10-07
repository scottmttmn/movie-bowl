import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StreamingServiceRanking from "../StreamingServiceRanking";

// jsdom has no PointerEvent, so fireEvent would build a plain Event and drop
// clientY. A MouseEvent carries it, which is all the ranking reads.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  };
}

const ROW_HEIGHT = 60;
const ROW_PITCH = 68;

// jsdom has no layout, so give each row the box a real list would have.
function layOutRows() {
  screen.getAllByRole("listitem").forEach((row, index) => {
    row.getBoundingClientRect = () => {
      const top = 100 + index * ROW_PITCH;
      return { top, bottom: top + ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 300, width: 300 };
    };
  });
}

function renderRanking(services, overrides = {}) {
  const props = { services, onReorder: vi.fn(), onRemove: vi.fn(), ...overrides };
  const view = render(<StreamingServiceRanking {...props} />);
  layOutRows();
  return { ...view, props };
}

function grip(service) {
  return screen.getByRole("button", { name: new RegExp(`^Reorder ${service.replace("+", "\\+")},`) });
}

function rankShown(service) {
  const row = screen.getAllByRole("listitem").find((item) => item.textContent.includes(service));
  return row.textContent.match(/^\d+/)[0];
}

afterEach(cleanup);

describe("StreamingServiceRanking", () => {
  it("drags a service to a new position and re-ranks while it is held", () => {
    const { props } = renderRanking(["Netflix", "Max", "Hulu", "Prime Video"]);
    const handle = grip("Prime Video");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 330, pointerType: "touch" });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 330 - ROW_PITCH * 2 });

    expect(rankShown("Prime Video")).toBe("2");
    expect(rankShown("Max")).toBe("3");
    expect(rankShown("Hulu")).toBe("4");
    expect(props.onReorder).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 330 - ROW_PITCH * 2 });
    expect(props.onReorder).toHaveBeenCalledWith(["Netflix", "Prime Video", "Max", "Hulu"]);
    expect(screen.getByText("Prime Video moved to position 2 of 4.")).toBeInTheDocument();
  });

  it("keeps a row dragged past either end of the list at that end", () => {
    const { props } = renderRanking(["Netflix", "Max", "Hulu"]);
    const handle = grip("Max");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 2000 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 2000 });

    expect(props.onReorder).toHaveBeenCalledWith(["Netflix", "Hulu", "Max"]);
  });

  it("leaves the order alone when a row is put back where it started or the drag is cancelled", () => {
    const { props } = renderRanking(["Netflix", "Max", "Hulu"]);
    const handle = grip("Max");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 210 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 210 });

    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 400 });
    expect(rankShown("Max")).toBe("3");
    // The browser cancels a gesture it takes over, so nothing the finger did counts.
    fireEvent.pointerCancel(handle, { pointerId: 2 });
    expect(rankShown("Max")).toBe("2");
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("lets a taller wrapped row reach a shorter row at either end", () => {
    const { props } = renderRanking(["Netflix", "The Criterion Channel", "Max"]);
    const heights = [60, 104, 60];
    const tops = [100, 168, 280];
    screen.getAllByRole("listitem").forEach((row, index) => {
      row.getBoundingClientRect = () => ({
        top: tops[index], bottom: tops[index] + heights[index], height: heights[index], left: 0, right: 300, width: 300,
      });
    });
    const handle = grip("The Criterion Channel");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 220 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: -500 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(props.onReorder).toHaveBeenLastCalledWith(["The Criterion Channel", "Netflix", "Max"]);

    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 220 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 2000 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(props.onReorder).toHaveBeenLastCalledWith(["Netflix", "Max", "The Criterion Channel"]);
  });

  it("leaves focus alone after a key that cannot move the row", () => {
    const onReorder = vi.fn();
    const { rerender } = renderRanking(["Netflix", "Max"], { onReorder });

    fireEvent.keyDown(grip("Netflix"), { key: "ArrowUp" });
    fireEvent.keyDown(grip("Max"), { key: "End" });
    expect(onReorder).not.toHaveBeenCalled();

    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    rerender(<StreamingServiceRanking services={["Netflix", "Max", "Hulu"]} onReorder={onReorder} onRemove={vi.fn()} />);
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
  });

  it("keeps a drag with the finger that started it", () => {
    const { props } = renderRanking(["Netflix", "Max", "Hulu"]);

    fireEvent.pointerDown(grip("Hulu"), { pointerId: 1, button: 0, clientY: 270, pointerType: "touch" });
    fireEvent.pointerDown(grip("Netflix"), { pointerId: 2, button: 0, clientY: 130, pointerType: "touch" });
    fireEvent.pointerMove(grip("Netflix"), { pointerId: 2, clientY: 400 });
    fireEvent.pointerUp(grip("Netflix"), { pointerId: 2 });
    expect(props.onReorder).not.toHaveBeenCalled();
    expect(rankShown("Hulu")).toBe("3");

    fireEvent.pointerMove(grip("Hulu"), { pointerId: 1, clientY: 0 });
    fireEvent.pointerUp(grip("Hulu"), { pointerId: 1 });
    expect(props.onReorder).toHaveBeenCalledTimes(1);
    expect(props.onReorder).toHaveBeenCalledWith(["Hulu", "Netflix", "Max"]);
  });

  it("lets go of a held row that is removed elsewhere, or loses its pointer", () => {
    const onReorder = vi.fn();
    const { rerender } = renderRanking(["Netflix", "Max", "Hulu"], { onReorder });

    fireEvent.pointerDown(grip("Hulu"), { pointerId: 1, button: 0, clientY: 270, pointerType: "touch" });
    rerender(<StreamingServiceRanking services={["Netflix", "Max"]} onReorder={onReorder} onRemove={vi.fn()} />);
    layOutRows();
    expect(screen.getByRole("button", { name: "Remove Max" })).toBeEnabled();

    fireEvent.pointerDown(grip("Max"), { pointerId: 2, button: 0, clientY: 200, pointerType: "touch" });
    fireEvent.lostPointerCapture(grip("Max"), { pointerId: 2 });
    fireEvent.pointerDown(grip("Max"), { pointerId: 3, button: 0, clientY: 200, pointerType: "touch" });
    fireEvent.pointerMove(grip("Max"), { pointerId: 3, clientY: 0 });
    fireEvent.pointerUp(grip("Max"), { pointerId: 3 });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["Max", "Netflix"]);
  });

  it("lets go when another service is removed mid-drag, rather than dropping into the old list", () => {
    const onReorder = vi.fn();
    const { rerender } = renderRanking(["Netflix", "Max", "Hulu", "Prime Video"], { onReorder });

    // Two places down: a position the shorter list still has.
    fireEvent.pointerDown(grip("Netflix"), { pointerId: 1, button: 0, clientY: 130, pointerType: "touch" });
    fireEvent.pointerMove(grip("Netflix"), { pointerId: 1, clientY: 130 + ROW_PITCH * 2 });
    rerender(<StreamingServiceRanking services={["Netflix", "Max", "Hulu"]} onReorder={onReorder} onRemove={vi.fn()} />);
    layOutRows();
    fireEvent.pointerUp(grip("Netflix"), { pointerId: 1 });
    expect(onReorder).not.toHaveBeenCalled();
    expect(rankShown("Netflix")).toBe("1");

    // The same list rendered again is no change, and the drag carries on.
    fireEvent.pointerDown(grip("Netflix"), { pointerId: 2, button: 0, clientY: 130, pointerType: "touch" });
    rerender(<StreamingServiceRanking services={["Netflix", "Max", "Hulu"]} onReorder={onReorder} onRemove={vi.fn()} />);
    fireEvent.pointerMove(grip("Netflix"), { pointerId: 2, clientY: 400 });
    fireEvent.pointerUp(grip("Netflix"), { pointerId: 2 });
    expect(onReorder).toHaveBeenCalledWith(["Max", "Hulu", "Netflix"]);
  });

  it("opens the moves when the grip is activated, for anyone who cannot drag or use arrow keys", () => {
    const onReorder = vi.fn();
    const { rerender } = renderRanking(["Netflix", "Max", "Hulu", "Prime Video"], { onReorder });

    fireEvent.click(grip("Hulu"));
    expect(grip("Hulu")).toHaveAttribute("aria-expanded", "true");
    const moves = screen.getByRole("group", { name: "Move Hulu" });
    expect(within(moves).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Move Hulu to the top",
      "Move Hulu up",
      "Move Hulu to the bottom",
    ]);

    fireEvent.click(within(moves).getByRole("button", { name: "Move Hulu up" }));
    expect(onReorder).toHaveBeenCalledWith(["Netflix", "Hulu", "Max", "Prime Video"]);
    expect(screen.queryByRole("group", { name: "Move Hulu" })).toBeNull();
    rerender(<StreamingServiceRanking services={["Netflix", "Hulu", "Max", "Prime Video"]} onReorder={onReorder} onRemove={vi.fn()} />);
    expect(grip("Hulu")).toHaveFocus();

    // Escape closes it and hands focus back to the grip.
    fireEvent.click(grip("Max"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Max to the top" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Move Max" })).toBeNull();
    expect(grip("Max")).toHaveFocus();
  });

  it("does not open the moves at the end of a real drag", () => {
    renderRanking(["Netflix", "Max", "Hulu"]);
    const handle = grip("Hulu");
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 270 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 250 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 250 });
    fireEvent.click(handle);
    expect(screen.queryByRole("group", { name: "Move Hulu" })).toBeNull();

    // A tap that never moved is an activation.
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 270 });
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 270 });
    fireEvent.click(handle);
    expect(screen.getByRole("group", { name: "Move Hulu" })).toBeInTheDocument();
  });

  it("ignores a secondary mouse button", () => {
    const { props } = renderRanking(["Netflix", "Max"]);
    const handle = grip("Max");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 2, clientY: 200, pointerType: "mouse" });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 0 });

    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("moves with the arrow keys, Home and End, and keeps focus on the grip", () => {
    const services = ["Netflix", "Max", "Hulu"];
    const onReorder = vi.fn();
    const { rerender } = renderRanking(services, { onReorder });

    grip("Hulu").focus();
    fireEvent.keyDown(grip("Hulu"), { key: "ArrowUp" });
    expect(onReorder).toHaveBeenLastCalledWith(["Netflix", "Hulu", "Max"]);
    rerender(<StreamingServiceRanking services={["Netflix", "Hulu", "Max"]} onReorder={onReorder} onRemove={vi.fn()} />);
    expect(grip("Hulu")).toHaveFocus();
    expect(grip("Hulu")).toHaveAccessibleName("Reorder Hulu, position 2 of 3");

    fireEvent.keyDown(grip("Hulu"), { key: "Home" });
    expect(onReorder).toHaveBeenLastCalledWith(["Hulu", "Netflix", "Max"]);

    fireEvent.keyDown(grip("Max"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("Netflix"), { key: "Enter" });
    expect(onReorder).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(grip("Netflix"), { key: "End" });
    expect(onReorder).toHaveBeenLastCalledWith(["Hulu", "Max", "Netflix"]);
  });

  it("scrolls the page while a held row sits at the bottom edge", () => {
    vi.useFakeTimers();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation((_, y) => {
      window.scrollY += y;
    });
    try {
      window.scrollY = 0;
      renderRanking(["Netflix", "Max", "Hulu"]);
      const handle = grip("Netflix");
      // Held near the bottom of the window with room left to travel down.
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: window.innerHeight - 120 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: window.innerHeight - 10 });
      act(() => vi.advanceTimersByTime(100));
      expect(scrollBy).toHaveBeenCalled();
      fireEvent.pointerUp(handle, { pointerId: 1 });
      const calls = scrollBy.mock.calls.length;
      act(() => vi.advanceTimersByTime(100));
      expect(scrollBy.mock.calls.length).toBe(calls);

      // A press held still in the edge zone is not a drag yet.
      scrollBy.mockClear();
      const still = grip("Max");
      fireEvent.pointerDown(still, { pointerId: 3, button: 0, clientY: window.innerHeight - 10 });
      act(() => vi.advanceTimersByTime(500));
      expect(scrollBy).not.toHaveBeenCalled();
      fireEvent.pointerUp(still, { pointerId: 3 });

      // A row already at the bottom of the list leaves the page where it is.
      scrollBy.mockClear();
      const last = grip("Hulu");
      fireEvent.pointerDown(last, { pointerId: 2, button: 0, clientY: 270 });
      fireEvent.pointerMove(last, { pointerId: 2, clientY: window.innerHeight - 10 });
      act(() => vi.advanceTimersByTime(100));
      expect(scrollBy).not.toHaveBeenCalled();
      fireEvent.pointerUp(last, { pointerId: 2 });
    } finally {
      scrollBy.mockRestore();
      window.scrollY = 0;
      vi.useRealTimers();
    }
  });

  it("removes a service from its row", () => {
    const { props } = renderRanking(["Netflix", "Max"]);
    fireEvent.click(within(screen.getAllByRole("listitem")[1]).getByRole("button", { name: "Remove Max" }));
    expect(props.onRemove).toHaveBeenCalledWith("Max");
  });
});
