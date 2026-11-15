import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MovieThumbs, { BowlThumbs, RatingMark } from "../MovieThumbs";

afterEach(cleanup);

describe("MovieThumbs", () => {
  it("offers the four thumbs by name, with the pick pressed", () => {
    render(<MovieThumbs title="Paris, Texas" value={1} onChange={() => {}} />);

    const group = screen.getByRole("group", { name: "Your rating for Paris, Texas" });
    const names = within(group).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Strong dislike", "Dislike", "Like", "Love"]);
    expect(within(group).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "false");
  });

  it("picks with one tap, and clears when the pick is tapped again", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MovieThumbs title="Local Hero" value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(onChange).toHaveBeenLastCalledWith(2);

    rerender(<MovieThumbs title="Local Hero" value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("does not open the card it sits on", () => {
    const onCard = vi.fn();
    render(
      <div onClick={onCard}>
        <MovieThumbs title="Ran" value={null} onChange={() => {}} />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Dislike" }));
    expect(onCard).not.toHaveBeenCalled();
  });
});

describe("BowlThumbs", () => {
  const others = [
    { userId: "robin", name: "Robin", rating: null },
    { userId: "casey", name: "Casey", rating: null },
  ];

  it("keeps the bowl face down until you rate", () => {
    render(<BowlThumbs title="Paris, Texas" value={null} onChange={() => {}} others={others} />);

    expect(screen.getByRole("img", { name: "2 in this bowl rated it. Rate to see." })).toBeInTheDocument();
    expect(screen.getByTitle("Robin")).toBeInTheDocument();
  });

  it("turns them over into the thumb each picked once you have", () => {
    render(
      <BowlThumbs
        title="Paris, Texas"
        value={2}
        onChange={() => {}}
        me={{ userId: "me", name: "Scott" }}
        others={[
          { userId: "robin", name: "Robin", rating: 2 },
          { userId: "casey", name: "Casey", rating: -1 },
        ]}
      />
    );

    expect(screen.queryByRole("img", { name: /Rate to see/ })).not.toBeInTheDocument();
    expect(screen.getByTitle("You")).toBeInTheDocument();
    expect(screen.getByTitle("Robin")).toBeInTheDocument();
    expect(screen.getByTitle("Casey")).toBeInTheDocument();
  });
});

describe("RatingMark", () => {
  it("names whose thumb it is, and shows nothing when unrated", () => {
    const { rerender, container } = render(<RatingMark value={-2} />);
    expect(screen.getByRole("img", { name: "You rated it: Strong dislike" })).toBeInTheDocument();

    rerender(<RatingMark value={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
