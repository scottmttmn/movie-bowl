import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddMovieButton from "../AddMovieButton";
import BowlIllustration from "../BowlIllustration";
import BowlCard from "../BowlCard";
import NewBowlButton from "../NewBowlButton";

describe("button and card components", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires AddMovieButton click", () => {
    const onClick = vi.fn();
    render(<AddMovieButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /add to this bowl/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires NewBowlButton click", () => {
    const onClick = vi.fn();
    render(<NewBowlButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders BowlCard and forwards selection", () => {
    const onSelect = vi.fn();
    render(
      <BowlCard
        bowl={{ id: "b1", name: "Friday Bowl", remainingCount: 4, memberCount: 2, role: "Owner" }}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Friday Bowl, 4 titles to draw, 2 members" }));
    expect(onSelect).toHaveBeenCalledWith("b1");
    // The section heading says Owner; the row does not repeat it.
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("marks the home bowl without offering a control to move it", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<BowlCard bowl={{ id: "b1", name: "Friday Night" }} onSelect={onSelect} />);
    expect(screen.queryByRole("button", { name: /home bowl/ })).not.toBeInTheDocument();

    rerender(<BowlCard bowl={{ id: "b1", name: "Friday Night" }} onSelect={onSelect} isHome />);
    expect(screen.getByRole("button", { name: "Friday Night, home bowl, 0 titles to draw, 0 members" })).toBeInTheDocument();
    // A home bowl can only be moved, never unset, so nothing here may look like
    // a toggle -- and the card must not gain a second control beside Open.
    expect(document.querySelector("[aria-pressed]")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders BowlIllustration with the draw animation layer", () => {
    const { container } = render(
      <BowlIllustration drawTitle="Paper Moon" isDrawing className="test-class" />
    );
    const stage = container.querySelector(".bowl-illustration-stage");

    expect(stage).toHaveClass("is-drawing");
    expect(stage).toHaveClass("test-class");
    expect(container.querySelector(".bowl-illustration-image")).toBeInTheDocument();
    expect(container.querySelector(".bowl-draw-pop-slip")).toBeInTheDocument();
    expect(container.querySelector(".bowl-draw-pop-fold-left")).toBeInTheDocument();
    expect(container.querySelector(".bowl-draw-pop-fold-right")).toBeInTheDocument();
    expect(container.querySelector(".bowl-draw-pop-title")).toHaveTextContent("Paper Moon");
  });
});
