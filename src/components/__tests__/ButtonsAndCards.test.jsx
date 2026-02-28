import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddMovieButton from "../AddMovieButton";
import BowlCard from "../BowlCard";
import ContributionStats from "../ContributionStats";
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

  it("renders ContributionStats", () => {
    render(<ContributionStats stats={[{ member: "me@example.com", totalAdded: 3 }]} />);
    expect(screen.getByText("Contribution Stats")).toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders RemainingCount", () => {
    render(<RemainingCount count={7} />);
    expect(screen.getByText("Remaining:")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
