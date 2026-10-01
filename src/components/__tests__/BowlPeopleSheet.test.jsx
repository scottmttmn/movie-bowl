import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BowlPeopleSheet from "../BowlPeopleSheet";

const ROWS = [
  { key: "user:u1", name: "Alex", initial: "A", count: 2, isOwner: true, isYou: true, isLeftOut: false },
  { key: "user:u2", name: "Sam", initial: "S", count: 0, isOwner: false, isYou: false, isLeftOut: true },
];
const INVITES = [{ id: "i1", invited_email: "jo@example.com" }];

function renderSheet(props = {}) {
  const handlers = { onClose: vi.fn(), onInvite: vi.fn() };
  render(<BowlPeopleSheet rows={ROWS} invites={INVITES} memberCount={2} {...handlers} {...props} />);
  return handlers;
}

describe("BowlPeopleSheet", () => {
  afterEach(cleanup);

  it("gives the owner pending invitations and the way to invite more", () => {
    const { onInvite } = renderSheet({ isOwner: true });

    expect(screen.getByRole("dialog")).toHaveTextContent(/^2/);
    expect(screen.getByRole("listitem", { name: "Alex (you), owner: 2 movies in the draw" })).toBeInTheDocument();
    expect(screen.getByText("jo@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invite people" }));
    expect(onInvite).toHaveBeenCalled();
  });

  it("shows a member the people but not the invitations, which only the owner can send", () => {
    renderSheet({ isOwner: false });

    expect(screen.getByRole("listitem", { name: "Sam: 0 movies in the draw" })).toBeInTheDocument();
    expect(screen.queryByText("jo@example.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeInTheDocument();
  });

  it("dims the person the filters left out and counts who is still in the draw", () => {
    renderSheet({ showLeftOut: true, reach: { totalCount: 2, reachedCount: 1 } });

    expect(screen.getByRole("heading")).toHaveTextContent("1/2 people have a movie in tonight's draw");
    const sam = screen.getByRole("listitem", { name: "Sam: 0 movies in the draw, left out by tonight's filters" });
    expect(sam).toHaveAttribute("data-left-out", "true");
    expect(screen.getByRole("listitem", { name: /^Alex/ })).not.toHaveAttribute("data-left-out");
  });

  it("does not mark anyone left out where the draw does not pick people", () => {
    renderSheet({ showLeftOut: false, reach: { totalCount: 2, reachedCount: 1 } });

    expect(screen.getByRole("heading")).toHaveTextContent(/^2/);
    expect(within(screen.getByRole("list")).getByRole("listitem", { name: "Sam: 0 movies in the draw" }))
      .not.toHaveAttribute("data-left-out");
  });

  it("takes focus, keeps it, closes on Escape and hands focus back", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const handlers = { onClose: vi.fn(), onInvite: vi.fn() };
    const { rerender } = render(<BowlPeopleSheet rows={ROWS} invites={INVITES} memberCount={2} isOwner {...handlers} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);

    rerender(<div />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("says so when the people cannot be read, and still closes", () => {
    const { onClose } = renderSheet({ rows: [], status: "error" });

    expect(screen.getByText(/couldn't load who is in this bowl/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
