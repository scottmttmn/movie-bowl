import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RemoveFromBowlsModal from "../RemoveFromBowlsModal";

const twoBowls = [
  { id: "slip-1", bowlId: "bowl-1", bowlName: "Family Bowl" },
  { id: "slip-2", bowlId: "bowl-2", bowlName: "Friday Crew" },
];

describe("RemoveFromBowlsModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("states the action on both the checkbox and the button so a tick reads one way", () => {
    render(<RemoveFromBowlsModal title="Dune" matches={twoBowls} />);

    expect(screen.getByRole("checkbox", { name: "Remove from Family Bowl" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Remove from Friday Crew" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Remove from 2 bowls" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave it in every bowl" })).toBeInTheDocument();
  });

  it("names the bowl on the button and drops the checkbox for a single match", () => {
    render(<RemoveFromBowlsModal title="Dune" matches={[twoBowls[0]]} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from Family Bowl" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Leave it in the bowl" })).toBeInTheDocument();
  });

  it("explains the empty selection instead of leaving a dead button", () => {
    render(<RemoveFromBowlsModal title="Dune" matches={twoBowls} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Remove from Family Bowl" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Remove from Friday Crew" }));

    expect(screen.getByRole("button", { name: "Remove from 0 bowls" })).toBeDisabled();
    expect(
      screen.getByText("Nothing ticked — tick a bowl to remove it from, or leave it in every bowl.")
    ).toBeInTheDocument();
  });

  it("says the removal is bowl-wide and the history entry is unaffected", () => {
    render(<RemoveFromBowlsModal title="Dune" matches={[twoBowls[0]]} />);

    expect(
      screen.getByText(
        "This takes the movie out of the bowl for everyone in it. Your watch history entry stays either way."
      )
    ).toBeInTheDocument();
  });

  it("passes only the ticked slip ids to the caller", () => {
    const onRemove = vi.fn();
    render(<RemoveFromBowlsModal title="Dune" matches={twoBowls} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Remove from Family Bowl" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from 1 bowl" }));

    expect(onRemove).toHaveBeenCalledWith(["slip-2"]);
  });

  it("locks both actions while the removal is in flight", () => {
    const onKeep = vi.fn();
    render(
      <RemoveFromBowlsModal title="Dune" matches={twoBowls} onKeep={onKeep} isRemoving />
    );

    expect(screen.getByRole("button", { name: "Removing..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Leave it in every bowl" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Remove from Family Bowl" })).toBeDisabled();
  });
});
