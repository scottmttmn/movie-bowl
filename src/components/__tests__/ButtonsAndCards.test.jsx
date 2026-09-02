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

    fireEvent.click(screen.getByText("Friday Bowl"));
    expect(onSelect).toHaveBeenCalledWith("b1");
  });

  it("keeps the default star separate from opening the bowl", () => {
    const onSelect = vi.fn(); const onMakeDefault = vi.fn();
    const { container, rerender } = render(<BowlCard bowl={{ id: "b1", name: "Friday Night" }} onSelect={onSelect} onMakeDefault={onMakeDefault} />);
    fireEvent.click(screen.getByRole("button", { name: "Make Friday Night my home bowl" }));
    expect(onMakeDefault).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector("button button")).toBeNull();
    rerender(<BowlCard bowl={{ id: "b1", name: "Friday Night" }} onSelect={onSelect} onMakeDefault={onMakeDefault} isDefault />);
    expect(screen.getByRole("button", { name: "Home bowl: Friday Night" })).toHaveAttribute("aria-pressed", "true");
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
