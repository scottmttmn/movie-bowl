import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddMovieButton from "../AddMovieButton";
import BowlIllustration from "../BowlIllustration";
import BowlCard from "../BowlCard";
import DrawMethodDisclosure from "../DrawMethodDisclosure";
import DrawButton from "../DrawButton";
import NewBowlButton from "../NewBowlButton";
import RemainingCount from "../RemainingCount";

describe("button and card components", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires AddMovieButton click", () => {
    const onClick = vi.fn();
    render(<AddMovieButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ add movie/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires DrawButton click", () => {
    const onClick = vi.fn();
    render(<DrawButton onClick={onClick} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /draw movie/i }));
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

  it("reveals how the bowl picks without showing odds by default", () => {
    render(<DrawMethodDisclosure />);

    const summary = screen.getByText("How this bowl picks");
    const details = summary.closest("details");

    expect(details).not.toHaveAttribute("open");
    expect(screen.queryByText(/draw odds/i)).not.toBeInTheDocument();

    fireEvent.click(summary);

    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/the bowl picks a person first/i)).toBeInTheDocument();
  });

  it("renders RemainingCount", () => {
    render(<RemainingCount count={7} />);
    expect(screen.getByText("Remaining:")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
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
