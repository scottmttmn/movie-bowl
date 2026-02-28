import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyAddedMoviesStrip from "../MyAddedMoviesStrip";
import WatchedMovieCard from "../WatchedMovieCard";
import WatchedMoviesStrip from "../WatchedMoviesStrip";

describe("movie strip components", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders MyAddedMoviesStrip and forwards detail/delete actions", () => {
    const onViewMovie = vi.fn();
    const onDeleteMovie = vi.fn();
    const movies = [
      { id: "1", title: "Movie One", poster_path: "/one.jpg", added_at: "2026-02-23T00:00:00.000Z" },
      { id: "2", title: "Wildcard", tmdb_id: null, poster_path: null },
    ];

    render(<MyAddedMoviesStrip movies={movies} onViewMovie={onViewMovie} onDeleteMovie={onDeleteMovie} />);

    fireEvent.click(screen.getAllByRole("button", { name: /details/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(screen.getByText("My Adds")).toBeInTheDocument();
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
    expect(onViewMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    expect(onDeleteMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });

  it("renders WatchedMovieCard and forwards click", () => {
    const onClick = vi.fn();
    render(<WatchedMovieCard movie={{ id: "w1", title: "Arrival", poster_path: "/arrival.jpg" }} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: /arrival/i }));
    expect(screen.getByAltText("Arrival")).toBeInTheDocument();
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
  });

  it("shows custom badge on watched custom entries", () => {
    render(<WatchedMovieCard movie={{ id: "w1", title: "Wildcard", tmdb_id: null }} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders WatchedMoviesStrip posters", () => {
    const movies = [
      { id: "1", title: "Movie One", poster_path: "/one.jpg" },
      { id: "2", title: "Movie Two", poster_path: "/two.jpg" },
    ];
    render(<WatchedMoviesStrip movies={movies} />);
    expect(screen.getByAltText("Movie One")).toBeInTheDocument();
    expect(screen.getByAltText("Movie Two")).toBeInTheDocument();
  });
});
