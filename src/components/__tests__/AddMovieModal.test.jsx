import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddMovieModal from "../AddMovieModal";

describe("AddMovieModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders add mode with search input", () => {
    render(<AddMovieModal onClose={vi.fn()} onAddMovie={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Add a movie")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
  });

  it("renders detail mode with movie metadata", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      poster_path: "/abc.jpg",
      streamingProviders: ["Netflix", "Prime Video"],
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Dune (2021)")).toBeInTheDocument();
    expect(screen.getByText("Runtime: 155 minutes")).toBeInTheDocument();
    expect(screen.getByText("Available on")).toBeInTheDocument();
    expect(screen.getByText("Your services")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });

  it("shows custom badge for non-TMDB entries", () => {
    render(
      <AddMovieModal
        movie={{ title: "Wildcard", tmdb_id: null, streamingProviders: [] }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("does not show custom badge for TMDB search movies using id", () => {
    render(
      <AddMovieModal
        movie={{ id: 42, title: "The Answer", release_date: "2024-01-01", runtime: 110, streamingProviders: [] }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("renders detail primary action only when provided", () => {
    const onMove = vi.fn();
    const movie = { title: "Movie A", release_date: "2024-01-01", runtime: 100, streamingProviders: [] };
    const { rerender } = render(
      <AddMovieModal
        movie={movie}
        onClose={vi.fn()}
        userStreamingServices={[]}
        detailPrimaryActionLabel="Move to Bowl"
        onDetailPrimaryAction={onMove}
      />
    );

    expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument();

    rerender(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={[]} />);
    expect(screen.queryByRole("button", { name: /move to bowl/i })).not.toBeInTheDocument();
  });

  it("closes on escape", () => {
    const onClose = vi.fn();
    render(
      <AddMovieModal
        movie={{ title: "Movie A", release_date: "2024-01-01", runtime: 100, streamingProviders: [] }}
        onClose={onClose}
        userStreamingServices={[]}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
