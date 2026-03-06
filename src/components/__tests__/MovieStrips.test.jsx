import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyAddedMoviesStrip from "../MyAddedMoviesStrip";
import QueueMoviesStrip from "../QueueMoviesStrip";
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

  it("shows syncing state and disables actions for optimistic rows", () => {
    const onViewMovie = vi.fn();
    const onDeleteMovie = vi.fn();
    const movies = [
      {
        id: "temp:1",
        local_temp_id: "temp:1",
        local_status: "syncing",
        title: "Movie Pending",
        added_at: "2026-03-06T00:00:00.000Z",
      },
    ];

    render(<MyAddedMoviesStrip movies={movies} onViewMovie={onViewMovie} onDeleteMovie={onDeleteMovie} />);

    expect(screen.getByText(/syncing\.\.\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /details/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();
  });

  it("renders QueueMoviesStrip cards and forwards detail/remove actions", () => {
    const onViewMovie = vi.fn();
    const onRemoveMovie = vi.fn();
    const movies = [
      { id: "q1", title: "Movie Pending", poster_path: "/pending.jpg", queued_at: "2026-03-06T00:00:00.000Z" },
      { id: "q2", title: "Wildcard Queue", tmdb_id: null, poster_path: null },
    ];

    render(<QueueMoviesStrip movies={movies} onViewMovie={onViewMovie} onRemoveMovie={onRemoveMovie} />);

    fireEvent.click(screen.getAllByRole("button", { name: /details/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);

    expect(screen.getByText(/Queued:/i)).toBeInTheDocument();
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
    expect(onViewMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "q1" }));
    expect(onRemoveMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "q1" }));
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
