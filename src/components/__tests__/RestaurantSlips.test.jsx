import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MovieActionCard from "../MovieActionCard";
import WatchedMoviesStrip from "../WatchedMoviesStrip";
import { BowlKindProvider } from "../../context/BowlKindContext";

const slip = { id: "r1", tmdb_id: null, title: "La Rana Bistro", cuisine: "Mediterranean", added_by: "u1" };

afterEach(cleanup);

describe("restaurant slips", () => {
  it("shows a restaurant as its slip, without the Custom mark a hand-added movie gets", () => {
    render(<BowlKindProvider value="restaurants"><MovieActionCard movie={slip} /></BowlKindProvider>);
    expect(screen.getByRole("button", { name: "Details for La Rana Bistro" })).toHaveTextContent("Mediterranean");
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("leaves a movie card as it was outside a restaurant bowl", () => {
    render(<MovieActionCard movie={{ ...slip, cuisine: undefined, title: "Something with Adam Sandler" }} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("names the drawn list Been there", () => {
    render(<BowlKindProvider value="restaurants"><WatchedMoviesStrip movies={[{ ...slip, drawn_at: "2026-11-08" }]} /></BowlKindProvider>);
    expect(screen.getByRole("heading", { name: /Been there/ })).toBeInTheDocument();
    expect(screen.queryByText(/watched/i)).not.toBeInTheDocument();
  });
});
