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
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 130 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: window.innerHeight - 10 });
      act(() => vi.advanceTimersByTime(100));
      expect(scrollBy).toHaveBeenCalled();
      fireEvent.pointerUp(handle, { pointerId: 1 });
      const calls = scrollBy.mock.calls.length;
      act(() => vi.advanceTimersByTime(100));
      expect(scrollBy.mock.calls.length).toBe(calls);
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
